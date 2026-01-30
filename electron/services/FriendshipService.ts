import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import { gameLogService } from './GameLogService';
import { locationService } from './LocationService';
import { socialFeedService } from './SocialFeedService';
import { playerLogService } from './PlayerLogService';
import { relationshipService } from './RelationshipService';
import { serviceEventBus } from './ServiceEventBus';
import { vrchatApiService } from './VRChatApiService';

const logger = log.scope('FriendshipService');

/**
 * Service responsible for managing the "Friendship Manager" module.
 * It handles the lifecycle of sub-services (Feed, Locations, GameLog)
 * and ensures data is strictly isolated per user.
 */
class FriendshipService {
    private isInitialized = false;
    private currentUserId: string | null = null;
    private userDataDir: string | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private POLL_INTERVAL_MS = 60 * 1000; // 1 minute

    // Sub-services (Placeholders for Phase 1)
    // private gameLogService: GameLogService;
    // private locationService: LocationService;

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Listen for Friend Updates via ServiceEventBus (from Pipeline)
        serviceEventBus.on('friend-update', (payload) => {
            if (!this.isInitialized) return;

            // Route to LocationService
            // Handle both object (online/location) and string (offline) payloads
            // VRChat WebSocket events may have data at content root OR nested in content.user
            let userId: string | undefined;
            let content: any = {};

            if (typeof payload.content === 'string') {
                userId = payload.content;
            } else if (payload.content && typeof payload.content === 'object') {
                content = payload.content;
                // VRChat WebSocket often nests user data inside content.user
                const user = content.user || {};
                userId = (content.userId as string) || (content.id as string) || (user.id as string);

                // Merge user object data with content data (user takes precedence for nested fields)
                content = { ...content, ...user };
            }

            if (userId) {
                locationService.updateFriend({
                    userId: userId,
                    displayName: content.displayName as string,
                    userIcon: content.userIcon as string | undefined,
                    profilePicOverride: content.profilePicOverride as string | undefined,
                    currentAvatarThumbnailImageUrl: content.currentAvatarThumbnailImageUrl as string | undefined,
                    status: payload.type === 'friend-offline' ? 'offline' :
                        (content.status as string) || (['friend-online', 'friend-active'].includes(payload.type) ? 'active' : undefined),
                    location: payload.type === 'friend-location' ? ((content.location as string) || 'private') :
                        payload.type === 'friend-offline' ? 'offline' : undefined,
                    statusDescription: content.statusDescription as string | undefined,
                    representedGroup: content.representedGroup as string | undefined
                });
            }
        });
    }

    private initPromise: Promise<void> | null = null;

    /**
     * Called when a user logs in.
     * Sets up the secure storage directory for THIS specific user.
     */
    public async initialize(userId: string): Promise<void> {
        if (this.isInitialized && this.currentUserId === userId) {
            return; // Already running for this user
        }

        if (this.isInitialized && this.currentUserId !== userId) {
            await this.shutdown(); // Switch accounts
        }

        // Return existing promise if already initializing for this user
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                logger.info(`Initializing FriendshipService for user: ${userId}`);
                this.currentUserId = userId;

                // 1. Setup Secure Storage Path: %APPDATA%/vrchat-group-guard/data/{userId}/
                const appUserData = app.getPath('userData');
                this.userDataDir = path.join(appUserData, 'data', userId);

                // Ensure directory exists
                if (!fs.existsSync(this.userDataDir)) {
                    try {
                        fs.mkdirSync(this.userDataDir, { recursive: true });
                        logger.info(`Created secure data directory: ${this.userDataDir}`);
                    } catch (error) {
                        logger.error(`Failed to create data directory for user ${userId}:`, error);
                        throw error; // Cannot proceed without storage
                    }
                }

                // 2. Initialize Sub-Services
                logger.info('Initializing Sub-Services...');
                gameLogService.initialize(this.userDataDir);
                locationService.initialize(this.userDataDir);
                socialFeedService.initialize(this.userDataDir);
                playerLogService.initialize(this.userDataDir);
                relationshipService.initialize(this.userDataDir);

                this.isInitialized = true;

                // Start background polling
                this.startPolling();

                logger.info('FriendshipService initialized successfully.');
            } catch (err) {
                this.initPromise = null;
                this.isInitialized = false;
                throw err;
            }
        })();

        return this.initPromise;
    }

    /**
     * Called on logout.
     * Stops all background tasks and unloads data to prevent leaks.
     */
    public async shutdown(): Promise<void> {
        if (!this.isInitialized) return;

        logger.info(`Shutting down FriendshipService for user: ${this.currentUserId}`);

        // 1. Shutdown Sub-Services
        gameLogService.shutdown();
        locationService.shutdown();
        socialFeedService.shutdown();
        playerLogService.shutdown();
        relationshipService.shutdown();

        // 2. Clear State
        this.stopPolling();
        this.currentUserId = null;
        this.userDataDir = null;
        this.isInitialized = false;

        logger.info('FriendshipService shutdown complete.');
    }

    private startPolling() {
        this.stopPolling();

        // Initial check after a small delay
        setTimeout(() => this.pollOnlineFriends(), 10000);

        this.pollInterval = setInterval(() => {
            this.pollOnlineFriends();
        }, this.POLL_INTERVAL_MS);
    }

    private stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    private async pollOnlineFriends() {
        if (!this.isInitialized || !vrchatApiService.isAuthenticated()) return;

        logger.debug('Polling online friends for status updates...');
        try {
            const result = await vrchatApiService.getFriends(false);
            if (result.success && result.data) {
                for (const friend of result.data) {
                    locationService.updateFriend({
                        userId: friend.id,
                        displayName: friend.displayName,
                        userIcon: friend.userIcon as string | undefined,
                        profilePicOverride: friend.profilePicOverride as string | undefined,
                        currentAvatarThumbnailImageUrl: friend.currentAvatarThumbnailImageUrl as string | undefined,
                        status: (friend.status as string) || 'active',
                        location: (friend.location as string) || 'private',
                        statusDescription: friend.statusDescription as string | undefined,
                        representedGroup: (friend as any).representedGroup as string | undefined,
                        // Mark as NOT offline since we polled from 'online' list
                    });
                }
            }
        } catch (e) {
            logger.error('Failed to poll online friends:', e);
        }
    }

    /**
     * Returns the current secure data directory for the active user.
     * Throws if not initialized (Security Check).
     */
    public getUserDataDir(): string {
        if (!this.isInitialized || !this.userDataDir) {
            throw new Error('FriendshipService is not initialized! Cannot access data directory.');
        }
        return this.userDataDir;
    }

    /**
     * Aggregates data from multiple services to provide a comprehensive friend list with stats.
     */
    public async getFullFriendsList() {
        if (!this.isInitialized) return [];

        const friends = locationService.getAllFriends();
        const userIds = friends.map((f: any) => f.userId);

        // Fetch stats from NEW TimeTrackingService (Database)
        // This is much faster and accurate than parsing JSON logs
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { timeTrackingService } = require('./TimeTrackingService');
        const bulkStats = await timeTrackingService.getBulkFriendStats(userIds);

        // Keep relationship events for "Date Known" logic (still useful from logs? or DB relation?)
        // For now, keep using RelationshipService events as they track "Added Friend" date accurately
        const relationshipEvents = await relationshipService.getRecentEvents(2000);
        const firstAddedMap = new Map<string, string>();

        [...relationshipEvents].reverse().forEach(event => {
            if (event.type === 'add' && !firstAddedMap.has(event.userId)) {
                firstAddedMap.set(event.userId, event.timestamp);
            }
        });

        const now = new Date();

        return friends.map((friend: any) => {
            const stats = bulkStats.get(friend.userId) || { encounterCount: 0, timeSpent: 0, lastSeen: '' };
            const dateKnown = firstAddedMap.get(friend.userId) || '';

            // Calculate Friend Score (0-100 Normalization)
            // 1. Time Factor (Max 40 pts) - Goal: 100 Hours (6000 mins)
            const timeFactor = Math.min(40, (stats.timeSpent / (1000 * 60) / 6000) * 40);

            // 2. Frequency Factor (Max 40 pts) - Goal: 50 Sessions
            const freqFactor = Math.min(40, (stats.encounterCount / 50) * 40);

            // 3. Intensity Factor (Max 20 pts) - Goal: 30 Mins/Day Average
            // Days Known = (Now - CreatedAt) / (ms * sec * min * hr)
            // Default to 1 day if created today or missing
            const createdAt = stats.createdAt ? new Date(stats.createdAt).getTime() : now.getTime();
            const msKnown = Math.max(1, now.getTime() - createdAt);
            const daysKnown = Math.max(1, msKnown / (1000 * 60 * 60 * 24));

            const minutesTotal = stats.timeSpent / (1000 * 60);
            const intensity = minutesTotal / daysKnown; // Avg mins per day
            const intensityFactor = Math.min(20, (intensity / 30) * 20);

            let score = Math.floor(timeFactor + freqFactor + intensityFactor);

            // Legacy Date Known Bonus (Optional - kept for strict "date added" context if available)
            if (dateKnown) {
                // We don't add points here anymore to keep 0-100 scale clean, 
                // but we could use it as a tiebreaker or display field.
            }

            return {
                ...friend,
                encounterCount: stats.encounterCount,
                timeSpent: stats.timeSpent,
                lastSeen: stats.lastSeen,
                dateKnown,
                friendScore: score
            };
        });
    }
    /**
     * Get lightweight friendship details for a specific user.
     * Used by EntityEnrichmentService for Live Ops.
     */
    public async getFriendshipDetails(userId: string): Promise<{ isFriend: boolean; score: number; status: string }> {
        if (!this.isInitialized) return { isFriend: false, score: 0, status: 'none' };

        // 1. Check if Friend
        const friend = locationService.getFriend(userId);
        if (!friend) return { isFriend: false, score: 0, status: 'none' };

        // 2. Calculate Score (Simplified for speed)
        // We can't do full log scan here synchronously for every user. 
        // We'll rely on cached stats if available, or just use encounter count from light cache if we had one.
        // For now, let's use the playerLogService to get quick stats - assuming it's indexed.
        // Actually, let's just use what we have in memory or default.

        let score = 0;
        // Check PlayerLogService cache (if exposed) or LocationService enriched data?
        // LocationService doesn't store score.

        // Let's grab basic stats from PlayerLogService - it reads from JSON, might be slow if file is huge.
        // OPTIMIZATION: Just return isFriend for now, and implement cached score lookup later if needed.
        // OR: Calculate score based on locationService data if we add 'daysKnown' there.

        // For Phase 5 initial implementation, let's return isFriend and a placeholder score.
        // real score calculation requires async file IO which causes lag in enrichment loop.

        return { isFriend: true, score: 1, status: friend.status || 'offline' };
    }
}

export const friendshipService = new FriendshipService();
