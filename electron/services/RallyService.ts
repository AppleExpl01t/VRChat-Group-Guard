/**
 * RallyService
 * 
 * Handles all rally and mass-invite functionality.
 * Provides IPC handlers for inviting users from sessions, mass-inviting friends,
 * and getting rally targets.
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import { getVRChatClient, getCurrentUserId } from './AuthService';
import { instanceLoggerService } from './InstanceLoggerService';
import { windowService } from './WindowService';
import { logWatcherService } from './LogWatcherService';
import { groupAuthorizationService } from './GroupAuthorizationService';
import { autoModRuleService } from './AutoModRuleService';
import { networkService } from './NetworkService';
import {
    isUserInvitedThisInstance,
    markUserInvited,
    sendInvite
} from './InviteService';

const logger = log.scope('RallyService');

// Rate limit helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================================
// TYPES
// ============================================

interface VRChatApiError {
    message?: string;
    response?: {
        status?: number;
        data?: {
            error?: {
                message?: string;
            };
        };
    };
}

interface GroupMemberApiResponse {
    id?: string;
    displayName?: string;
    user?: {
        id?: string;
        displayName?: string;
        thumbnailUrl?: string;
    };
}

interface SessionEvent {
    type: string;
    actorUserId?: string;
}

// ============================================
// IPC HANDLERS
// ============================================

export function setupRallyHandlers() {
    logger.info('Setting up Rally handlers...');

    // RALLY: FETCH TARGETS
    ipcMain.handle('instance:get-rally-targets', async (_event, { groupId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:get-rally-targets');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const memRes = await (client as any).getGroupMembers({
                path: { groupId },
                query: { n: 50, offset: 0, sort: 'joinedAt:desc' }
            });
            const members = memRes.data || [];
            const currentUserId = getCurrentUserId();

            const targets = members
                .map((m: GroupMemberApiResponse) => ({
                    id: m.user?.id,
                    displayName: m.user?.displayName,
                    thumbnailUrl: m.user?.thumbnailUrl
                }))
                .filter((t: { id?: string; displayName?: string }) => {
                    // 1. Allow self
                    if (!t.id) return false;
                    if (t.id === currentUserId) return true;
                    // 2. Exclude users already here
                    const players = logWatcherService.getPlayers();
                    const isHere = players.some(p =>
                        (p.userId && p.userId === t.id) ||
                        (p.displayName && p.displayName === t.displayName)
                    );
                    return !isHere;
                });
            return { targets };
        }, `instance:get-rally-targets:${groupId}`).then(res => {
            if (res.success) return { success: true, targets: res.data?.targets };
            return { success: false, error: res.error };
        });
    });

    // RALLY: INVITE SINGLE USER TO CURRENT INSTANCE
    ipcMain.handle('instance:invite-to-current', async (_event, { userId, message }: { userId: string, message?: string }) => {
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            // Resolve current instance
            const worldId = instanceLoggerService.getCurrentWorldId();
            const instanceId = instanceLoggerService.getCurrentInstanceId();

            if (!worldId || !instanceId) throw new Error("No active instance");

            // Resolve cache key
            const fullInstanceKey = `${worldId}:${instanceId}`;

            // Check cache
            if (isUserInvitedThisInstance(fullInstanceKey, userId)) {
                logger.info(`[RallyService] CACHE HIT: Skipping instance invite for ${userId}`);
                return { success: true, cached: true };
            }

            const fullId = `${worldId}:${instanceId}`;

            // Use InviteService
            await sendInvite(client, userId, fullId, message);

            // Update cache
            markUserInvited(fullInstanceKey, userId);

            return { success: true };
        }, `instance:invite-to-current:${userId}`).then(res => {
            if (res.error === 'Rate Limited') return { success: false, error: 'RATE_LIMIT' };
            if (res.success) {
                // Check if it returned a cached result
                if (res.data && (res.data as { cached?: boolean }).cached) return { success: true, cached: true };
                return { success: true };
            }
            return { success: false, error: res.error };
        });
    });

    // RALLY FROM PREVIOUS SESSION: Get users from a session file and invite them
    ipcMain.handle('instance:rally-from-session', async (_event, { filename, message }: { filename: string, message?: string }) => {
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
            // 1. Check current instance
            const currentWorldId = instanceLoggerService.getCurrentWorldId();
            const currentInstanceId = instanceLoggerService.getCurrentInstanceId();

            if (!currentWorldId || !currentInstanceId) {
                return { success: false, error: "You must be in an instance to rally users" };
            }

            const currentLocation = `${currentWorldId}:${currentInstanceId}`;
            logger.info(`[RallyService] Rally from session ${filename} to ${currentLocation}`);

            // 2. Get session events
            const events = await instanceLoggerService.getSessionEvents(filename);
            if (!events || events.length === 0) {
                return { success: false, error: "No events found in session" };
            }

            // 3. Extract unique user IDs from PLAYER_JOIN events
            const userIds = new Set<string>();
            (events as SessionEvent[]).forEach((e) => {
                if ((e.type === 'PLAYER_JOIN' || e.type === 'JOIN') && e.actorUserId && e.actorUserId.startsWith('usr_')) {
                    userIds.add(e.actorUserId);
                }
            });

            if (userIds.size === 0) {
                return { success: false, error: "No users with valid IDs found in this session" };
            }

            // 4. Filter out users already in current instance
            const currentPlayers = logWatcherService.getPlayers();
            const currentUserIds = new Set(currentPlayers.map(p => p.userId).filter(Boolean));
            const currentUserId = getCurrentUserId();

            const targetsToInvite = Array.from(userIds).filter(uid =>
                uid !== currentUserId && !currentUserIds.has(uid)
            );

            if (targetsToInvite.length === 0) {
                return { success: false, error: "All users from that session are already here or unavailable" };
            }

            logger.info(`[RallyService] Inviting ${targetsToInvite.length} users from previous session`);

            // Helper to emit progress to all windows
            const emitProgress = (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => {
                windowService.broadcast('rally:progress', data);
            };

            // 5. Send invites with rate limit awareness
            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];
            const total = targetsToInvite.length;

            // Emit initial state
            emitProgress({ sent: 0, skipped: 0, failed: 0, total, done: false });

            for (const userId of targetsToInvite) {
                try {
                    logger.info(`[RallyService] Sending invite to ${userId}...`);

                    // Use InviteService
                    await sendInvite(client, userId, currentLocation, message);

                    successCount++;
                    logger.info(`[RallyService] ✓ Invite sent to ${userId} (${successCount}/${total})`);

                    // Emit progress
                    emitProgress({ sent: successCount, skipped: 0, failed: failCount, total, current: userId });

                    // Small delay between invites to avoid rate limiting
                    await sleep(350);
                } catch (inviteErr: unknown) {
                    const err = inviteErr as VRChatApiError;
                    failCount++;
                    const errMsg = err.response?.data?.error?.message || err.message;
                    logger.warn(`[RallyService] ✗ Failed to invite ${userId}: ${errMsg}`);

                    // Emit progress
                    emitProgress({ sent: successCount, skipped: 0, failed: failCount, total });

                    if (err.response?.status === 429) {
                        errors.push(`Rate limited after ${successCount} invites`);
                        break; // Stop on rate limit
                    }
                    // Continue on other errors
                }
            }

            // Emit completion
            emitProgress({ sent: successCount, skipped: 0, failed: failCount, total, done: true });

            return {
                success: true,
                invited: successCount,
                failed: failCount,
                total: targetsToInvite.length,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (e: unknown) {
            const err = e as VRChatApiError;
            logger.error(`[RallyService] Rally from session failed`, e);
            return { success: false, error: err.message };
        }
    });

    // MASS INVITE FRIENDS
    ipcMain.handle('instance:mass-invite-friends', async (_event, options: { filterAutoMod?: boolean; delayMs?: number; message?: string }) => {
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
            // 1. Check current instance
            const currentWorldId = instanceLoggerService.getCurrentWorldId();
            const currentInstanceId = instanceLoggerService.getCurrentInstanceId();

            if (!currentWorldId || !currentInstanceId) {
                return { success: false, error: "You must be in an instance to invite friends" };
            }

            const currentLocation = `${currentWorldId}:${currentInstanceId}`;
            logger.info(`[RallyService] Starting mass invite to ${currentLocation}`);

            // 2. Fetch ALL Friends (Paginated)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allFriends: any[] = [];
            let offset = 0;
            let hasMore = true;

            // Limit to prevent infinite loops (e.g. 500 friends max for now?)
            const MAX_FRIENDS = 500;

            logger.info(`[RallyService] Fetching friend list...`);

            while (hasMore && allFriends.length < MAX_FRIENDS) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = await (client as any).getFriends({
                        query: { n: 100, offset } // Fetch ALL friends, we'll filter by status later
                    });

                    // Handle different response formats
                    let friends = [];
                    if (Array.isArray(res)) {
                        friends = res;
                    } else if (res?.data && Array.isArray(res.data)) {
                        friends = res.data;
                    } else if (res?.response?.data && Array.isArray(res.response.data)) {
                        friends = res.response.data;
                    } else if (res?.friends && Array.isArray(res.friends)) {
                        friends = res.friends;
                    }

                    logger.info(`[RallyService] getFriends batch: offset=${offset}, got ${friends.length} friends`);

                    if (friends.length === 0) {
                        hasMore = false;
                    } else {
                        allFriends.push(...friends);
                        offset += friends.length;
                        if (friends.length < 100) hasMore = false;
                        await sleep(500); // polite api usage
                    }
                } catch (fetchErr) {
                    logger.error(`[RallyService] Error fetching friends at offset ${offset}:`, fetchErr);
                    hasMore = false; // Stop on error
                }
            }

            logger.info(`[RallyService] Total friends fetched: ${allFriends.length}`);

            // 3. Filter targets
            const currentPlayers = logWatcherService.getPlayers();
            const currentUserId = getCurrentUserId();

            // Pre-filter: not me, online (location !== 'offline' and location !== 'private'), not already here
            let targets = allFriends.filter(f => {
                const isMe = f.id === currentUserId;
                const isOffline = !f.location || f.location === 'offline';
                const isPrivate = f.location === 'private';
                const isAlreadyHere = currentPlayers.some(p => p.userId === f.id);

                // Include friends who are online and not in a private/offline state
                return !isMe && !isOffline && !isPrivate && !isAlreadyHere;
            });

            logger.info(`[RallyService] After online/location filter: ${targets.length} friends`);

            // Filter already invited in session
            const beforeCount = targets.length;
            targets = targets.filter(f => !isUserInvitedThisInstance(currentLocation, f.id));
            logger.info(`[RallyService] Filtered ${beforeCount - targets.length} already invited friends`);

            // 4. AutoMod Filter
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const finalTargets: any[] = [];
            let skippedCount = 0;

            if (options.filterAutoMod) {
                logger.info(`[RallyService] Applying AutoMod filters...`);
                for (const friend of targets) {
                    const evaluation = await autoModRuleService.evaluateUser({
                        id: friend.id,
                        displayName: friend.displayName,
                        bio: friend.bio,
                        status: friend.status,
                        statusDescription: friend.statusDescription,
                        tags: friend.tags,
                        ageVerificationStatus: friend.ageVerificationStatus
                    }, { allowMissingData: true }); // Use lenient mode for mass invite (API limits)

                    if (evaluation.action === 'ALLOW') {
                        finalTargets.push(friend);
                    } else {
                        skippedCount++;
                        logger.info(`[RallyService] Skipped friend ${friend.displayName} due to AutoMod (${evaluation.reason})`);
                    }
                }
            } else {
                finalTargets.push(...targets);
            }

            if (finalTargets.length === 0) {
                return { success: false, error: "No friends found to invite (all offline, already here, or filtered)" };
            }

            // 5. Send Invites
            const emitProgress = (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => {
                windowService.broadcast('mass-invite:progress', data);
            };

            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];
            const total = finalTargets.length;
            const delayMs = options.delayMs || 1500; // Slower default for mass invite

            emitProgress({ sent: 0, skipped: skippedCount, failed: 0, total, done: false });

            for (const friend of finalTargets) {
                try {
                    // Check if invited recently (cache might have updated if parallel?)
                    if (isUserInvitedThisInstance(currentLocation, friend.id)) {
                        continue;
                    }

                    logger.info(`[RallyService] Inviting friend ${friend.displayName} (${friend.id})...`);

                    // Use InviteService
                    await sendInvite(client, friend.id, currentLocation, options.message);

                    successCount++;

                    // Update cache
                    markUserInvited(currentLocation, friend.id);

                    // Emit progress
                    emitProgress({ sent: successCount, skipped: skippedCount, failed: failCount, total, current: friend.displayName });

                    await sleep(delayMs);

                } catch (e: unknown) {
                    const err = e as VRChatApiError;
                    failCount++;
                    const errMsg = err.response?.data?.error?.message || err.message;
                    logger.warn(`[RallyService] Failed to invite ${friend.displayName}: ${errMsg}`);

                    emitProgress({ sent: successCount, skipped: skippedCount, failed: failCount, total });

                    if (err.response?.status === 429) {
                        errors.push(`Rate limited after ${successCount} invites`);
                        break;
                    }
                }
            }

            emitProgress({ sent: successCount, skipped: skippedCount, failed: failCount, total, done: true });

            return {
                success: true,
                invited: successCount,
                skipped: skippedCount,
                failed: failCount,
                total: finalTargets.length
            };

        } catch (e: unknown) {
            const err = e as VRChatApiError;
            logger.error(`[RallyService] Mass invite failed`, e);
            return { success: false, error: err.message };
        }
    });

    logger.info('Rally handlers registered.');
}
