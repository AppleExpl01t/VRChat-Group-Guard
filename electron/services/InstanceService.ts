import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
const logger = log.scope('InstanceService');
import { getVRChatClient, getCurrentUserId } from './AuthService';
import { instanceLoggerService } from './InstanceLoggerService';
import { logWatcherService } from './LogWatcherService';
import { groupAuthorizationService } from './GroupAuthorizationService';


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

// Rate limit helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
                const windows = BrowserWindow.getAllWindows();
                for (const win of windows) {
                    win.webContents.send('instance:entity-update', entity);
                }

            } catch (err) {
                logger.warn(`[InstanceService] Failed to fetch data for ${userId}`, err);
            }
            
            // PERSIST DETAILS TO DISK (SESSION DB)
            // We do this here to ensure 'rank' and 'isGroupMember' are saved to history.
            try {
                 const { instanceLoggerService } = require('./InstanceLoggerService');
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

    // RECRUIT (Invite User to Group)
    ipcMain.handle('instance:recruit-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:recruit-user');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }
        
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
           logger.info(`[InstanceService] Inviting ${userId} to group ${groupId}...`);
           
           // Correct API method for 'Invite User to Group' is createGroupInvite (POST /groups/:groupId/invites)
           // Requires 'userId' in the body.
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const result = await (client as any).createGroupInvite({ 
               path: { groupId },
               body: { userId }
           });
           
           logger.info(`[InstanceService] createGroupInvite Raw Result for ${userId}:`, JSON.stringify(result, null, 2));

           // Check for SDK error pattern
           if (result.error) {
               const errorMsg = result.error?.message || JSON.stringify(result.error);
               logger.error(`[InstanceService] API error inviting ${userId}: ${errorMsg}`);
               return { success: false, error: errorMsg };
           }
           
           logger.info(`[InstanceService] Recruitment success for ${userId}`);
           return { success: true };
        } catch (e: unknown) {
            const err = e as VRChatApiError;
            logger.error(`[InstanceService] Exception inviting ${userId}:`, e);
            
            // Check for rate limit
            if (err.response && err.response.status === 429) {
                 logger.warn(`[InstanceService] Rate limited (429) recruiting ${userId}`);
                 return { success: false, error: 'RATE_LIMIT' }; // Frontend can handle this specifically
            }

            // If user is already in group or invited, API throws.
            const msg = err.response?.data?.error?.message || err.message;
            logger.warn(`[InstanceService] Failed to recruit ${userId}: ${msg}`);
            return { success: false, error: msg };
        }
    });
    
    // UNBAN (Unban User from Group)
    ipcMain.handle('instance:unban-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:unban-user');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }
        
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
           logger.info(`[InstanceService] Unbanning ${userId} from group ${groupId}...`);
           
           // API: DELETE /groups/{groupId}/bans/{userId}
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const result = await (client as any).unbanGroupMember({ 
               path: { groupId, userId }
           });
           
           // Check for SDK error pattern
           if (result.error) {
               const errorMsg = result.error?.message || JSON.stringify(result.error);
               logger.error(`[InstanceService] API error unbanning ${userId}: ${errorMsg}`);
               return { success: false, error: errorMsg };
           }
           
           logger.info(`[InstanceService] Unban successful for ${userId}`);
           return { success: true };
        } catch (e: unknown) {
            const err = e as VRChatApiError;
            const msg = err.response?.data?.error?.message || err.message;
            logger.warn(`[InstanceService] Failed to unban ${userId}: ${msg}`);
            return { success: false, error: msg };
        }
    });

    // KICK (Ban from Group)
    ipcMain.handle('instance:kick-user', async (_event, { groupId, userId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:kick-user');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }
        
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
           logger.info(`[InstanceService] Kicking (Banning) ${userId} from group ${groupId}`);
           // Ban user from group (effectively kicks them from group instance)
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const result = await (client as any).banGroupMember({ 
               path: { groupId, userId }
           });
           
           // Check for SDK error pattern
           if (result.error) {
               const errorMsg = result.error?.message || JSON.stringify(result.error);
               logger.error(`[InstanceService] API error kicking ${userId}: ${errorMsg}`);
               return { success: false, error: errorMsg };
           }

           return { success: true };
        } catch (e: unknown) {
            const err = e as VRChatApiError;
            logger.error(`[InstanceService] Failed to kick ${userId}`, e);
            return { success: false, error: err.message };
        }
    });

    // RALLY: FETCH TARGETS
    ipcMain.handle('instance:get-rally-targets', async (_event, { groupId }) => {
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'instance:get-rally-targets');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }
        
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");
        
        try {
            // Get recent 50 members
            // We can't easily filter by "online" via standard API efficiently without checking each.
            // So we'll just fetch the most recent members (likely active).
            // Or maybe 'last_login' sort if available? 'joinedAt' is safest.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const memRes = await (client as any).getGroupMembers({ 
                path: { groupId },
                query: { n: 50, offset: 0, sort: 'joinedAt:desc' } 
            });
            
            const members = memRes.data || [];
            const currentUserId = getCurrentUserId();
            
            // Map to frontend friendly format
            // Map to frontend friendly format
            const targets = members
                .map((m: GroupMemberApiResponse) => ({
                    id: m.user?.id,
                    displayName: m.user?.displayName,
                    thumbnailUrl: m.user?.thumbnailUrl
                }))
                .filter((t: { id?: string; displayName?: string }) => {
                     // 1. Allow self (User requested to receive notification/invite too)
                     if (!t.id) return false;
                     if (t.id === currentUserId) return true;

                     // 2. Exclude users already here (from LogWatcher)
                     const players = logWatcherService.getPlayers();
                     const isHere = players.some(p => 
                        (p.userId && p.userId === t.id) || 
                        (p.displayName && p.displayName === t.displayName)
                     );
                     
                     return !isHere;
                });

            return { success: true, targets };
        } catch (e: unknown) {
             const err = e as VRChatApiError;
             logger.error(`[InstanceService] Failed to fetch rally targets`, e);
             return { success: false, error: err.message };
        }
    });

    // RALLY: INVITE SINGLE USER TO CURRENT INSTANCE
    ipcMain.handle('instance:invite-to-current', async (_event, { userId }) => {
         const client = getVRChatClient();
         if (!client) throw new Error("Not authenticated");

         try {
             // Resolve current instance
             const worldId = instanceLoggerService.getCurrentWorldId();
             const instanceId = instanceLoggerService.getCurrentInstanceId();
             
             if (!worldId || !instanceId) {
                 return { success: false, error: "No active instance" };
             }
             
              const fullId = `${worldId}:${instanceId}`;

             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             await (client as any).inviteUser({ 
                 path: { userId },
                 body: { instanceId: fullId }
             });
             
             return { success: true };
         } catch (e: unknown) {
             const err = e as VRChatApiError;
             // Rate Limit Check
             if (err.response && err.response.status === 429) {
                 return { success: false, error: 'RATE_LIMIT' };
             }
             const msg = err.response?.data?.error?.message || err.message;
             return { success: false, error: msg };
         }
    });

    // RALLY FROM PREVIOUS SESSION: Get users from a session file and invite them
    ipcMain.handle('instance:rally-from-session', async (_event, { filename }) => {
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
             const events = instanceLoggerService.getSessionEvents(filename);
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
             const emitProgress = (data: { sent: number; failed: number; total: number; current?: string; done?: boolean }) => {
                 BrowserWindow.getAllWindows().forEach(win => {
                     if (!win.isDestroyed()) {
                         win.webContents.send('rally:progress', data);
                     }
                 });
             };
             
             // 5. Send invites with rate limit awareness
             let successCount = 0;
             let failCount = 0;
             const errors: string[] = [];
             const total = targetsToInvite.length;
             
             // Emit initial state
             emitProgress({ sent: 0, failed: 0, total, done: false });
             
             for (const userId of targetsToInvite) {
                 try {
                     logger.info(`[InstanceService] Sending invite to ${userId}...`);
                     
                     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                     await (client as any).inviteUser({ 
                         path: { userId },
                         body: { instanceId: currentLocation }
                     });
                     successCount++;
                     logger.info(`[InstanceService] ✓ Invite sent to ${userId} (${successCount}/${total})`);
                     
                     // Emit progress
                     emitProgress({ sent: successCount, failed: failCount, total, current: userId });
                     
                     // Small delay between invites to avoid rate limiting
                     await sleep(350);
                 } catch (inviteErr: unknown) {
                     const err = inviteErr as VRChatApiError;
                     failCount++;
                     const errMsg = err.response?.data?.error?.message || err.message;
                     logger.warn(`[InstanceService] ✗ Failed to invite ${userId}: ${errMsg}`);
                     
                     // Emit progress
                     emitProgress({ sent: successCount, failed: failCount, total });
                     
                     if (err.response?.status === 429) {
                         errors.push(`Rate limited after ${successCount} invites`);
                         break; // Stop on rate limit
                     }
                     // Continue on other errors
                 }
             }
             
             // Emit completion
             emitProgress({ sent: successCount, failed: failCount, total, done: true });
             
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
    
    // CLOSE INSTANCE - Using SDK closeInstance method
    ipcMain.handle('instance:close-instance', async (_event, args?: { worldId?: string; instanceId?: string }) => {
         const client = getVRChatClient();
         if (!client) throw new Error("Not authenticated");

         try {
             // Resolve instance to close: provided args or current
             let worldId = args?.worldId;
             let instanceId = args?.instanceId;

             if (!worldId || !instanceId) {
                 worldId = instanceLoggerService.getCurrentWorldId();
                 instanceId = instanceLoggerService.getCurrentInstanceId();
             }
             
             if (!worldId || !instanceId) {
                 return { success: false, error: "No active instance to close and none specified" };
             }

             logger.warn(`[InstanceService] Closing instance - worldId: ${worldId}, instanceId: ${instanceId}`);
             
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const response = await (client as any).closeInstance({ 
                 path: { worldId, instanceId },
                 query: { hardClose: true }
             });
             
             // Safe stringify helper for BigInt
             const safeStringify = (obj: unknown) => JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
             
             logger.info(`[InstanceService] closeInstance raw response:`, safeStringify(response));
             
             // Check for SDK error pattern
             if (response?.error) {
                 const errorMsg = response.error?.message || safeStringify(response.error);
                 logger.error(`[InstanceService] API returned error:`, errorMsg);
                 return { success: false, error: errorMsg };
             }
             
             logger.info(`[InstanceService] Instance closed successfully.`);
             return { success: true };
             
         } catch (e: unknown) {
             const err = e as VRChatApiError & { name?: string; stack?: string };
             logger.error(`[InstanceService] Exception closing instance:`, e);
             const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
             return { success: false, error: msg };
         }
    });

    // INVITE SELF (Join Instance)
    ipcMain.handle('instance:invite-self', async (_event, { worldId, instanceId }: { worldId: string, instanceId: string }) => {
        const client = getVRChatClient();
        if (!client) throw new Error("Not authenticated");

        try {
            logger.info(`[InstanceService] Inviting self to ${worldId}:${instanceId}`);
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (client as any).inviteMyselfTo({ 
                path: { worldId, instanceId }
            });

            if (result.error) {
                const errorMsg = result.error?.message || JSON.stringify(result.error);
                return { success: false, error: errorMsg };
            }

            return { success: true };
        } catch (e: unknown) {
             const err = e as VRChatApiError;
             const msg = err.response?.data?.error?.message || err.message;
             return { success: false, error: msg };
        }
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
              try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const wRes = await (client as any).getWorld({ path: { worldId } });
                  imageUrl = wRes.data?.thumbnailImageUrl || wRes.data?.imageUrl;
                  apiName = wRes.data?.name;
              } catch {
                  // ignore API fail, fallback to log name
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
}
