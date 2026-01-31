import { ipcMain } from 'electron';
import { gameLogService } from './GameLogService';
import { locationService, FriendLocation } from './LocationService';
import { socialFeedService } from './SocialFeedService';
import { playerLogService } from './PlayerLogService';
import { friendshipService } from './FriendshipService';
import { getCurrentUserId } from './AuthService';
import { vrchatApiService } from './VRChatApiService';
import { windowService } from './WindowService';
import { serviceEventBus } from './ServiceEventBus';
import log from 'electron-log';

const logger = log.scope('FriendshipIpc');

export function setupFriendshipHandlers() {
    logger.info('Setting up Friendship Manager IPC handlers...');

    // Bridge Service Events to Renderer
    serviceEventBus.on('social-feed-entry-added', ({ entry }) => {
        logger.debug(`[ServiceBridge] Social feed entry added for ${entry.displayName}, broadcasting update`);
        windowService.broadcast('friendship:update', { type: 'social-feed', entry });
    });

    serviceEventBus.on('friend-state-changed', ({ friend }) => {
        logger.debug(`[ServiceBridge] Friend state changed for ${friend.displayName}, broadcasting update`);
        windowService.broadcast('friendship:update', { type: 'friend-location', friend });
    });

    serviceEventBus.on('friendship-relationship-changed', ({ event }) => {
        logger.debug(`[ServiceBridge] Relationship changed for ${event.displayName}, broadcasting update`);
        windowService.broadcast('friendship:update', { type: 'relationship', event });
    });

    serviceEventBus.on('friend-stats-updated', (payload) => {
        // Broadcast to UI so open modals can update in real-time
        windowService.broadcast('friendship:stats-update', payload);
    });

    // Game Log (Instance History - World Changes)
    ipcMain.handle('friendship:get-game-log', async (_event, limit?: number) => {
        logger.debug(`[IPC] friendship:get-game-log called (limit: ${limit})`);
        try {
            const entries = await gameLogService.getRecentEntries(limit || 20000);
            logger.debug(`[IPC] friendship:get-game-log returning ${entries.length} entries`);
            return entries;
        } catch (e) {
            logger.error('Failed to get game log:', e);
            return [];
        }
    });

    // Player Log (Instance History - Player Joins/Leaves like VRCX)
    ipcMain.handle('friendship:get-player-log', async (_event, options?: {
        limit?: number;
        search?: string;
        type?: 'join' | 'leave' | 'all';
    }) => {
        logger.debug(`[IPC] friendship:get-player-log called`, options);
        try {
            const entries = await playerLogService.getRecentEntries(options || {});
            logger.debug(`[IPC] friendship:get-player-log returning ${entries.length} entries`);
            return entries;
        } catch (e) {
            logger.error('Failed to get player log:', e);
            return [];
        }
    });

    // Friend Locations - now with API fetch fallback
    ipcMain.handle('friendship:get-friend-locations', async () => {
        logger.debug('[IPC] friendship:get-friend-locations called');
        try {
            // First check in-memory cache
            let friends = locationService.getAllFriends();
            logger.debug(`[IPC] LocationService has ${friends.length} cached friends`);

            // If cache is empty OR seems to be missing image data (stale schema), fetch from API
            const hasImages = friends.some(f => f.userIcon || f.currentAvatarThumbnailImageUrl || f.profilePicOverride);

            if (friends.length === 0 || !hasImages) {
                logger.info(`[IPC] Friends cache empty or missing images (hasImages: ${hasImages}), fetching from VRChat API...`);
                try {
                    const onlineResult = await vrchatApiService.getFriends(false);
                    if (onlineResult.success && onlineResult.data) {
                        const apiFriends: FriendLocation[] = onlineResult.data.map(f => ({
                            userId: f.id,
                            displayName: f.displayName,
                            status: f.status || 'offline',
                            location: f.location || 'private',
                            lastUpdated: new Date().toISOString(),
                            userIcon: f.userIcon as string,
                            profilePicOverride: f.profilePicOverride as string,
                            currentAvatarThumbnailImageUrl: f.currentAvatarThumbnailImageUrl as string,
                            currentAvatarId: (f as any).currentAvatarId
                        }));

                        // Update LocationService with fetched data
                        locationService.setFriends(apiFriends);
                        friends = apiFriends;
                        logger.info(`[IPC] Fetched ${friends.length} online friends from API`);
                    }
                } catch (apiError) {
                    logger.warn('[IPC] Failed to fetch friends from API:', apiError);
                }
            }

            return friends;
        } catch (e) {
            logger.error('Failed to get friend locations:', e);
            return [];
        }
    });

    // Social Feed
    ipcMain.handle('friendship:get-social-feed', async (_event, limit?: number) => {
        logger.debug(`[IPC] friendship:get-social-feed called (limit: ${limit})`);
        try {
            const entries = await socialFeedService.getRecentEntries(limit || 20000);
            logger.debug(`[IPC] friendship:get-social-feed returning ${entries.length} entries`);
            return entries;
        } catch (e) {
            logger.error('Failed to get social feed:', e);
            return [];
        }
    });

    // Status / Init Check - with lazy initialization
    ipcMain.handle('friendship:get-status', async () => {
        logger.debug('[IPC] friendship:get-status called');
        try {
            // Check if already initialized
            friendshipService.getUserDataDir();
            logger.debug('[IPC] FriendshipService already initialized');
            return { initialized: true };
        } catch {
            // Not initialized - try to lazy-init if we have a user
            const userId = getCurrentUserId();
            if (userId) {
                logger.info(`[IPC] Lazy-initializing FriendshipService for user: ${userId}`);
                try {
                    await friendshipService.initialize(userId);
                    logger.info('[IPC] Lazy initialization successful');
                    return { initialized: true };
                } catch (initErr) {
                    logger.error('[IPC] Lazy initialization failed:', initErr);
                    return { initialized: false };
                }
            }
            logger.warn('[IPC] FriendshipService not initialized and no user logged in');
            return { initialized: false };
        }
    });

    // Force refresh friends from API (manual refresh button)
    ipcMain.handle('friendship:refresh-friends', async () => {
        logger.info('[IPC] friendship:refresh-friends - Forcing API refresh');
        try {
            const onlineResult = await vrchatApiService.getFriends(false);
            if (onlineResult.success && onlineResult.data) {
                const apiFriends: FriendLocation[] = onlineResult.data.map(f => ({
                    userId: f.id,
                    displayName: f.displayName,
                    status: f.status || 'offline',
                    location: f.location || 'private',
                    lastUpdated: new Date().toISOString(),
                    userIcon: f.userIcon as string,
                    profilePicOverride: f.profilePicOverride as string,
                    currentAvatarThumbnailImageUrl: f.currentAvatarThumbnailImageUrl as string,
                    currentAvatarId: (f as any).currentAvatarId
                }));

                locationService.setFriends(apiFriends);
                logger.info(`[IPC] Refreshed ${apiFriends.length} friends from API`);
                return { success: true, count: apiFriends.length };
            }
            return { success: false, error: onlineResult.error };
        } catch (e) {
            logger.error('[IPC] Failed to refresh friends:', e);
            return { success: false, error: String(e) };
        }
    });

    // Relationship Events (friend adds, removes, name changes - Social tab)
    ipcMain.handle('friendship:get-relationship-events', async (_event, limit?: number) => {
        logger.debug(`[IPC] friendship:get-relationship-events called (limit: ${limit})`);
        try {
            const { relationshipService } = await import('./RelationshipService');
            const entries = await relationshipService.getRecentEvents(limit || 20000);
            logger.debug(`[IPC] friendship:get-relationship-events returning ${entries.length} entries`);
            return entries;
        } catch (e) {
            logger.error('Failed to get relationship events:', e);
            return [];
        }
    });

    // Force relationship check (manual refresh)
    ipcMain.handle('friendship:refresh-relationships', async () => {
        logger.info('[IPC] friendship:refresh-relationships - Forcing check');
        try {
            const { relationshipService } = await import('./RelationshipService');
            await relationshipService.forceCheck();
            return { success: true };
        } catch (e) {
            logger.error('[IPC] Failed to refresh relationships:', e);
            return { success: false, error: String(e) };
        }
    });

    // Statistics
    ipcMain.handle('friendship:get-player-stats', async (_event, userId: string) => {
        logger.debug(`[IPC] friendship:get-player-stats called for ${userId}`);
        try {
            // HYBRID MERGE: Get DB Stats (Robust Time) + Log Stats (Rich History/Worlds)
            const { timeTrackingService } = await import('./TimeTrackingService');

            const [legacyStats, dbStats] = await Promise.all([
                playerLogService.getPlayerStats(userId),
                timeTrackingService.getPlayerStats(userId)
            ]);

            // Default fallback
            const finalStats = legacyStats || {
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                encounterCount: 0,
                timeSpent: 0,
                commonWorlds: []
            };

            // Overlay DB stats if available (They are the authority for Time & Encounters now)
            if (dbStats) {
                finalStats.timeSpent = dbStats.timeSpentMinutes * 60 * 1000; // Convert min to ms
                finalStats.encounterCount = Math.max(finalStats.encounterCount, dbStats.encounterCount);
                if (new Date(dbStats.lastSeen) > new Date(finalStats.lastSeen)) {
                    finalStats.lastSeen = dbStats.lastSeen.toISOString();
                }
            }

            return { success: true, stats: finalStats };
        } catch (e) {
            logger.error('Failed to get player stats:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('friendship:get-world-stats', async (_event, worldId: string) => {
        logger.debug(`[IPC] friendship:get-world-stats called for ${worldId}`);
        try {
            const stats = await gameLogService.getWorldStats(worldId);
            return { success: true, stats };
        } catch (e) {
            logger.error('Failed to get world stats:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('friendship:get-friends-list', async () => {
        logger.debug('[IPC] friendship:get-friends-list called');
        try {
            const friends = await friendshipService.getFullFriendsList();
            logger.debug(`[IPC] friendship:get-friends-list returning ${friends.length} entries`);
            return friends;
        } catch (e) {
            logger.error('Failed to get friends list:', e);
            return [];
        }
    });

    // Batch fetch mutual counts for visible friends (to avoid rate limits)
    ipcMain.handle('friendship:get-mutuals-batch', async (_event, userIds: string[]) => {
        logger.debug(`[IPC] friendship:get-mutuals-batch called for ${userIds.length} users`);
        try {
            const { userProfileService } = await import('./UserProfileService');
            const results = new Map<string, { friends: number; groups: number }>();

            // Fetch in sequence with small delay to be nice to API
            for (const userId of userIds) {
                try {
                    const counts = await userProfileService.getMutualCounts(userId);
                    if (counts) {
                        results.set(userId, { friends: counts.friends, groups: counts.groups });
                    }
                } catch (err) {
                    logger.warn(`Failed to get mutuals for ${userId}:`, err);
                }
                // Small delay between requests
                await new Promise(r => setTimeout(r, 100));
            }

            // Convert Map to object for IPC
            const output: Record<string, { friends: number; groups: number }> = {};
            results.forEach((v, k) => { output[k] = v; });
            return output;
        } catch (e) {
            logger.error('Failed to get mutuals batch:', e);
            return {};
        }
    });

    logger.info('Friendship Manager IPC handlers registered successfully.');
}
