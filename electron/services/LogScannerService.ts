import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { app } from 'electron';
import { databaseService } from './DatabaseService';

const logger = log.scope('LogScannerService');

interface SessionEvent {
    timestamp: number;
    type: 'join' | 'leave';
    displayName: string;
    userId?: string;
}

export class LogScannerService {
    private isScanning = false;

    /**
     * Scans all standard VRChat log files for historical session data.
     * Imports durations into FriendStats table.
     */
    public async scanAndImportHistory(): Promise<{ processedFiles: number; totalMinutesAdded: number }> {
        if (this.isScanning) throw new Error('Scan already in progress');
        this.isScanning = true;

        let totalMinutes = 0;
        let processedFiles = 0;

        try {
            const logDir = this.getLogDirectory();
            if (!fs.existsSync(logDir)) {
                logger.warn('VRChat log directory not found.');
                return { processedFiles: 0, totalMinutesAdded: 0 };
            }

            const files = fs.readdirSync(logDir)
                .filter(f => f.startsWith('output_log_') && f.endsWith('.txt'))
                .sort(); // Oldest first? Unimportant, but consistent is good.

            logger.info(`Found ${files.length} log files to scan.`);

            // DEDUPLICATION: Get the list of already processed files (Live Sessions)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { logWatcherService } = require('./LogWatcherService');
            const processedSet = logWatcherService.getProcessedFiles(); // We need to expose this

            for (const file of files) {
                if (processedSet.has(file)) {
                    logger.debug(`Skipping ${file} (Already processed by Live Tracking)`);
                    continue;
                }

                const filePath = path.join(logDir, file);
                const minutesAdded = await this.processLogFile(filePath);
                if (minutesAdded > 0) {
                    totalMinutes += minutesAdded;
                }

                // Mark as processed so we don't scan again
                logWatcherService.markFileAsProcessed(file);

                processedFiles++;
            }

            logger.info(`Scan complete. Added ${totalMinutes} minutes from ${processedFiles} files.`);
            return { processedFiles, totalMinutesAdded: totalMinutes };

        } catch (e) {
            logger.error('Scan failed:', e);
            throw e;
        } finally {
            this.isScanning = false;
        }
    }

    private getLogDirectory(): string {
        const appData = app.getPath('appData');
        const localLow = path.join(appData, '..', 'LocalLow');
        return path.join(localLow, 'VRChat', 'VRChat');
    }

    private async processLogFile(filePath: string): Promise<number> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            const sessions = new Map<string, number>(); // displayName -> joinTime
            const durations = new Map<string, number>(); // displayName -> totalDuration

            // User ID mapping if available
            const idMap = new Map<string, string>(); // displayName -> userId

            for (const line of lines) {
                const timestamp = this.extractTimestamp(line);
                if (!timestamp) continue;

                if (line.includes('[Behaviour] OnPlayerJoined')) {
                    const { displayName, userId } = this.parseJoin(line);
                    if (displayName) {
                        sessions.set(displayName, timestamp);
                        if (userId) idMap.set(displayName, userId);
                    }
                } else if (line.includes('[Behaviour] OnPlayerLeft')) {
                    const { displayName, userId } = this.parseLeave(line);
                    if (displayName && sessions.has(displayName)) {
                        const joinTime = sessions.get(displayName)!;
                        const durationMs = timestamp - joinTime;

                        // Sanity check: valid session < 24h
                        if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) {
                            const current = durations.get(displayName) || 0;
                            durations.set(displayName, current + durationMs);
                        }

                        sessions.delete(displayName);
                        if (userId) idMap.set(displayName, userId);
                    }
                }
            }

            // Write results to DB for this file
            // Use the first session timestamp as the approximation for the file date
            // or modify extractTimestamp to get file date? 
            // Better: use `sessions.values().next().value` or just scan for first valid timestamp.
            // Let's assume the first line with a timestamp is close enough.
            let fileTimestamp = Date.now();
            for (const line of lines) {
                const ts = this.extractTimestamp(line);
                if (ts) {
                    fileTimestamp = ts;
                    break;
                }
            }

            return await this.commitDurations(durations, idMap, fileTimestamp);

        } catch (e) {
            logger.error(`Failed to parse log file ${filePath}:`, e);
            return 0;
        }
    }

    private extractTimestamp(line: string): number | null {
        // "2023.10.25 18:00:00 Log        -"
        const parts = line.split(' ');
        if (parts.length < 2) return null;

        try {
            const dateStr = parts[0].replace(/\./g, '-');
            const timeStr = parts[1];
            return new Date(`${dateStr}T${timeStr}`).getTime();
        } catch {
            return null;
        }
    }

    private parseJoin(line: string): { displayName: string; userId?: string } {
        // [Behaviour] OnPlayerJoined Name (usr_xxx)
        // or just Name
        const match = line.match(/OnPlayerJoined\s+(.+)/);
        if (!match) return { displayName: '' };

        let full = match[1].trim();
        let userId: string | undefined;

        const parenIdx = full.lastIndexOf('(');
        if (parenIdx !== -1 && full.endsWith(')')) {
            const possibleId = full.substring(parenIdx + 1, full.length - 1);
            if (possibleId.startsWith('usr_')) {
                userId = possibleId;
                full = full.substring(0, parenIdx).trim();
            }
        }
        return { displayName: full, userId };
    }

    private parseLeave(line: string): { displayName: string; userId?: string } {
        const match = line.match(/OnPlayerLeft\s+(.+)/);
        if (!match) return { displayName: '' };

        // Same logic as join
        let full = match[1].trim();
        let userId: string | undefined;

        const parenIdx = full.lastIndexOf('(');
        if (parenIdx !== -1 && full.endsWith(')')) {
            const possibleId = full.substring(parenIdx + 1, full.length - 1);
            if (possibleId.startsWith('usr_')) {
                userId = possibleId;
                full = full.substring(0, parenIdx).trim();
            }
        }
        return { displayName: full, userId };
    }

    // Updated signature to accept timestamp for "First Seen" backfill
    private async commitDurations(durations: Map<string, number>, idMap: Map<string, string>, logTimestamp: number): Promise<number> {
        let addedMinutes = 0;
        const client = databaseService.getClient();

        // Transaction is safer but might lock DB for too long if huge map.
        // We do sequential upserts for simplicity in this utility script.

        for (const [name, ms] of durations.entries()) {
            const minutes = Math.floor(ms / (1000 * 60));
            if (minutes < 1) continue;

            // We NEED a userId. If we didn't find one in the log for this name, skip.
            // (Old logs might not have userID in text).
            const userId = idMap.get(name);
            if (!userId) continue;

            try {
                // @ts-ignore
                await client.friendStats.upsert({
                    where: { userId },
                    create: {
                        userId,
                        displayName: name,
                        timeSpentMinutes: minutes,
                        encounterCount: 1,
                        lastSeen: new Date(logTimestamp),
                        lastHeartbeat: new Date(0),
                        createdAt: new Date(logTimestamp) // Capture "First Seen" from log date
                    },
                    update: {
                        timeSpentMinutes: { increment: minutes },
                        encounterCount: { increment: 1 }
                    }
                });
                addedMinutes += minutes;
            } catch (e) {
                // ignore 
            }
        }
        return addedMinutes;
    }
}

export const logScannerService = new LogScannerService();
