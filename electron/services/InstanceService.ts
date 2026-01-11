import { ipcMain } from 'electron';
import log from 'electron-log';
const logger = log.scope('InstanceService');
import { getVRChatClient, getCurrentUserId } from './AuthService';
import { instanceLoggerService } from './InstanceLoggerService';
import { windowService } from './WindowService';
import { logWatcherService } from './LogWatcherService';
import { groupAuthorizationService } from './GroupAuthorizationService';
import { evaluateUser } from './AutoModLogic';
import { networkService } from './NetworkService';
import { discordWebhookService } from './DiscordWebhookService';


// ============================================
// TYPES
// ============================================

export interface LiveEntity {
    id: string; // userId (usr_...)
    displayName: string;
    rank: string; // 'Visitor' | 'New User' | 'User' | 'Known' | 'Trusted' | 'Veteran' | 'Legend'
    isGroupMember: boolean;
    status: 'active' | 'kicked' | 'joining';
    avatarUrl?: string;
    lastUpdated: number;
}

// Type for VRChat API error responses
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

// Type for group member API response
interface GroupMemberApiResponse {
    id?: string;
    displayName?: string;
    user?: {
        id?: string;
        displayName?: string;
        thumbnailUrl?: string;
    };
}

// Type for session event
interface SessionEvent {
    type: string;
    actorUserId?: string;
}

// ============================================
// CACHE
// ============================================

const entityCache = new Map<string, LiveEntity>();
// Track invited users per instance to prevent spam re-invites
// Key: fullInstanceId, Value: Set<userId>
const recruitmentCache = new Map<string, Set<string>>();

// Rate limit helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function clearRecruitmentCache(fullInstanceKey: string) {
    if (recruitmentCache.has(fullInstanceKey)) {
        recruitmentCache.delete(fullInstanceKey);
        logger.info(`[InstanceService] Cleared recruitment cache for ${fullInstanceKey}`);
    }
}

// Queue for background fetching to avoid 429s
const fetchQueue: string[] = [];
let isFetching = false;

async function processFetchQueue(groupId?: string) {
    if (isFetching || fetchQueue.length === 0) return;
    isFetching = true;

    const client = getVRChatClient();
    if (!client) {
        isFetching = false;
        return;
    }

    try {
        while (fetchQueue.length > 0) {
            const userId = fetchQueue.shift();
            if (!userId) continue;

            const cacheKey = groupId ? `${groupId}:${userId}` : `roam:${userId}`;
            // Double check cache before hitting API
            if (entityCache.has(cacheKey) && entityCache.get(cacheKey)!.rank !== 'Unknown') {
                 continue; 
            }

            logger.info(`[InstanceService] Fetching details for ${userId} (Context: ${groupId || 'Roaming'})...`);

            try {
                // 1. Get User Details (Rank, Avatar)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const userRes = await (client as any).getUser({ path: { userId } });
                const userData = userRes.data;

                // 2. Check Group Membership (Only if groupId provided)
                let isMember = false;
                if (groupId) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (client as any).getGroupMember({ path: { groupId, userId } });
                        isMember = true;
                    } catch {
                        // 404 = not a member
                        isMember = false;
                    }
                }

                // Update Cache
                const displayName = userData?.displayName || 'Unknown';
                
                // Determine Trust Rank via tags
                let rank = 'User';
                const tags = userData?.tags || [];
                if (tags.includes('system_trust_legend')) rank = 'Legend';
                else if (tags.includes('system_trust_veteran')) rank = 'Veteran';
                else if (tags.includes('system_trust_trusted')) rank = 'Trusted';
                else if (tags.includes('system_trust_known')) rank = 'Known';
                else if (tags.includes('system_trust_basic')) rank = 'User';
                else if (tags.includes('system_trust_visitor')) rank = 'Visitor';

                const entity: LiveEntity = {
                    id: userId,
                    displayName,
                    rank,
                    isGroupMember: isMember,
                    status: 'active',
                    // Prioritize persistent profile pictures (userIcon via VRC+) over current avatar thumbnail
                    avatarUrl: userData?.userIcon || userData?.profilePicOverride || userData?.currentAvatarThumbnailImageUrl || '',
                    lastUpdated: Date.now()
                };

                entityCache.set(cacheKey, entity);
                
                // Emit update to UI
                // We send the single entity update to let UI merge it
                // Emit update to UI
                // We send the single entity update to let UI merge it
                windowService.broadcast('instance:entity-update', entity);

            } catch (err) {
                logger.warn(`[InstanceService] Failed to fetch data for ${userId}`, err);
            }
            
            // PERSIST DETAILS TO DISK (SESSION DB)
            // We do this here to ensure 'rank' and 'isGroupMember' are saved to history.
            try {
                 // Dynamic import to avoid circular dependency
                 const { instanceLoggerService } = await import('./InstanceLoggerService');
                 const cacheKey = groupId ? `${groupId}:${userId}` : `roam:${userId}`;
                 const entity = entityCache.get(cacheKey);
                 
                 if (entity) {
                     instanceLoggerService.logEnrichedEvent('PLAYER_DETAILS', {
                         userId: entity.id,
                         displayName: entity.displayName,
                         rank: entity.rank,
                         isGroupMember: entity.isGroupMember,
                         timestamp: new Date().toISOString()
                     });
                 }
            } catch (e) {
                logger.error('[InstanceService] Failed to persist enriched details', e);
            }

            // Respect rate limits!
            await sleep(2000); 
        }
    } catch (e) {
        logger.error('[InstanceService] Queue processor fatal error', e);
    } finally {
        isFetching = false;
        // Check if more came in
        if (fetchQueue.length > 0) processFetchQueue(groupId);
    }
}


export function setupInstanceHandlers() {
    
    // SCAN SECTOR
    ipcMain.handle('instance:scan-sector', async (_event, { groupId }: { groupId?: string }) => {
        try {
            // 1. Get Log Players - Use public API now
            // logWatcherService is imported above
            
            const players = logWatcherService.getPlayers();
            
            const results: LiveEntity[] = [];

            for (const p of players) {
                // If we don't have a userId from logs yet (older logs might disable it), we can't query API easily.
                // Assuming LogWatcher regex captures userId (usr_...)
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

                const cacheKey = groupId ? `${groupId}:${p.userId}` : `roam:${p.userId}`;
                if (entityCache.has(cacheKey)) {
                    results.push(entityCache.get(cacheKey)!);
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
                    
                    // Queue fetch
                    if (!fetchQueue.includes(p.userId)) {
                        fetchQueue.push(p.userId);
                    }
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

    // HELPER: Send Invite with Custom Message Support
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendCustomInvite = async (client: any, userId: string, location: string, message?: string) => {
        // Slot 11 = Slot 12 in UI (0-indexed)
        const SLOT_INDEX = 11; 

        // 2. Send Invite
        const body: any = { instanceId: location };
        
        // Only use the slot if we successfully updated it (or if it's safe to assume)
        // In the try/catch above, we should track success.
        
        // Refactored logic:
        let slotUpdated = false;
        if (message) {
             try {
                // 1. Overwrite Slot
                logger.info(`[InstanceService] Overwriting Invite Slot ${SLOT_INDEX} with: "${message}"`);
                await client.updateInviteMessage({
                    path: { slot: SLOT_INDEX },
                    body: { message: message.substring(0, 64) }
                });
                await sleep(200);
                slotUpdated = true;
            } catch (e: any) {
                logger.warn(`[InstanceService] Failed to update invite message slot: ${e.message}. Sending standard invite to avoid stale message.`);
                slotUpdated = false;
            }
        }

        if (slotUpdated) {
            body.messageSlot = SLOT_INDEX;
        }

        return await client.inviteUser({ 
            path: { userId },
            body: body
        });
    };

    // RECRUIT (Invite User to Group)
    ipcMain.handle('instance:recruit-user', async (_event, { groupId, userId, message }: { groupId: string, userId: string, message?: string }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:recruit-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };
        
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        // Resolve current instance for cache key
        const currentWorldId = instanceLoggerService.getCurrentWorldId();
        const currentInstanceId = instanceLoggerService.getCurrentInstanceId();
        const fullInstanceKey = currentWorldId && currentInstanceId ? `${currentWorldId}:${currentInstanceId}` : 'global_session_fallback';

        if (recruitmentCache.has(fullInstanceKey) && recruitmentCache.get(fullInstanceKey)!.has(userId)) {
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
           
           if (result.error) throw result.error; // Will be caught by execute

           // Add to cache
           if (!recruitmentCache.has(fullInstanceKey)) recruitmentCache.set(fullInstanceKey, new Set());
           recruitmentCache.get(fullInstanceKey)!.add(userId);

           return { success: true };
        }, `instance:recruit-user:${userId}`).then(res => {
             // Map specific errors if needed
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
           discordWebhookService.sendEvent(
               groupId,
               '🔓 Member Unbanned',
               `**User**: ${userId}\n**Unbanned By**: ${getCurrentUserId() || 'Unknown'}`,
               0x57F287 
           );

           return { success: true };
        }, `instance:unban-user:${userId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // KICK (Ban from Group)
    ipcMain.handle('instance:kick-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:kick-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };
        
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
           logger.info(`[InstanceService] Kicking ${userId} from group ${groupId} (Ban + Unban sequence)`);
           
           // 1. BAN (Remove from group)
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const banResult = await (client as any).banGroupMember({ 
               path: { groupId },
               body: { userId }
           });
           
           if (banResult.error) throw new Error(`Kick failed (Ban stage): ${(banResult.error as any).message}`);

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
           
           
           // WEBHOOK
           discordWebhookService.sendEvent(
               groupId,
               '🥾 User Kicked',
               `**User**: ${userId}\n**Action**: Soft Kick (Ban+Unban)\n**Instance**: ${instanceLoggerService.getCurrentInstanceId() || 'Unknown'}`,
               0xFEE75C
           );

           return { success: true };
        }, `instance:kick-user:${userId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

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
             if (recruitmentCache.has(fullInstanceKey) && recruitmentCache.get(fullInstanceKey)!.has(userId)) {
                 logger.info(`[InstanceService] CACHE HIT: Skipping instance invite for ${userId}`);
                 return { success: true, cached: true };
             }
              
             const fullId = `${worldId}:${instanceId}`;

             // Use Custom Invite Helper
             await sendCustomInvite(client, userId, fullId, message);
             
             // Update cache
             if (!recruitmentCache.has(fullInstanceKey)) recruitmentCache.set(fullInstanceKey, new Set());
             recruitmentCache.get(fullInstanceKey)!.add(userId);

             return { success: true };
         }, `instance:invite-to-current:${userId}`).then(res => {
             if (res.error === 'Rate Limited') return { success: false, error: 'RATE_LIMIT' };
             if (res.success) {
                 // Check if it returned a cached result
                 if (res.data && (res.data as any).cached) return { success: true, cached: true };
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
             logger.info(`[InstanceService] Rally from session ${filename} to ${currentLocation}`);
             
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
             
             logger.info(`[InstanceService] Inviting ${targetsToInvite.length} users from previous session`);
             
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
                     logger.info(`[InstanceService] Sending invite to ${userId}...`);
                     
                     // Use Custom Invite Helper
                     await sendCustomInvite(client, userId, currentLocation, message);

                     successCount++;
                     logger.info(`[InstanceService] ✓ Invite sent to ${userId} (${successCount}/${total})`);
                     
                     // Emit progress
                     emitProgress({ sent: successCount, skipped: 0, failed: failCount, total, current: userId });
                     
                     // Small delay between invites to avoid rate limiting
                     await sleep(350);
                 } catch (inviteErr: unknown) {
                     const err = inviteErr as VRChatApiError;
                     failCount++;
                     const errMsg = err.response?.data?.error?.message || err.message;
                     logger.warn(`[InstanceService] ✗ Failed to invite ${userId}: ${errMsg}`);
                     
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
             logger.error(`[InstanceService] Rally from session failed`, e);
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
            logger.info(`[InstanceService] Starting mass invite to ${currentLocation}`);

            // 2. Fetch ALL Friends (Paginated)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allFriends: any[] = [];
            let offset = 0;
            let hasMore = true;
            
            // Limit to prevent infinite loops (e.g. 500 friends max for now?)
            const MAX_FRIENDS = 500;
            
            logger.info(`[InstanceService] Fetching friend list...`);
            
            while (hasMore && allFriends.length < MAX_FRIENDS) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = await (client as any).getFriends({ 
                        query: { n: 100, offset } // Fetch ALL friends, we'll filter by status later
                    });
                    
                    // Log raw response type and structure for debugging
                    logger.info(`[InstanceService] getFriends raw response type: ${typeof res}`);
                    if (res) {
                        logger.info(`[InstanceService] getFriends response keys: ${JSON.stringify(Object.keys(res))}`);
                    }
                    
                    // Handle different response formats
                    let friends = [];
                    if (Array.isArray(res)) {
                        friends = res;
                        logger.info(`[InstanceService] Response is direct array`);
                    } else if (res?.data && Array.isArray(res.data)) {
                        friends = res.data;
                        logger.info(`[InstanceService] Response has .data array`);
                    } else if (res?.response?.data && Array.isArray(res.response.data)) {
                        friends = res.response.data;
                        logger.info(`[InstanceService] Response has .response.data array`);
                    } else {
                        // Try to find the array somewhere in the response
                        logger.warn(`[InstanceService] Unexpected response format. Trying to parse...`);
                        logger.info(`[InstanceService] Raw response: ${JSON.stringify(res).substring(0, 500)}`);
                        
                        // Maybe it's in a 'friends' property?
                        if (res?.friends && Array.isArray(res.friends)) {
                            friends = res.friends;
                        }
                    }
                    
                    logger.info(`[InstanceService] getFriends batch: offset=${offset}, got ${friends.length} friends`);
                    
                    if (friends.length === 0) {
                        hasMore = false;
                    } else {
                        allFriends.push(...friends);
                        offset += friends.length;
                        if (friends.length < 100) hasMore = false;
                        await sleep(500); // polite api usage
                    }
                } catch (fetchErr) {
                    logger.error(`[InstanceService] Error fetching friends at offset ${offset}:`, fetchErr);
                    hasMore = false; // Stop on error
                }
            }

            logger.info(`[InstanceService] Total friends fetched: ${allFriends.length}`);
            
            // Debug: Log first friend structure to understand the data
            if (allFriends.length > 0) {
                logger.info(`[InstanceService] Sample friend structure: ${JSON.stringify(Object.keys(allFriends[0]))}`);
                logger.info(`[InstanceService] Sample friend location: ${allFriends[0].location}, status: ${allFriends[0].status}`);
            }

             // 3. Filter targets
             const currentPlayers = logWatcherService.getPlayers();
             const currentUserId = getCurrentUserId();
             
             logger.info(`[InstanceService] Current user ID: ${currentUserId}, Players in instance: ${currentPlayers.length}`);
             
             // Pre-filter: not me, online (location !== 'offline' and location !== 'private'), not already here
             let targets = allFriends.filter(f => {
                  const isMe = f.id === currentUserId;
                  const isOffline = !f.location || f.location === 'offline';
                  const isPrivate = f.location === 'private';
                  const isAlreadyHere = currentPlayers.some(p => p.userId === f.id);
                  
                  // Include friends who are online and not in a private/offline state
                  return !isMe && !isOffline && !isPrivate && !isAlreadyHere;
             });
             
             logger.info(`[InstanceService] After online/location filter: ${targets.length} friends`);

             // Filter already invited in session
             if (recruitmentCache.has(currentLocation)) {
                 const invitedSet = recruitmentCache.get(currentLocation)!;
                 const beforeCount = targets.length;
                 targets = targets.filter(f => !invitedSet.has(f.id));
                 logger.info(`[InstanceService] Filtered ${beforeCount - targets.length} already invited friends`);
             }

             logger.info(`[InstanceService] Candidates after basic filtering: ${targets.length}`);

             // 4. AutoMod Filter
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const finalTargets: any[] = [];
             let skippedCount = 0;

             if (options.filterAutoMod) {
                 logger.info(`[InstanceService] Applying AutoMod filters...`);
                 for (const friend of targets) {
                      const evaluation = await evaluateUser({
                          id: friend.id,
                          displayName: friend.displayName,
                          bio: friend.bio,
                          status: friend.status,
                          statusDescription: friend.statusDescription,
                          tags: friend.tags,
                          ageVerificationStatus: friend.ageVerificationStatus
                          // pronouns not in standard friend obj?
                      }, { allowMissingData: true }); // Use lenient mode for mass invite (API limits)
                      
                      if (evaluation.action === 'ALLOW') {
                          finalTargets.push(friend);
                      } else {
                          skippedCount++;
                          logger.info(`[InstanceService] Skipped friend ${friend.displayName} due to AutoMod (${evaluation.reason})`);
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
                     // Check if invited recently (cache might have updated if parallel?)s
                     if (recruitmentCache.get(currentLocation)?.has(friend.id)) {
                         continue;
                     }

                     logger.info(`[InstanceService] Inviting friend ${friend.displayName} (${friend.id})...`);
                     
                     // Use Custom Invite Helper
                     await sendCustomInvite(client, friend.id, currentLocation, options.message);
                     
                     successCount++;
                     
                     // Update cache
                     if (!recruitmentCache.has(currentLocation)) {
                        recruitmentCache.set(currentLocation, new Set());
                     }
                     recruitmentCache.get(currentLocation)!.add(friend.id);
                     
                     // Emit progress
                     emitProgress({ sent: successCount, skipped: skippedCount, failed: failCount, total, current: friend.displayName });
                     
                     await sleep(delayMs);

                 } catch (e: unknown) {
                     const err = e as VRChatApiError;
                     failCount++;
                     const errMsg = err.response?.data?.error?.message || err.message;
                     logger.warn(`[InstanceService] Failed to invite ${friend.displayName}: ${errMsg}`);
                     
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
            logger.error(`[InstanceService] Mass invite failed`, e);
            return { success: false, error: err.message };
        }
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
             
             if (response?.error) throw new Error(response.error.message || safeStringify(response.error));
             
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
         
         const client = getVRChatClient();
         if (client) {
              const res = await networkService.execute(async () => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const wRes = await (client as any).getWorld({ path: { worldId } });
                  return {
                      imageUrl: wRes.data?.thumbnailImageUrl || wRes.data?.imageUrl,
                      name: wRes.data?.name
                  };
              }, `instance:get-instance-info:${worldId}`);
              
              if (res.success && res.data) {
                  imageUrl = res.data.imageUrl;
                  apiName = res.data.name;
              } else {
                   // Fallback used (or error ignored), just log if needed
                   logger.warn(`[InstanceService] Failed to fetch world info via API: ${res.error}`);
              }
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
}
