import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { logWatcherService } from './LogWatcherService';
import { serviceEventBus } from './ServiceEventBus';

const logger = log.scope('PlayerLogService');

export interface PlayerLogEntry {
    id: string;          // Unique ID (timestamp + random)
    timestamp: string;   // ISO string
    type: 'join' | 'leave';
    displayName: string;
    userId?: string;
    worldName?: string;
    worldId?: string;
    instanceId?: string;
    location?: string;
}

/**
 * Tracks all player joins and leaves across all instances - like VRCX's player log.
 * Stores data persistently in player_log.jsonl.
 */
class PlayerLogService {
    private isInitialized = false;
    private dbPath: string | null = null;
    private currentWorld: { name: string; id: string; instance: string; location: string } | null = null;
    private recentEntryIds = new Set<string>();
    private readonly MAX_RECENT_IDS = 10000;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        // Track location changes to know current world context
        logWatcherService.on('location', (event: { worldId: string; worldName?: string; instanceId?: string; location?: string; timestamp: string }) => {
            this.currentWorld = {
                name: event.worldName || 'Unknown World',
                id: event.worldId,
                instance: event.instanceId || '',
                location: event.location || ''
            };
            logger.debug(`[PlayerLogService] World changed: ${this.currentWorld.name}`);
        });

        logWatcherService.on('world-name', (event: { name: string }) => {
            if (this.currentWorld) {
                this.currentWorld.name = event.name;
            }
        });

        // Track player joins via EventBus
        serviceEventBus.on('player-joined', (event: { displayName: string; userId?: string; timestamp: string; isBackfill?: boolean }) => {
            if (!this.isInitialized) return;

            // Skip backfill events during hydration
            if (event.isBackfill) {
                logger.debug(`[PlayerLogService] Skipping backfill join: ${event.displayName}`);
                return;
            }

            const entry: PlayerLogEntry = {
                id: this.generateId(event.timestamp, event.userId, event.displayName, 'join'),
                timestamp: event.timestamp,
                type: 'join',
                displayName: event.displayName,
                userId: event.userId,
                worldName: this.currentWorld?.name,
                worldId: this.currentWorld?.id,
                instanceId: this.currentWorld?.instance,
                location: this.currentWorld?.location
            };

            this.appendEntry(entry);
        });

        // Track player leaves via EventBus
        serviceEventBus.on('player-left', (event: { displayName: string; userId?: string; timestamp: string; isBackfill?: boolean }) => {
            if (!this.isInitialized) return;

            if (event.isBackfill) {
                logger.debug(`[PlayerLogService] Skipping backfill leave: ${event.displayName}`);
                return;
            }

            const entry: PlayerLogEntry = {
                id: this.generateId(event.timestamp, event.userId, event.displayName, 'leave'),
                timestamp: event.timestamp,
                type: 'leave',
                displayName: event.displayName,
                userId: event.userId,
                worldName: this.currentWorld?.name,
                worldId: this.currentWorld?.id,
                instanceId: this.currentWorld?.instance,
                location: this.currentWorld?.location
            };

            this.appendEntry(entry);
        });

        // Clear current world on game close
        logWatcherService.on('game-closed', () => {
            this.currentWorld = null;
        });
    }

    public initialize(userDataDir: string) {
        this.dbPath = path.join(userDataDir, 'player_log.jsonl');

        // AUTO-FIX: Remove known corrupted entries from log history
        // Run BEFORE enabling listeners to ensure atomic cleanup
        this.cleanupDatabase();

        this.loadRecentIds();

        this.isInitialized = true;
        logger.info(`PlayerLogService initialized. DB Path: ${this.dbPath}`);
    }

    private cleanupDatabase() {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return;

        try {
            const content = fs.readFileSync(this.dbPath, 'utf-8');
            const lines = content.split('\n');
            let sanitizedContent = '';
            let removedCount = 0;

            for (const line of lines) {
                if (!line.trim()) continue;
                // Quick check before parsing JSON to save time
                if (line.includes('called, updating lock state')) {
                    removedCount++;
                    continue;
                }
                sanitizedContent += line + '\n';
            }

            if (removedCount > 0) {
                // Write back atomically-ish
                const tempPath = this.dbPath + '.tmp';
                fs.writeFileSync(tempPath, sanitizedContent);
                fs.renameSync(tempPath, this.dbPath);
                logger.info(`[PlayerLogService] Cleanup: Removed ${removedCount} false 'lock state' entries from history.`);
            }
        } catch (e) {
            logger.error('[PlayerLogService] Cleanup failed:', e);
        }
    }

    public shutdown() {
        this.isInitialized = false;
        this.dbPath = null;
        this.currentWorld = null;
        this.recentEntryIds.clear();
    }

    private generateId(timestamp: string, userId: string | undefined, displayName: string, type: string): string {
        // Deterministic ID: timestamp-userId-type OR timestamp-displayName-type
        const identifier = userId || displayName;
        return `${timestamp}-${identifier}-${type}`;
    }

    private loadRecentIds() {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return;

        try {
            // Read only the last 50KB to get recent IDs
            const stats = fs.statSync(this.dbPath);
            const size = stats.size;
            const bufferSize = Math.min(size, 50 * 1024);
            const buffer = Buffer.alloc(bufferSize);

            const fd = fs.openSync(this.dbPath, 'r');
            fs.readSync(fd, buffer, 0, bufferSize, size - bufferSize);
            fs.closeSync(fd);

            const content = buffer.toString('utf-8');
            const lines = content.split('\n');

            // Process lines (skip first potentially partial line if we didn't read whole file)
            const startIndex = size > bufferSize ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                try {
                    const entry = JSON.parse(line) as PlayerLogEntry;
                    if (entry.id) {
                        this.recentEntryIds.add(entry.id);
                    }
                } catch { /* ignore */ }
            }

            // Trim set if needed
            if (this.recentEntryIds.size > this.MAX_RECENT_IDS) {
                const arr = Array.from(this.recentEntryIds);
                this.recentEntryIds = new Set(arr.slice(arr.length - this.MAX_RECENT_IDS));
            }

            logger.info(`[PlayerLogService] Loaded ${this.recentEntryIds.size} recent IDs for deduplication`);
        } catch (e) {
            logger.error('[PlayerLogService] Failed to load recent IDs:', e);
        }
    }

    private appendEntry(entry: PlayerLogEntry) {
        if (!this.dbPath) return;

        // Deduplication check
        if (this.recentEntryIds.has(entry.id)) {
            logger.debug(`[PlayerLogService] Skipping duplicate entry: ${entry.id}`);
            return;
        }

        try {
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(this.dbPath, line);

            this.recentEntryIds.add(entry.id);
            if (this.recentEntryIds.size > this.MAX_RECENT_IDS) {
                // Delete oldest (iteration order is insertion order in Set)
                const first = this.recentEntryIds.values().next().value;
                if (first) this.recentEntryIds.delete(first);
            }

            logger.info(`[PlayerLogService] Logged: ${entry.type} - ${entry.displayName}`);
        } catch (e) {
            logger.error('Failed to append player log:', e);
        }
    }

    /**
     * Reads the last N player log entries.
     * Supports filtering by date range or search term.
     */
    public async getRecentEntries(options: {
        limit?: number;
        search?: string;
        type?: 'join' | 'leave' | 'all';
        startDate?: string;
        endDate?: string;
        instanceId?: string;
    } = {}): Promise<PlayerLogEntry[]> {
        const { limit, search, type = 'all', startDate, endDate } = options;

        if (!this.dbPath || !fs.existsSync(this.dbPath)) {
            logger.debug('[PlayerLogService] getRecentEntries: no db file');
            return [];
        }

        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');

            let entries = lines
                .map(line => {
                    try { return JSON.parse(line) as PlayerLogEntry; } catch { return null; }
                })
                .filter((e): e is PlayerLogEntry => e !== null);

            // Apply filters
            if (type !== 'all') {
                entries = entries.filter(e => e.type === type);
            }

            if (search) {
                const lowerSearch = search.toLowerCase();
                entries = entries.filter(e =>
                    e.displayName.toLowerCase().includes(lowerSearch) ||
                    e.worldName?.toLowerCase().includes(lowerSearch)
                );
            }

            if (startDate) {
                const start = new Date(startDate).getTime();
                entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
            }

            if (endDate) {
                const end = new Date(endDate).getTime();
                entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
            }

            if (options.instanceId) {
                entries = entries.filter(e => e.instanceId === options.instanceId);
            }

            // Return most recent first (slice only if limit specified)
            const sliced = (limit && limit > 0) ? entries.slice(-limit) : entries;
            return sliced.reverse();
        } catch (e) {
            logger.error('Failed to read player log:', e);
            return [];
        }
    }

    /**
     * Get unique players encountered (for stats/reporting)
     */
    public async getUniquePlayersCount(): Promise<number> {
        const entries = await this.getRecentEntries({ limit: 10000 });
        const unique = new Set(entries.map(e => e.displayName));
        return unique.size;
    }
    /**
     * Calculates statistics for a specific player based on logs.
     */
    public async getPlayerStats(userId: string): Promise<{
        firstSeen: string;
        lastSeen: string;
        encounterCount: number;
        timeSpent: number; // in milliseconds
        commonWorlds: { name: string; count: number; id: string }[];
    } | null> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;

        try {
            // Read entire file (performance warning for huge logs, but OK for text files < 50MB)
            // Stream processing would be better for V2
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');

            let firstSeen: number = Date.now();
            let lastSeen: number = 0;
            let encounterCount = 0;
            let timeSpent = 0;

            const worldCounts = new Map<string, { name: string; count: number; id: string }>();
            const knownWorldNames = new Map<string, string>();

            // Temporary state for duration calculation
            let joinTime: number | null = null;
            let currentInstance: string | null = null;

            // Process lines chronologically
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line) as PlayerLogEntry;

                    // Harvest world names from ANY entry (even if not matching user)
                    // This helps fix "Unknown World" if we saw the name later
                    if (entry.worldId && entry.worldName && entry.worldName !== 'Unknown World') {
                        knownWorldNames.set(entry.worldId, entry.worldName);
                    }

                    // Match by UserID (precise) or DisplayName (fallback)
                    // Note: userId might be undefined in old logs or some events
                    const isMatch = (entry.userId && entry.userId === userId) ||
                        (!entry.userId && entry.displayName === userId);

                    if (isMatch) {
                        const ts = new Date(entry.timestamp).getTime();

                        // 1. First/Last Seen
                        if (ts < firstSeen) firstSeen = ts;
                        if (ts > lastSeen) lastSeen = ts;

                        // 2. Encounter Count & Duration
                        if (entry.type === 'join') {
                            encounterCount++;
                            joinTime = ts;
                            currentInstance = entry.instanceId || null;

                            // 3. Common Worlds
                            if (entry.worldId) {
                                // Use recorded name or Unknown fallback
                                const name = (entry.worldName && entry.worldName !== 'Unknown World') ? entry.worldName : 'Unknown World';
                                const existing = worldCounts.get(entry.worldId) || { name, count: 0, id: entry.worldId };
                                existing.count++;
                                // If we have a better name now, update it
                                if (name !== 'Unknown World') existing.name = name;
                                worldCounts.set(entry.worldId, existing);
                            }
                        } else if (entry.type === 'leave') {
                            if (joinTime !== null && currentInstance === entry.instanceId) {
                                const duration = ts - joinTime;
                                if (duration > 0 && duration < 24 * 60 * 60 * 1000) { // Sanity check < 24h
                                    timeSpent += duration;
                                }
                                joinTime = null;
                            }
                        }
                    }
                } catch { /* ignore bad lines */ }
            }

            if (encounterCount === 0) return null; // No history found

            // Post-process world names using knownWorldNames
            const commonWorlds = Array.from(worldCounts.values())
                .map(w => {
                    // Try to resolve "Unknown World"
                    if (w.name === 'Unknown World' || !w.name) {
                        const betterName = knownWorldNames.get(w.id);
                        if (betterName) w.name = betterName;
                    }
                    return w;
                })
                .sort((a, b) => b.count - a.count)
                .slice(0, 3); // Top 3

            return {
                firstSeen: new Date(firstSeen).toISOString(),
                lastSeen: new Date(lastSeen).toISOString(),
                encounterCount,
                timeSpent,
                commonWorlds
            };

        } catch (e) {
            logger.error('Failed to calculate player stats:', e);
            return null;
        }
    }

    /**
     * Efficiently calculates basic stats for multiple players at once.
     * Useful for the Full Friends List view.
     */
    async getBulkPlayerStats(userIds: string[]): Promise<Map<string, { encounterCount: number; timeSpent: number; lastSeen: string }>> {
        const statsMap = new Map<string, { encounterCount: number; timeSpent: number; lastSeen: string }>();
        const targetIds = new Set(userIds);

        if (!this.dbPath || !fs.existsSync(this.dbPath)) return statsMap;

        try {
            const content = fs.readFileSync(this.dbPath, 'utf8');
            const lines = content.trim().split('\n');
            const lastJoinTime = new Map<string, number>();

            for (const line of lines) {
                if (!line) continue;
                try {
                    const entry: PlayerLogEntry = JSON.parse(line);
                    if (!entry.userId || !targetIds.has(entry.userId)) continue;

                    const uid = entry.userId;
                    const timestamp = new Date(entry.timestamp).getTime();

                    if (!statsMap.has(uid)) {
                        statsMap.set(uid, { encounterCount: 0, timeSpent: 0, lastSeen: entry.timestamp });
                    }

                    const stats = statsMap.get(uid)!;

                    if (entry.type === 'join') {
                        stats.encounterCount++;
                        lastJoinTime.set(uid, timestamp);
                    } else if (entry.type === 'leave') {
                        const joinTime = lastJoinTime.get(uid);
                        if (joinTime) {
                            stats.timeSpent += (timestamp - joinTime);
                            lastJoinTime.delete(uid);
                        }
                    }

                    // Always update lastSeen to the most recent entry timestamp found
                    if (new Date(entry.timestamp) > new Date(stats.lastSeen)) {
                        stats.lastSeen = entry.timestamp;
                    }
                } catch (err) {
                    continue;
                }
            }
        } catch (e) {
            logger.error('Failed to get bulk player stats:', e);
        }

        return statsMap;
    }
}

export const playerLogService = new PlayerLogService();
