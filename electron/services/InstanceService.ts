/**
 * InstanceService
 * 
 * Core instance operations: sector scanning, user moderation (recruit/kick/unban),
 * instance control (close, invite-self, get-info).
 * 
 * Rally and mass-invite functionality has been extracted to RallyService.
 * User enrichment and caching has been extracted to EntityEnrichmentService.
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
const logger = log.scope('InstanceService');

import { getVRChatClient, getCurrentUserId } from './AuthService';
import { instanceLoggerService } from './InstanceLoggerService';
import { logWatcherService } from './LogWatcherService';
import { groupAuthorizationService } from './GroupAuthorizationService';
import { networkService } from './NetworkService';
import { discordWebhookService } from './DiscordWebhookService';
import {
    clearRecruitmentCache,
    isUserInvitedThisInstance,
    markUserInvited,
    getInviteSlotsState
} from './InviteService';
import {
    LiveEntity,
    getCachedEntity,
    makeCacheKey,
    queueUserEnrichment,
    processFetchQueue
} from './EntityEnrichmentService';
import { setupRallyHandlers } from './RallyService';

// Re-export for backward compatibility
export { clearRecruitmentCache };

// Re-export LiveEntity type
export type { LiveEntity };

// ============================================
// IPC HANDLERS
// ============================================

export function setupInstanceHandlers() {
    logger.info('Setting up Instance handlers...');

    // SCAN SECTOR
    ipcMain.handle('instance:scan-sector', async (_event, { groupId }: { groupId?: string }) => {
        try {
            const players = logWatcherService.getPlayers();
            if (players.length > 0) {
                logger.info(`[InstanceService] scan-sector found ${players.length} players from LogWatcher.`);
            }

            const results: LiveEntity[] = [];

            for (const p of players) {
                if (!p.userId) {
                    results.push({
                        id: 'unknown',
                        displayName: p.displayName,
                        rank: 'Unknown',
                        isGroupMember: false,
                        status: 'active',
                        lastUpdated: 0
                    });
                    continue;
                }

                const cacheKey = makeCacheKey(p.userId, groupId);
                const cached = getCachedEntity(cacheKey);
                
                if (cached) {
                    results.push(cached);
                } else {
                    // Create partial entry
                    const placeholder: LiveEntity = {
                        id: p.userId,
                        displayName: p.displayName,
                        rank: 'Loading...',
                        isGroupMember: false,
                        status: 'active',
                        lastUpdated: 0
                    };
                    results.push(placeholder);

                    // Queue fetch via EntityEnrichmentService
                    queueUserEnrichment(p.userId, groupId);
                }
            }

            // Trigger background processor
            processFetchQueue(groupId);

            return results;

        } catch (error) {
            logger.error('Failed to scan sector:', error);
            return [];
        }
    });

    // RECRUIT (Invite User to Group)
    ipcMain.handle('instance:recruit-user', async (_event, { groupId, userId }: { groupId: string, userId: string }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:recruit-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        // Resolve current instance for cache key
        const currentWorldId = instanceLoggerService.getCurrentWorldId();
        const currentInstanceId = instanceLoggerService.getCurrentInstanceId();
        const fullInstanceKey = currentWorldId && currentInstanceId ? `${currentWorldId}:${currentInstanceId}` : 'global_session_fallback';

        if (isUserInvitedThisInstance(fullInstanceKey, userId)) {
            logger.info(`[InstanceService] CACHE HIT: Skipping recruit for ${userId}`);
            return { success: true, cached: true };
        }

        return networkService.execute(async () => {
            logger.info(`[InstanceService] Inviting ${userId} to group ${groupId}...`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (client as any).createGroupInvite({
                path: { groupId },
                body: { userId }
            });

            if (result.error) throw result.error;

            // Add to cache
            markUserInvited(fullInstanceKey, userId);

            return { success: true };
        }, `instance:recruit-user:${userId}`).then(res => {
            if (res.error === 'Rate Limited') return { success: false, error: 'RATE_LIMIT' };
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // UNBAN (Unban User from Group)
    ipcMain.handle('instance:unban-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:unban-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            logger.info(`[InstanceService] Unbanning ${userId} from group ${groupId}...`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (client as any).unbanGroupMember({
                path: { groupId, userId }
            });
            if (result.error) throw result.error;

            // WEBHOOK
            // WEBHOOK
            discordWebhookService.sendEvent(
                groupId,
                {
                    title: '🔓 Member Unbanned',
                    description: `User ${userId} was unbanned from the group.`,
                    type: 'SUCCESS',
                    fields: [
                        { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                        { name: 'Admin', value: getCurrentUserId() || 'Unknown', inline: true }
                    ]
                }
            );

            return { success: true };
        }, `instance:unban-user:${userId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // Get Invite Slots State (for Rate Limit Fallback UI)
    ipcMain.handle('instance:get-invite-slots-state', async () => {
        const slots = getInviteSlotsState();
        return { success: true, slots };
    });

    // KICK (Ban from Group with optional unban)
    ipcMain.handle('instance:kick-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:kick-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        // Staff Protection Check - Prevent kicks on staff members
        try {
            const { staffService } = await import('./StaffService');
            if (staffService.shouldProtect(groupId, userId, 'preventKicks')) {
                logger.info(`[InstanceService] Kick blocked - ${userId} is a protected staff member`);
                return { success: false, error: "Cannot kick: User is a protected staff member" };
            }
        } catch (e) {
            // Staff service not available, continue
        }

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            logger.info(`[InstanceService] Kicking ${userId} from group ${groupId} (Ban + Unban sequence)`);

            try {
                // Strategy 1: Native Kick API
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (typeof (client as any).kickGroupMember === 'function') {
                    logger.info(`[InstanceService] Attempting native kick for ${userId}...`);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await (client as any).kickGroupMember({
                        path: { groupId, userId }
                    });

                    if (result.error) throw result.error;
                    logger.info(`[InstanceService] Successfully kicked ${userId} using native API`);

                    // Webhook for native kick
                    // Webhook for native kick
                    discordWebhookService.sendEvent(
                        groupId,
                        {
                            title: '🥾 User Kicked',
                            description: `User ${userId} was kicked from the instance.`,
                            type: 'WARNING',
                            fields: [
                                { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                                { name: 'Method', value: 'Native API', inline: true },
                                { name: 'Instance', value: instanceLoggerService.getCurrentInstanceId() || 'Unknown', inline: false }
                            ]
                        }
                    ).catch(e => logger.error('Webhook failed', e));

                    return { success: true };
                }

                throw new Error('Native kick method missing, falling back to legacy sequence');

            } catch (nativeError) {
                logger.warn(`[InstanceService] Native kick failed (${(nativeError as Error).message}), falling back to Ban+Unban sequence`);

                // Strategy 2: Legacy Ban + Unban Sequence

                // 1. BAN (Remove from group)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const banResult = await (client as any).banGroupMember({
                    path: { groupId },
                    body: { userId }
                });

                if (banResult.error) throw new Error(`Kick failed (Ban stage): ${(banResult.error as { message?: string }).message}`);

                // 2. WAIT (Short delay to ensure consistency)
                await new Promise(r => setTimeout(r, 500));

                // 3. UNBAN (Clear the ban so they can rejoin if they want, effective 'Kick')
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (client as any).unbanGroupMember({ path: { groupId, userId } });
                    logger.info(`[InstanceService] Unban complete for ${userId} (Kick sequence finished)`);
                } catch (e) {
                    logger.warn(`[InstanceService] Failed to cleanup ban for ${userId} during kick. User remains banned.`, e);
                }

                // Webhook for legacy kick
                // Webhook for legacy kick
                discordWebhookService.sendEvent(
                    groupId,
                    {
                        title: '🥾 User Kicked',
                        description: `User ${userId} was kicked from the instance (Soft Kick).`,
                        type: 'WARNING',
                        fields: [
                            { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                            { name: 'Method', value: 'Ban+Unban Sequence', inline: true },
                            { name: 'Instance', value: instanceLoggerService.getCurrentInstanceId() || 'Unknown', inline: false }
                        ]
                    }
                ).catch(e => logger.error('Webhook failed', e));

                return { success: true };
            }
        }, `instance:kick-user:${userId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // CLOSE INSTANCE - Using SDK closeInstance method
    ipcMain.handle('instance:close-instance', async (_event, args?: { worldId?: string; instanceId?: string }) => {
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            // Resolve instance to close: provided args or current
            let worldId = args?.worldId;
            let instanceId = args?.instanceId;

            if (!worldId || !instanceId) {
                worldId = instanceLoggerService.getCurrentWorldId() || undefined;
                instanceId = instanceLoggerService.getCurrentInstanceId() || undefined;
            }

            if (!worldId || !instanceId) throw new Error("No active instance to close and none specified");

            logger.warn(`[InstanceService] Closing instance - worldId: ${worldId}, instanceId: ${instanceId}`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (client as any).closeInstance({
                path: { worldId, instanceId },
                query: { hardClose: true }
            });

            const safeStringify = (obj: unknown) => JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
            logger.info(`[InstanceService] closeInstance raw response:`, safeStringify(response));

            if (response?.error) throw new Error((response.error as { message?: string }).message || safeStringify(response.error));

            logger.info(`[InstanceService] Instance closed successfully.`);
            clearRecruitmentCache(`${worldId}:${instanceId}`);

            return { success: true };
        }, `instance:close-instance`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // INVITE SELF (Join Instance)
    ipcMain.handle('instance:invite-self', async (_event, { worldId, instanceId }: { worldId: string, instanceId: string }) => {
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            logger.info(`[InstanceService] Inviting self to ${worldId}:${instanceId}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (client as any).inviteMyselfTo({
                path: { worldId, instanceId }
            });
            if (result.error) throw result.error;
            return { success: true };
        }, `instance:invite-self:${worldId}:${instanceId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // GET INSTANCE INFO (World Name, Image)
    ipcMain.handle('instance:get-instance-info', async () => {
        const worldId = instanceLoggerService.getCurrentWorldId();
        const instanceId = instanceLoggerService.getCurrentInstanceId();
        const worldName = instanceLoggerService.getCurrentWorldName();

        if (!worldId) return { success: false };

        // Try to get image from API
        let imageUrl = null;
        let apiName = null;



        // If we have the name locally, we *could* skip fetching, but we usually want the image too.
        // However, we use vrchatApiService.getWorld() which is cached, so it's cheap to call.
        
        // Include vrchatApiService import if not present (it's likely needed)
        // Wait, InstanceService.ts doesn't import vrchatApiService yet?
        // Checking existing imports... need to add it if missing.
        // Assuming it's imported or I will add it. I'll check imports separately or just add the import at the top if needed.
        // But for this block:

        // Using centralized VRChatApiService (Cached)
        try {
            // This leverages the shared 10-minute cache for worlds
            const res = await import('./VRChatApiService').then(m => m.vrchatApiService.getWorld(worldId));
            
            if (res.success && res.data) {
                imageUrl = res.data.thumbnailImageUrl || res.data.imageUrl;
                apiName = res.data.name;
            } else {
                logger.warn(`[InstanceService] Failed to fetch world info via API: ${res.error}`);
            }
        } catch (e) {
            logger.error(`[InstanceService] Error resolving world info`, e);
        }

        return {
            success: true,
            worldId,
            instanceId,
            name: apiName || worldName || 'Unknown World',
            imageUrl
        };
    });

    // Cleanup cache handler triggered by InstanceLogger or manual close
    ipcMain.handle('instance:cleanup-cache', (_event, fullInstanceId: string) => {
        clearRecruitmentCache(fullInstanceId);
    });

    // Register Rally handlers from RallyService
    setupRallyHandlers();

    logger.info('Instance handlers registered.');
}
