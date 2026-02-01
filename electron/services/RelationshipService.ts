import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { vrchatApiService, VRCFriend } from './VRChatApiService';

const logger = log.scope('RelationshipService');

export interface RelationshipEvent {
    id: string;
    timestamp: string;
    type: 'add' | 'remove' | 'name_change' | 'avatar_change' | 'rank_change' | 'bio_change';
    userId: string;
    displayName: string;
    previousName?: string; // For name changes
    avatarUrl?: string;
    avatarId?: string;
    previousAvatarUrl?: string; // For avatar changes
    previousAvatarId?: string; // For avatar changes
    tags?: string[]; // For rank changes
    previousTags?: string[]; // For rank changes
    bio?: string; // For bio changes
    previousBio?: string; // For bio changes
}

interface FriendSnapshot {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    avatarId?: string;
    tags?: string[];
    bio?: string;
}

/**
 * Tracks friend list changes like VRCX:
 * - New friends added
 * - Friends removed/unfriended
 * - Display name changes
 * 
 * Works by periodically diffing the friend list against a saved snapshot.
 */
class RelationshipService {
    private isInitialized = false;
    private dbPath: string | null = null;
    private snapshotPath: string | null = null;
    private lastSnapshot: Map<string, FriendSnapshot> = new Map();
    private pollInterval: NodeJS.Timeout | null = null;
    private pendingRemovals: Map<string, number> = new Map(); // userId -> missCount

    private POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private MISS_THRESHOLD = 3; // Must be missing for 3 polls (~15 mins) before removal
    private DROP_THRESHOLD = 0.8; // Ignore poll if >20% of friends disappear (API failure)

    public initialize(userDataDir: string) {
        this.dbPath = path.join(userDataDir, 'relationships.jsonl');
        this.snapshotPath = path.join(userDataDir, 'friend_snapshot.json');
        this.isInitialized = true;

        // Load last snapshot
        this.loadSnapshot();

        // Start polling
        this.startPolling();

        logger.info(`RelationshipService initialized. DB: ${this.dbPath}`);
    }

    public shutdown() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isInitialized = false;
        this.dbPath = null;
        this.snapshotPath = null;
        this.lastSnapshot.clear();
        this.pendingRemovals.clear();
    }

    private loadSnapshot() {
        if (!this.snapshotPath || !fs.existsSync(this.snapshotPath)) {
            logger.info('No previous friend snapshot found, will create on first poll');
            return;
        }

        try {
            const content = fs.readFileSync(this.snapshotPath, 'utf-8');
            const data = JSON.parse(content) as FriendSnapshot[];
            this.lastSnapshot.clear();
            for (const friend of data) {
                this.lastSnapshot.set(friend.userId, friend);
            }
            logger.info(`Loaded friend snapshot with ${this.lastSnapshot.size} friends`);
        } catch (e) {
            logger.error('Failed to load friend snapshot:', e);
        }
    }

    private saveSnapshot() {
        if (!this.snapshotPath) return;

        try {
            const data = Array.from(this.lastSnapshot.values());
            fs.writeFileSync(this.snapshotPath, JSON.stringify(data, null, 2));
            logger.debug(`Saved friend snapshot with ${data.length} friends`);
        } catch (e) {
            logger.error('Failed to save friend snapshot:', e);
        }
    }

    private startPolling() {
        // Do initial check after a delay (let API authenticate first)
        setTimeout(() => {
            this.checkForChanges();
        }, 30000); // 30 second delay on startup

        // Then poll every 5 minutes
        this.pollInterval = setInterval(() => {
            this.checkForChanges();
        }, this.POLL_INTERVAL_MS);
    }

    private async checkForChanges() {
        if (!this.isInitialized) return;

        logger.debug('Checking for friend list changes...');

        try {
            // Fetch current friends (online + offline)
            const onlineResult = await vrchatApiService.getFriends(false);
            const offlineResult = await vrchatApiService.getFriends(true);

            if (!onlineResult.success || !offlineResult.success) {
                logger.warn('Failed to fetch friends for relationship check');
                return;
            }

            const currentFriends = new Map<string, FriendSnapshot>();
            const allFriends = [...(onlineResult.data || []), ...(offlineResult.data || [])];

            for (const friend of allFriends) {
                currentFriends.set(friend.id, {
                    userId: friend.id,
                    displayName: friend.displayName,
                    avatarUrl: friend.currentAvatarThumbnailImageUrl,
                    avatarId: friend.currentAvatarId as string,
                    tags: friend.tags,
                    bio: friend.statusDescription // statusDescription is effectively the bio in LimitedUser
                });
            }

            // --- SANITY CHECK ---
            // If the API returns a massive drop in friends, it's likely a partial failure/rate limit.
            // We abort to avoid wiping the user's friend list snapshot.
            if (this.lastSnapshot.size > 10 && currentFriends.size < this.lastSnapshot.size * this.DROP_THRESHOLD) {
                logger.warn(`API returned suspicious drop in friends: ${this.lastSnapshot.size} -> ${currentFriends.size}. Aborting relationship diff.`);
                return;
            }

            const now = new Date().toISOString();

            // Check for NEW friends (in current but not in snapshot)
            for (const [userId, friend] of currentFriends) {
                if (!this.lastSnapshot.has(userId)) {
                    const event: RelationshipEvent = {
                        id: `${now}-${Math.random().toString(36).substr(2, 5)}`,
                        timestamp: now,
                        type: 'add',
                        userId: friend.userId,
                        displayName: friend.displayName,
                        avatarUrl: friend.avatarUrl,
                        avatarId: friend.avatarId
                    };
                    this.appendEvent(event);
                    logger.info(`New friend detected: ${friend.displayName}`);

                    // Emit to service bus so other services (like SocialFeed) and the UI can react
                    const { serviceEventBus } = require('./ServiceEventBus');
                    serviceEventBus.emit('friendship-relationship-changed', { event });

                    // PERSISTENCE: Save "Friend Since" date to Authoritative Database
                    try {
                        const { timeTrackingService } = require('./TimeTrackingService');
                        timeTrackingService.updateFriendSince(friend.userId, now);
                    } catch (e) {
                        logger.error('Failed to update friendSince in DB:', e);
                    }
                }
            }

            // Check for REMOVED friends (in snapshot but not in current)
            for (const [userId, friend] of this.lastSnapshot) {
                if (!currentFriends.has(userId)) {
                    // Start or increment grace period counter
                    const missCount = (this.pendingRemovals.get(userId) || 0) + 1;
                    this.pendingRemovals.set(userId, missCount);

                    if (missCount >= this.MISS_THRESHOLD) {
                        const event: RelationshipEvent = {
                            id: `${now}-${Math.random().toString(36).substr(2, 5)}`,
                            timestamp: now,
                            type: 'remove',
                            userId: friend.userId,
                            displayName: friend.displayName,
                            avatarUrl: friend.avatarUrl,
                            avatarId: friend.avatarId
                        };
                        this.appendEvent(event);
                        logger.info(`Friend removal CONFIRMED after ${missCount} misses: ${friend.displayName}`);

                        // Emit to service bus
                        const { serviceEventBus } = require('./ServiceEventBus');
                        serviceEventBus.emit('friendship-relationship-changed', { event });

                        // Actually removal confirmed, so we stop tracking misses for them
                        this.pendingRemovals.delete(userId);
                    } else {
                        logger.debug(`Friend missing from poll (${missCount}/${this.MISS_THRESHOLD}): ${friend.displayName}`);
                    }
                } else {
                    // Friend is in current, so clear any pending removal
                    if (this.pendingRemovals.has(userId)) {
                        this.pendingRemovals.delete(userId);
                    }
                }
            }

            // Check for NAME CHANGES (same userId, different displayName)
            for (const [userId, current] of currentFriends) {
                const previous = this.lastSnapshot.get(userId);
                if (previous && previous.displayName !== current.displayName) {
                    const event: RelationshipEvent = {
                        id: `${now}-${Math.random().toString(36).substr(2, 5)}`,
                        timestamp: now,
                        type: 'name_change',
                        userId: current.userId,
                        displayName: current.displayName,
                        previousName: previous.displayName,
                        avatarUrl: current.avatarUrl,
                        avatarId: current.avatarId
                    };
                    this.appendEvent(event);
                    logger.info(`Name change detected: ${previous.displayName} → ${current.displayName}`);

                    // Emit to service bus
                    const { serviceEventBus } = require('./ServiceEventBus');
                    serviceEventBus.emit('friendship-relationship-changed', { event });
                }

                // Check for AVATAR CHANGES (same userId, different avatarUrl)
                if (previous && previous.avatarUrl !== current.avatarUrl) {
                    const event: RelationshipEvent = {
                        id: `${now}-${Math.random().toString(36).substr(2, 5)}`,
                        timestamp: now,
                        type: 'avatar_change',
                        userId: current.userId,
                        displayName: current.displayName,
                        avatarUrl: current.avatarUrl,
                        avatarId: current.avatarId,
                        previousAvatarUrl: previous.avatarUrl,
                        previousAvatarId: previous.avatarId
                    };
                    this.appendEvent(event);
                    logger.info(`Avatar change detected in background for: ${current.displayName}`);

                    // Emit to service bus
                    const { serviceEventBus } = require('./ServiceEventBus');
                    serviceEventBus.emit('friendship-relationship-changed', { event });
                }
            }

            // Update snapshot
            this.lastSnapshot = currentFriends;
            this.saveSnapshot();

        } catch (e) {
            logger.error('Error checking for friend changes:', e);
        }
    }

    private appendEvent(event: RelationshipEvent) {
        if (!this.dbPath) return;
        try {
            const line = JSON.stringify(event) + '\n';
            fs.appendFileSync(this.dbPath, line);
        } catch (e) {
            logger.error('Failed to append relationship event:', e);
        }
    }

    /**
     * Get recent relationship events
     */
    public async getRecentEvents(limit?: number): Promise<RelationshipEvent[]> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return [];

        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');
            const entries = (limit && limit > 0) ? lines.slice(-limit) : lines;
            return entries
                .map(line => {
                    try { return JSON.parse(line) as RelationshipEvent; } catch { return null; }
                })
                .filter((e): e is RelationshipEvent => e !== null)
                .reverse();
        } catch (e) {
            logger.error('Failed to read relationship events:', e);
            return [];
        }
    }

    /**
     * Force an immediate check (for manual refresh)
     */
    public async forceCheck(): Promise<void> {
        await this.checkForChanges();
    }
}

export const relationshipService = new RelationshipService();
