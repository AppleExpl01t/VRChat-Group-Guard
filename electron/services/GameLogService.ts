import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { logWatcherService, LocationEvent } from './LogWatcherService';

const logger = log.scope('GameLogService');

export interface GameLogEntry {
    timestamp: string; // ISO string
    worldName: string;
    worldId: string;
    instanceId: string;
    location: string; // Full string
    duration?: number; // ms
    leaveTimestamp?: string;
    userCountAtJoin?: number;
    notes?: string;
}

/**
 * Manages the persistent "Game Log" (history of visited instances).
 * Stores data in a line-delimited JSON file (game_log.jsonl) for performance.
 */
class GameLogService {
    private isInitialized = false;
    private dbPath: string | null = null;
    private currentSession: GameLogEntry | null = null;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        // We listen to ANY location change from the watcher
        logWatcherService.on('location', (event: LocationEvent) => {
            if (!this.isInitialized) return;
            this.handleLocationChange(event);
        });

        // We also listen for world name updates to enrich the current session
        logWatcherService.on('world-name', (event: { name: string; timestamp: string }) => {
            if (!this.isInitialized || !this.currentSession) return;

            // If we didn't have the name yet, update it
            if (this.currentSession.worldName === 'Unknown World') {
                this.currentSession.worldName = event.name;
                this.persistCurrentSessionUpdate();
            }
        });

        // Listen for game close/stop to close the session
        logWatcherService.on('game-closed', () => {
            if (this.currentSession) {
                this.closeCurrentSession(new Date().toISOString());
            }
        });
    }

    /**
     * Initializes the service with a user-specific data directory.
     */
    public initialize(userDataDir: string) {
        this.dbPath = path.join(userDataDir, 'game_log.jsonl');
        this.isInitialized = true;
        this.currentSession = null;  // Reset session on init (assume fresh start or re-sync)
        logger.info(`GameLogService initialized. DB Path: ${this.dbPath}`);
    }

    /**
     * Shuts down the service and closes any active session.
     */
    public shutdown() {
        if (this.currentSession) {
            this.closeCurrentSession(new Date().toISOString());
        }
        this.isInitialized = false;
        this.dbPath = null;
        this.currentSession = null;
    }

    private handleLocationChange(event: LocationEvent) {
        const now = event.timestamp || new Date().toISOString();

        // 1. Close previous session if exists
        if (this.currentSession) {
            // Check if it's actually the same instance (re-join or log spam)
            if (this.currentSession.location === event.location) {
                return; // Ignore duplicate
            }
            this.closeCurrentSession(now);
        }

        // 2. Start new session
        // We might not know the World Name yet if the log parser hasn't seen "Entering Room"
        // But the 'location' event from log parser usually fires on "Joining"
        const newSession: GameLogEntry = {
            timestamp: now,
            worldId: event.worldId,
            instanceId: event.instanceId || event.location || '',
            location: event.location || '',
            worldName: event.worldName || 'Unknown World',
            userCountAtJoin: 0 // Could update this later if we had data
        };

        this.currentSession = newSession;
        this.appendEntry(newSession);
    }

    private closeCurrentSession(endTime: string) {
        if (!this.currentSession || !this.dbPath) return;

        const start = new Date(this.currentSession.timestamp).getTime();
        const end = new Date(endTime).getTime();
        const duration = end - start;

        this.currentSession.leaveTimestamp = endTime;
        this.currentSession.duration = duration;

        // In JSONL, since we just append, updating a previous line is hard.
        // STRATEGY: We append a "Session Update" or we just re-rewrite the last line? 
        // Re-writing last line is risky if file is shared.
        // Simplest VRCX style: Just append the "Join" event. Calculate duration by diffing with next event at runtime?
        // BETTER: VRCX stores full rows in SQLite. 
        // FOR FILE SYSTEM: We can rewrite the specific line if we keep an in-memory index, or we just append the "Leave" info?

        // Let's try to update the LAST line if it matches. This is file IO heavy but accurate.
        // OR: Just ignore duration for now in the log file, and compute it on read?
        // NO, persistent duration is better.

        // Hack for Phase 1: Read occurrences, find the match, replace it. 
        // Optimized: Read the file backward?

        // Let's stick to: We only write the COMPLETE entry when the user LEAVES? 
        // Risk: If app crashes, we lose the entry.

        // Decision: Write "Join" immediately. Update it on leave.
        // Updating text file line is hard.

        // ALTERNATIVE: Use `electron-store` for "Active Session" and File for "History".
        // When session ends, move from Store to File.

        // I'll assume for now we just want a history log. 
        // Use JSONL. Write "Join".
        // When "Leaving", we can append a separate "Leave" event OR just let the UI calculate limits.
        // UI Calculation approach is standard for logs.
        // So we won't update the file on close, just rely on the next entry's timestamp.

        this.currentSession = null;
    }

    private persistCurrentSessionUpdate() {
        // Same issue - updating the existing line is hard. 
        // If we really want persistent World Name updates for Unknown Worlds:
        // We probably need a real DB like NeDB or just use `electron-store` for the last 500 items and file for archive.

        // For Phase 1 MVP: Just append. If duplicate ID/Timestamp, UI takes the latest (which has the name).
        if (this.currentSession) {
            this.appendEntry(this.currentSession);
        }
    }

    private appendEntry(entry: GameLogEntry) {
        if (!this.dbPath) return;
        try {
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(this.dbPath, line);
        } catch (e) {
            logger.error('Failed to append game log:', e);
        }
    }

    /**
     * Reads the last N entries from the log.
     */
    public async getRecentEntries(limit = 100): Promise<GameLogEntry[]> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return [];

        // Basic implementation: Read all, reverse, take N.
        // Optimization: Use `read-last-lines` package if we had it. 
        // For now, read file (up to ~10MB is instant).
        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');
            const entries = lines
                .slice(-limit)
                .map(line => {
                    try { return JSON.parse(line) as GameLogEntry; } catch { return null; }
                })
                .filter((e): e is GameLogEntry => e !== null)
                .reverse();

            // Post-process to deduce world names / durations if we implemented duplicate appending
            // Basic dedupe by location/time
            const deduped = new Map<string, GameLogEntry>();
            for (const e of entries) {
                const key = `${e.timestamp}_${e.location}`;
                // Keep the one with most info (e.g. valid world name)
                if (!deduped.has(key) || (e.worldName !== 'Unknown World')) {
                    deduped.set(key, e);
                }
            }

            return Array.from(deduped.values());
        } catch (e) {
            logger.error('Failed to read game log:', e);
            return [];
        }
    }
    /**
     * Calculates statistics for a specific world.
     */
    public async getWorldStats(worldId: string): Promise<{
        visitCount: number;
        timeSpent: number;
        lastVisited: string;
        lastInstanceId?: string;
    } | null> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;

        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');

            let visitCount = 0;
            let timeSpent = 0;
            let lastVisitedTs = 0;
            let lastInstanceId: string | undefined;

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line) as GameLogEntry;

                    if (entry.worldId === worldId) {
                        visitCount++;

                        const ts = new Date(entry.timestamp).getTime();
                        if (ts > lastVisitedTs) {
                            lastVisitedTs = ts;
                            lastInstanceId = entry.instanceId;
                        }

                        if (entry.duration) {
                            timeSpent += entry.duration;
                        } else if (entry.leaveTimestamp) {
                            // Recover duration if calculated but not stored as 'duration' prop in older versions
                            const start = new Date(entry.timestamp).getTime();
                            const end = new Date(entry.leaveTimestamp).getTime();
                            const d = end - start;
                            if (d > 0) timeSpent += d;
                        }
                    }
                } catch { /* ignore */ }
            }

            if (visitCount === 0) return null;

            return {
                visitCount,
                timeSpent,
                lastVisited: new Date(lastVisitedTs).toISOString(),
                lastInstanceId
            };

        } catch (e) {
            logger.error('Failed to calculate world stats:', e);
            return null;
        }
    }
}

export const gameLogService = new GameLogService();
