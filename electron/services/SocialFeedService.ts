import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { serviceEventBus } from './ServiceEventBus';

const logger = log.scope('SocialFeedService');

export interface SocialFeedEntry {
    id: string; // Unique ID (timestamp + random)
    type: 'online' | 'offline' | 'location' | 'status' | 'add' | 'remove' | 'notification' | 'avatar';
    userId: string;
    displayName: string;
    timestamp: string;
    details?: string; // Location name, or status message
    data?: Record<string, unknown>; // Extra data
}

/**
 * Manages the "Social Feed" (VRCX-style feed of friend activities).
 * Persists data to `social_feed.jsonl`.
 */
class SocialFeedService {
    private isInitialized = false;
    private dbPath: string | null = null;

    // Cache for last status to avoid spamming "Location" updates if they are identical
    // or to ignore rapid online/offline toggles
    private lastStatus = new Map<string, string>();
    private lastAvatarId = new Map<string, string>();

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        serviceEventBus.on('friend-state-changed', (payload) => {
            if (!this.isInitialized) return;
            this.handleStateChange(payload);
        });

        serviceEventBus.on('friendship-relationship-changed', ({ event }) => {
            if (!this.isInitialized) return;
            this.handleRelationshipChange(event);
        });
    }

    public initialize(userDataDir: string) {
        this.dbPath = path.join(userDataDir, 'social_feed.jsonl');
        this.isInitialized = true;
        this.lastStatus.clear();
        this.cleanupLegacyEntries();
        logger.info(`SocialFeedService initialized. DB: ${this.dbPath}`);
    }

    public shutdown() {
        this.isInitialized = false;
        this.dbPath = null;
        this.lastStatus.clear();
    }

    private handleStateChange(payload: { friend: any; previous: any; change: { status: boolean; location: boolean; statusDescription: boolean; representedGroup: boolean; avatar: boolean } }) {
        const { friend, previous, change } = payload;
        const userId = friend.userId;
        const displayName = friend.displayName;
        const timestamp = new Date().toISOString();

        if (!userId) return;

        let feedType: SocialFeedEntry['type'] | null = null;
        let details = '';

        if (change.status) {
            if (friend.status === 'offline') {
                feedType = 'offline';
                details = 'Went Offline';
            } else if (!previous || previous.status === 'offline') {
                feedType = 'online';
                details = 'Came Online';
            } else {
                // Status color/text change (e.g. Active -> Join Me)
                feedType = 'status';
                details = `Status changed to ${friend.status.charAt(0).toUpperCase() + friend.status.slice(1)}`;
            }
        } else if (change.statusDescription && friend.status !== 'offline') {
            feedType = 'status';
            const oldDesc = previous?.statusDescription || '';
            const newDesc = friend.statusDescription || '';

            // Only log "Cleared" if there was something to clear
            if (!newDesc && !oldDesc) {
                return; // Ignore empty -> empty transition
            }

            details = `Status message: ${newDesc || 'Cleared'}`;
        } else if (change.representedGroup && friend.status !== 'offline') {
            feedType = 'status';
            details = `Now representing: ${friend.representedGroup || 'No Group'}`;
        } else if (change.avatar && friend.status !== 'offline') {
            const avatarId = (friend as any).currentAvatarId;
            const avatarName = (friend as any).avatarName;

            // DEDUPLICATION: Avoid logging the same avatar twice in a row 
            // (e.g. if LogWatcher and WebSocket both report it)
            if (avatarId && this.lastAvatarId.get(userId) === avatarId) {
                return;
            }
            if (avatarId) {
                this.lastAvatarId.set(userId, avatarId);
            }

            feedType = 'avatar';
            details = avatarName ? `Switched to ${avatarName}` : 'Avatar Changed';
        }

        // Location change (only if not newly offline)
        if (change.location && friend.status !== 'offline') {
            feedType = 'location';
            details = friend.worldName || friend.location || 'Private World';

            // Map "Private World" to something nicer if it's just 'private'
            if (details === 'private') details = 'Private World';
        }

        // ... (existing helper logic)

        // DEDUPLICATION LOGIC
        // We use the `lastStatus` cache (userId -> lastLoggedDetails) to prevent
        // spamming the feed with identical updates (e.g. Polling noise)
        if (feedType === 'status') {
            const last = this.lastStatus.get(userId);
            // If the message is exactly the same as the last one we successfully logged, skip it.
            if (last === details) {
                // logger.debug(`Skipping duplicate status update for ${displayName}: ${details}`);
                return;
            }
            // Update cache with new details
            this.lastStatus.set(userId, details);
        }

        // Special handling for Online/Offline to clear/reset duplicator if needed?
        // Actually, if they go offline, we shouldn't necessarily clear the 'last status message'
        // because if they come back online with the SAME status, it might be interesting to know?
        // But usually "Status message" is independent of online/offline.
        // Let's just track status messages for now.

        if (feedType) {
            const entry: SocialFeedEntry = {
                id: `${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
                type: feedType,
                userId,
                displayName,
                timestamp,
                details,
                data: friend
            };
            this.appendEntry(entry);
        }
    }

    private handleRelationshipChange(event: any) {
        const { userId, displayName, type, timestamp } = event;
        const feedType = type === 'add' ? 'add' : (type === 'remove' ? 'remove' : null);

        if (!feedType) return;

        const entry: SocialFeedEntry = {
            id: `${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
            type: feedType as any,
            userId,
            displayName,
            timestamp,
            details: type === 'add' ? 'Added as friend' : 'Removed from friends',
            data: event
        };
        this.appendEntry(entry);
    }

    private appendEntry(entry: SocialFeedEntry) {
        if (!this.dbPath) return;
        try {
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(this.dbPath, line);
            serviceEventBus.emit('social-feed-entry-added', { entry });
        } catch (e) {
            logger.error('Failed to append social feed:', e);
        }
    }

    public async getRecentEntries(limit?: number): Promise<SocialFeedEntry[]> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return [];
        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');
            const entries = (limit && limit > 0) ? lines.slice(-limit) : lines;
            return entries
                .map(line => {
                    try { return JSON.parse(line) as SocialFeedEntry; } catch { return null; }
                })
                .filter((e): e is SocialFeedEntry => e !== null)
                .reverse();
        } catch (e) {
            logger.error('Failed to read social feed:', e);
            return [];
        }
    }

    private async cleanupLegacyEntries() {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return;
        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');
            const newLines: string[] = [];

            let removedCount = 0;

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line) as SocialFeedEntry;
                    if (entry.details === 'Status message: Cleared') {
                        removedCount++;
                        continue;
                    }
                    newLines.push(line);
                } catch {
                    newLines.push(line);
                }
            }

            if (removedCount > 0) {
                await fs.promises.writeFile(this.dbPath, newLines.join('\n') + '\n');
                logger.info(`Cleaned up ${removedCount} spam 'Status message: Cleared' entries from social feed.`);
            }

        } catch (e) {
            logger.error('Failed to cleanup legacy entries:', e);
        }
    }
}

export const socialFeedService = new SocialFeedService();
