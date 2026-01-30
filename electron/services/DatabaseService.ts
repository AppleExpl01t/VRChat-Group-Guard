import { PrismaClient } from '@prisma/client';
import path from 'path';
import log from 'electron-log';
import { storageService } from './StorageService';
import fs from 'fs';
import crypto from 'crypto';

const logger = log.scope('DatabaseService');

class DatabaseService {
    private prisma: PrismaClient | null = null;
    private isInitialized = false;

    constructor() { }

    public async initialize() {
        if (this.isInitialized) return;

        try {
            const dataDir = storageService.getDataDir();
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const dbPath = path.join(dataDir, 'database.sqlite');
            // Ensure file exists to avoid some driver oddities, though usually not needed
            if (!fs.existsSync(dbPath)) {
                fs.writeFileSync(dbPath, '');
            }

            const dbUrl = `file:${dbPath}`;

            logger.info(`Initializing database at: ${dbPath}`);

            this.prisma = new PrismaClient({
                datasources: {
                    db: {
                        url: dbUrl,
                    },
                },
            });

            // BACKUP DATABASE (Safety First)
            await this.backupDatabase(dbPath);

            // Connect explicitly
            await this.prisma.$connect();

            // AUTO-MIGRATION: Ensure 'flags' column exists (fix for mismatch)
            try {
                await this.prisma.$executeRaw`ALTER TABLE ScannedUser ADD COLUMN flags TEXT`;
                logger.info('Applied auto-migration: Added flags column to ScannedUser');
            } catch (e) {
                // Ignore if column already exists
            }

            this.isInitialized = true;
            logger.info('Database initialized successfully.');

        } catch (error) {
            logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    private async backupDatabase(dbPath: string) {
        try {
            if (fs.existsSync(dbPath)) {
                const backupPath = `${dbPath}.backup-${Date.now()}`;
                fs.copyFileSync(dbPath, backupPath);
                logger.info(`Database backed up to: ${backupPath}`);

                // Cleanup old backups (keep last 5)
                const dataDir = path.dirname(dbPath);
                const files = fs.readdirSync(dataDir)
                    .filter(f => f.startsWith('database.sqlite.backup-'))
                    .sort();

                if (files.length > 5) {
                    const toDelete = files.slice(0, files.length - 5);
                    for (const file of toDelete) {
                        fs.unlinkSync(path.join(dataDir, file));
                    }
                }
            }
        } catch (e) {
            logger.warn('Failed to backup database:', e);
        }
    }

    public getClient() {
        // If called before init, try to init (though async issue)
        if (!this.prisma) {
            // This is dangerous if called synchronously logic depends on it.
            // But for now verify init in main.
            throw new Error('Database not initialized');
        }
        return this.prisma;
    }

    public async createSession(data: {
        sessionId: string, worldId: string, instanceId: string, location: string,
        groupId: string | null, startTime: Date, worldName?: string
    }) {
        return this.getClient().session.create({ data });
    }

    public async updateSession(sessionId: string, data: Partial<{ endTime: Date, worldName: string }>) {
        return this.getClient().session.update({
            where: { sessionId },
            data
        });
    }

    public async createLogEntry(data: {
        sessionId: string, type: string, timestamp: Date,
        actorDisplayName?: string, actorUserId?: string, details: unknown
    }) {
        return this.getClient().logEntry.create({
            data: {
                ...data,
                details: JSON.stringify(data.details)
            }
        });
    }

    public async createAutoModLog(data: {
        timestamp: Date, user: string, userId: string, groupId: string,
        action: string, reason: string, module: string, details?: string
    }) {
        // Cast to any to avoid TS error until client is regenerated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.getClient() as any).autoModLog.create({
            data: {
                ...data,
                id: crypto.randomUUID() // Ensure we generate ID if prisma middleware doesn't
            }
        });
    }

    public async getAutoModLogs(groupId?: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.getClient() as any).autoModLog.findMany({
            where: groupId ? { groupId } : undefined,
            orderBy: { timestamp: 'desc' }
        });
    }

    public async clearAutoModLogs() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.getClient() as any).autoModLog.deleteMany({});
    }

    public async getSessions(groupIdFilter?: string) {
        return this.getClient().session.findMany({
            where: groupIdFilter ? { groupId: groupIdFilter } : undefined,
            orderBy: { startTime: 'desc' }
        });
    }

    public async getSessionEvents(sessionId: string) {
        const logs = await this.getClient().logEntry.findMany({
            where: { sessionId },
            orderBy: { timestamp: 'asc' }
        });
        // Parse details back to JSON
        return logs.map(l => ({
            ...l,
            details: JSON.parse(l.details)
        }));
    }

    public async deleteAllSessions() {
        await this.getClient().logEntry.deleteMany({});
        return this.getClient().session.deleteMany({});
    }

    // ============================================
    // SCANNED USERS
    // ============================================

    public async upsertScannedUser(user: {
        id: string;
        displayName: string;
        rank?: string;
        thumbnailUrl?: string;
        groupId?: string;
        flags?: string[]; // Add flags support
    }) {
        try {
            // Check if user exists
            const existing = await this.getClient().$queryRaw`
              SELECT id, timesEncountered FROM ScannedUser WHERE id = ${user.id}
          ` as { id: string; timesEncountered: number }[];

            const flagsJson = user.flags ? JSON.stringify(user.flags) : null;

            if (existing.length > 0) {
                // Update existing user
                await this.getClient().$executeRaw`
                  UPDATE ScannedUser 
                  SET displayName = ${user.displayName},
                      rank = ${user.rank || null},
                      thumbnailUrl = ${user.thumbnailUrl || null},
                      groupId = ${user.groupId || null},
                      lastSeenAt = ${new Date().toISOString()},
                      timesEncountered = ${existing[0].timesEncountered + 1},
                      flags = COALESCE(${flagsJson}, flags)
                  WHERE id = ${user.id}
              `;
            } else {
                // Insert new user
                await this.getClient().$executeRaw`
                  INSERT INTO ScannedUser (id, displayName, rank, thumbnailUrl, groupId, firstSeenAt, lastSeenAt, timesEncountered, flags)
                  VALUES (${user.id}, ${user.displayName}, ${user.rank || null}, ${user.thumbnailUrl || null}, ${user.groupId || null}, ${new Date().toISOString()}, ${new Date().toISOString()}, 1, ${flagsJson})
              `;
            }
            return true;
        } catch (error) {
            logger.error('Failed to upsert scanned user:', error);
            return false;
        }
    }

    public async searchScannedUsers(query: string, limit: number = 20) {
        try {
            const searchPattern = `%${query}%`;
            const results = await this.getClient().$queryRaw`
              SELECT id, displayName, rank, thumbnailUrl, groupId, lastSeenAt, timesEncountered, flags
              FROM ScannedUser
              WHERE displayName LIKE ${searchPattern} OR id LIKE ${searchPattern}
              ORDER BY timesEncountered DESC, lastSeenAt DESC
              LIMIT ${limit}
          ` as {
                id: string;
                displayName: string;
                rank: string | null;
                thumbnailUrl: string | null;
                groupId: string | null;
                lastSeenAt: string;
                timesEncountered: number;
                flags: string | null;
            }[];
            return results;
        } catch (error) {
            logger.error('Failed to search scanned users:', error);
            return [];
        }
    }

    public async getScannedUser(userId: string) {
        try {
            const results = await this.getClient().$queryRaw`
              SELECT id, displayName, rank, thumbnailUrl, groupId, firstSeenAt, lastSeenAt, timesEncountered, flags
              FROM ScannedUser
              WHERE id = ${userId}
          ` as {
                id: string;
                displayName: string;
                rank: string | null;
                thumbnailUrl: string | null;
                groupId: string | null;
                firstSeenAt: string;
                lastSeenAt: string;
                timesEncountered: number;
                flags: string | null;
            }[];
            return results[0] || null;
        } catch (error) {
            logger.error('Failed to get scanned user:', error);
            return null;
        }
    }

    public async getRecentScannedUsers(limit: number = 50) {
        try {
            const results = await this.getClient().$queryRaw`
              SELECT id, displayName, rank, thumbnailUrl, groupId, lastSeenAt, timesEncountered, flags
              FROM ScannedUser
              ORDER BY lastSeenAt DESC
              LIMIT ${limit}
          ` as {
                id: string;
                displayName: string;
                rank: string | null;
                thumbnailUrl: string | null;
                groupId: string | null;
                lastSeenAt: string;
                timesEncountered: number;
                flags: string | null;
            }[];
            return results;
        } catch (error) {
            logger.error('Failed to get recent scanned users:', error);
            return [];
        }
    }
}

export const databaseService = new DatabaseService();

