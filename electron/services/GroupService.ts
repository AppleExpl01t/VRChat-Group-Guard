import { ipcMain } from 'electron';
import log from 'electron-log';
const logger = log.scope('GroupService');
import { getVRChatClient, getCurrentUserId, getAuthCookieString } from './AuthService';
import { databaseService } from './DatabaseService';
import { groupAuthorizationService } from './GroupAuthorizationService';

export function setupGroupHandlers() {

  // Get user's groups (groups where user is a member)
  ipcMain.handle('groups:get-my-groups', async () => {
    try {
      const client = getVRChatClient();
      const userId = getCurrentUserId();
      
      logger.debug('groups:get-my-groups called', { hasClient: !!client, userId });
      
      if (!client || !userId) {
        logger.warn('Auth check failed in GroupService');
        throw new Error("Not authenticated. Please log in first.");
      }

      logger.info(`Fetching user groups for user ID: "${userId}" (type: ${typeof userId})`);
      
      // Sanitize userId
      const safeUserId = userId.trim();
      if (!safeUserId.startsWith('usr_')) {
          logger.error(`Invalid User ID format: ${safeUserId}`);
          throw new Error(`Invalid User ID: ${safeUserId}`);
      }
      
      // Reverting to Object Syntax as positional caused "malformed url"
      const response = await client.getUserGroups({ 
        path: { userId: safeUserId },
        query: { n: 100, offset: 0 }
      });

      if (response.error) {
        logger.error('getUserGroups returned error:', response.error);
        throw new Error((response.error as { message?: string }).message || 'Failed to fetch groups');
      }

      const groups = response.data || [];
      
      // Filter for groups where user has moderation powers
      interface GroupMembershipData {
        id: string;
        groupId?: string;
        ownerId?: string;
        myMember?: { permissions?: string[] };
        [key: string]: unknown;
      }
      const moderatableGroups = (groups as GroupMembershipData[]).filter((g) => {
        const isOwner = g.ownerId === safeUserId;
        const hasPermissions = g.myMember?.permissions && Array.isArray(g.myMember.permissions) && g.myMember.permissions.length > 0;
        return isOwner || hasPermissions;
      });

      // map the groups to ensure 'id' is the Group ID (grp_), not the Member ID (gmem_)
      const mappedGroups = moderatableGroups.map((g) => {
        // VRChat API getUserGroups returns membership objects.
        // g.id is the Membership ID (gmem_...)
        // g.groupId is the actual Group ID (grp_...)
        // We want the frontend to see 'id' as the Group ID.
        if (g.groupId && typeof g.groupId === 'string' && g.groupId.startsWith('grp_')) {
            return {
                ...g,
                id: g.groupId,      // helper for frontend
                _memberId: g.id     // preserve original membership ID
            };
        }
        return g;
      });

      logger.info(`Fetched ${groups.length} total groups. Filtered to ${mappedGroups.length} moderatable groups.`);
      
      // Update InstanceLoggerService with allowed groups
      try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { instanceLoggerService } = require('./InstanceLoggerService');
          instanceLoggerService.setAllowedGroups(mappedGroups.map(g => g.id));
      } catch (e) {
          logger.error('Failed to update instance logger allowed groups', e);
      }

      return { success: true, groups: mappedGroups };

    } catch (error: unknown) {
      const err = error as { message?: string; response?: { status?: number }; stack?: string; config?: unknown };
      logger.error('Failed to fetch groups:', { message: err.message, stack: err.stack });
      if (err.response?.status === 401) return { success: false, error: 'Session expired. Please log in again.' };
      return { success: false, error: err.message || 'Failed to fetch groups' };
    }
  });

  // Get specific group details
  ipcMain.handle('groups:get-details', async (_event, { groupId }: { groupId: string }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-details');
      
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
  
      // Revert to Object Syntax
      const response = await client.getGroup({ path: { groupId } });
      
      if (response.error) throw response.error;
      return { success: true, group: response.data };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch group details:', error);
      return { success: false, error: err.message || 'Failed to fetch group' };
    }
  });

  // Get world details
  ipcMain.handle('worlds:get-details', async (_event, { worldId }: { worldId: string }) => {
    try {
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
  
      // Revert to Object Syntax
      const response = await client.getWorld({ path: { worldId } });
      
      if (response.error) throw response.error;
      return { success: true, world: response.data };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch world details:', error);
      return { success: false, error: err.message || 'Failed to fetch world' };
    }
  });

  // Get group members
  ipcMain.handle('groups:get-members', async (_event, { groupId, n = 100, offset = 0 }: { groupId: string; n?: number; offset?: number }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-members');
      
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
  
      // Revert to Object Syntax
      const response = await client.getGroupMembers({ 
        path: { groupId },
        query: { n, offset }
      });
      
      if (response.error) throw response.error;
      return { success: true, members: response.data ?? [] };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch group members:', error);
      return { success: false, error: err.message || 'Failed to fetch members' };
    }
  });

  // Helper to extract array from VRChat API response
  // Some endpoints return Array, others return { results: Array } or { instances: Array }
  const extractArray = (data: unknown): unknown[] => {
      if (Array.isArray(data)) return data;
      const obj = data as Record<string, unknown> | null;
      if (obj && Array.isArray(obj.results)) return obj.results;
      if (obj && Array.isArray(obj.instances)) return obj.instances;
      return [];
  };

  // Search group members (fetches members and filters client-side)
  // Note: VRChat API may not support server-side search on getGroupMembers
  ipcMain.handle('groups:search-members', async (_event, { groupId, query, n = 15 }: { groupId: string; query: string; n?: number }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:search-members');
      
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
      
      const searchQuery = query.toLowerCase().trim();
      logger.info(`Searching members in group ${groupId} for "${searchQuery}"`);
      
      // Fetch a larger batch of members to search through
      // We'll paginate through multiple pages to find matches
      const allMembers: unknown[] = [];
      const batchSize = 100;
      const maxBatches = 5; // Up to 500 members
      
      for (let batch = 0; batch < maxBatches; batch++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (client as any).getGroupMembers({ 
          path: { groupId },
          query: { 
            n: batchSize, 
            offset: batch * batchSize
          }
        });
        
        if (response.error) throw response.error;
        
        const members = response.data ?? [];
        if (members.length === 0) break; // No more members
        
        allMembers.push(...members);
        
        // Stop if we've found enough matches
        interface MemberData {
          user?: {
            displayName?: string;
            username?: string;
          };
        }
        const matches = allMembers.filter((m: unknown) => {
          const member = m as MemberData;
          const displayName = member.user?.displayName?.toLowerCase() || '';
          const username = member.user?.username?.toLowerCase() || '';
          return displayName.includes(searchQuery) || username.includes(searchQuery);
        });
        
        if (matches.length >= n) break;
        
        // Don't fetch more if we got less than a full batch (end of list)
        if (members.length < batchSize) break;
      }
      
      // Filter and limit results
      interface MemberData {
        user?: {
          displayName?: string;
          username?: string;
        };
      }
      const filteredMembers = allMembers.filter((m: unknown) => {
        const member = m as MemberData;
        const displayName = member.user?.displayName?.toLowerCase() || '';
        const username = member.user?.username?.toLowerCase() || '';
        return displayName.includes(searchQuery) || username.includes(searchQuery);
      }).slice(0, n);
      
      logger.info(`Found ${filteredMembers.length} members matching "${searchQuery}" (searched ${allMembers.length} total)`);
      
      return { success: true, members: filteredMembers };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to search group members:', error);
      return { success: false, error: err.message || 'Failed to search members' };
    }
  });

  // Get group join requests
  ipcMain.handle('groups:get-requests', async (_event, { groupId }: { groupId: string }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-requests');
      
      const client = getVRChatClient();
      logger.info(`Fetching requests for group ${groupId}`);
      if (!client) throw new Error("Not authenticated");
  
      // Revert to Object Syntax
      const response = await client.getGroupRequests({ 
          path: { groupId },
          query: { n: 100, offset: 0 }
      });
      
      const requests = extractArray(response.data);
      logger.info(`Requests fetch detected ${requests.length} items for ${groupId}`);
      
      if (response.error) {
        logger.error('API Error in getGroupRequests:', response.error);
        throw response.error;
      }
      return { success: true, requests };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch join requests:', error);
      return { success: false, error: err.message || 'Failed to fetch requests' };
    }
  });

  // Get group bans
  ipcMain.handle('groups:get-bans', async (_event, { groupId }: { groupId: string }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-bans');
      
      const client = getVRChatClient();
      logger.info(`Fetching bans for group ${groupId}`);
      if (!client) throw new Error("Not authenticated");
  
      // Revert to Object Syntax
      const response = await client.getGroupBans({ 
        path: { groupId },
        query: { n: 100, offset: 0 }
      });
      
      const bans = extractArray(response.data);
      logger.info(`Bans fetch detected ${bans.length} items for ${groupId}`);

      if (response.error) {
         logger.error('API Error in getGroupBans:', response.error);
         throw response.error;
      }
      return { success: true, bans };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch bans:', error);
      return { success: false, error: err.message || 'Failed to fetch bans' };
    }
  });


  // Get group audit logs

  ipcMain.handle('groups:get-audit-logs', async (_event, { groupId }: { groupId: string }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-audit-logs');
      
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
      
      // 1. Fetch Remote API Logs
      let setLogs: unknown[] = [];
      try {
          const response = await client.getGroupAuditLogs({ 
              path: { groupId },
              query: { n: 100, offset: 0 }
          });
          if (!response.error) {
              setLogs = extractArray(response.data);
          }
      } catch (e) {
          logger.warn('Failed to fetch remote audit logs', e);
      }

      // 2. Fetch Local AutoMod Logs
      interface LocalLogEntry {
            id: number;
            timestamp: Date | string;
            userId: string;
            user: string;
            groupId: string;
            action: string;
            reason: string;
            module: string;
            details: unknown;
      }
      
      let localLogs: unknown[] = [];
      try {
          const autoModLogs = (await databaseService.getAutoModLogs()) as LocalLogEntry[];
          // Filter for this group and map to AuditLogEntry shape
          localLogs = autoModLogs
              .filter((l) => l.groupId === groupId)
              .map((l) => ({
                  id: l.id,
                  created_at: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp,
                  type: 'group.automod', // Custom type
                  eventType: `automod.request.${l.action.toLowerCase()}`, // for filtering (includes 'request')
                  actorId: 'automod',
                  actorDisplayName: 'AutoMod',
                  targetId: l.userId,
                  targetDisplayName: l.user,
                  description: `${l.action}: ${l.reason}`,
                  data: {
                      details: l.details,
                      module: l.module
                  }
              }));
      } catch (e) {
          logger.error('Failed to fetch local AutoMod logs', e);
      }

      // 3. Merge and Sort
      const allLogs = [...setLogs, ...localLogs].sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA; // Newest first
      });
      
      return { success: true, logs: allLogs };
      
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch audit logs:', error);
      return { success: false, error: err.message || 'Failed to fetch audit logs' };
    }
  });

  // Get active group instances - using direct HTTP to bypass SDK quirks
  ipcMain.handle('groups:get-instances', async (_event, { groupId }: { groupId: string }) => {
    // SECURITY: Validate group access first
    const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:get-instances');
    if (!authCheck.allowed) {
      return { success: false, error: authCheck.error };
    }
    
    // Helper to safely stringify objects with BigInt values
    const safeStringify = (obj: unknown): string => {
      try {
        return JSON.stringify(obj, (_key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
      } catch {
        return String(obj);
      }
    };

    try {
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
      
      const userId = getCurrentUserId();
      if (!userId) throw new Error("No user ID found");

      logger.info(`[INSTANCES] Fetching for group: ${groupId}, user: ${userId}`);

      // Strategy 1: Try the SDK method getUserGroupInstancesForGroup
      let instances: unknown[] = [];
      
      try {
        const clientAny = client as Record<string, unknown>;
        if (typeof clientAny.getUserGroupInstancesForGroup === 'function') {
          logger.info('[INSTANCES] Trying SDK method: getUserGroupInstancesForGroup');
          const response = await (clientAny.getUserGroupInstancesForGroup as CallableFunction)({ 
            path: { userId, groupId } 
          });
          const data = (response as { data?: unknown })?.data ?? response;
          logger.info('[INSTANCES] SDK Response:', safeStringify(data));
          instances = extractArray(data);
        } else {
          logger.warn('[INSTANCES] SDK method getUserGroupInstancesForGroup not available');
        }
      } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn('[INSTANCES] SDK getUserGroupInstancesForGroup failed:', err.message);
      }

      // Strategy 2: Try getUserGroupInstances (all groups) and filter
      if (instances.length === 0) {
        try {
          const clientAny = client as Record<string, unknown>;
          if (typeof clientAny.getUserGroupInstances === 'function') {
            logger.info('[INSTANCES] Trying SDK method: getUserGroupInstances (all groups)');
            const response = await (clientAny.getUserGroupInstances as CallableFunction)({ 
              path: { userId } 
            });
            const data = (response as { data?: unknown })?.data ?? response;
            const allInstances = extractArray(data);
            logger.info(`[INSTANCES] getUserGroupInstances returned ${allInstances.length} total instances`);
            
            if (allInstances.length > 0) {
              logger.info('[INSTANCES] First instance keys:', Object.keys(allInstances[0] as object));
              logger.info('[INSTANCES] First instance data:', safeStringify(allInstances[0]));
              
              // Try multiple filter strategies
              instances = allInstances.filter((inst: unknown) => {
                const i = inst as Record<string, unknown>;
                const matchGroupId = i.groupId === groupId;
                const matchGroupObj = (i.group as Record<string, unknown>)?.id === groupId;
                const matchOwnerId = String(i.ownerId || '').includes(groupId);
                return matchGroupId || matchGroupObj || matchOwnerId;
              });
              logger.info(`[INSTANCES] After filtering: ${instances.length} instances for this group`);
            }
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          logger.warn('[INSTANCES] SDK getUserGroupInstances failed:', err.message);
        }
      }

      // Strategy 3: Use client.get if available  
      if (instances.length === 0) {
        try {
          const clientAny = client as Record<string, unknown>;
          if (typeof clientAny.get === 'function') {
            logger.info('[INSTANCES] Trying client.get fallback');
            
            // Try specific group endpoint first
            const url = `users/${userId}/instances/groups/${groupId}`;
            logger.info('[INSTANCES] Calling:', url);
            const response = await (clientAny.get as CallableFunction)(url);
            const data = (response as { data?: unknown })?.data ?? response;
            logger.info('[INSTANCES] client.get response:', safeStringify(data));
            instances = extractArray(data);
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          logger.warn('[INSTANCES] client.get failed:', err.message);
        }
      }

      // Strategy 4: Try the getGroupInstances method (different from user-specific)
      if (instances.length === 0) {
        try {
          const clientAny = client as Record<string, unknown>;
          if (typeof clientAny.getGroupInstances === 'function') {
            logger.info('[INSTANCES] Trying SDK method: getGroupInstances');
            const response = await (clientAny.getGroupInstances as CallableFunction)({ 
              path: { groupId } 
            });
            const data = (response as { data?: unknown })?.data ?? response;
            logger.info('[INSTANCES] getGroupInstances response:', safeStringify(data));
            instances = extractArray(data);
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          logger.warn('[INSTANCES] SDK getGroupInstances failed:', err.message);
        }
      }

      logger.info(`[INSTANCES] Final result: ${instances.length} instances for group ${groupId}`);
      
      if (instances.length > 0) {
        logger.info('[INSTANCES] Sample instance:', safeStringify(instances[0]));
      }
      
      return { success: true, instances };
      
    } catch (error: unknown) {
      const err = error as { message?: string; stack?: string };
      logger.error('[INSTANCES] Fatal error:', err.message);
      logger.error('[INSTANCES] Stack:', err.stack);
      return { success: false, error: err.message || 'Failed to fetch instances' };
    }
  });

  // Ban a user from a group
  ipcMain.handle('groups:ban-user', async (_event, { groupId, userId }: { groupId: string; userId: string }) => {
    // SECURITY: Validate group access first
    const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:ban-user');
    if (!authCheck.allowed) {
      return { success: false, error: authCheck.error };
    }
    
    const client = getVRChatClient();
    if (!client) throw new Error("Not authenticated");

    try {
      logger.info(`[GroupService] Banning user ${userId} from group ${groupId}`);
      
      // Use correct SDK syntax with path and body parameters
      const response = await client.banGroupMember({ 
        path: { groupId }, 
        body: { userId } 
      });
      
      if (response.error) {
        logger.error(`[GroupService] Ban API returned error:`, response.error);
        const errorMessage = (response.error as { message?: string }).message || 'Ban failed';
        return { success: false, error: errorMessage };
      }
      
      logger.info(`[GroupService] Successfully banned user ${userId} from group ${groupId}`);
      return { success: true };
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { error?: { message?: string } } } };
      logger.error(`[GroupService] Failed to ban user ${userId} from group ${groupId}:`, e);
      const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
      return { success: false, error: msg };
    }
  });
  // Get group messages
  // ... (omitted, assuming no collision)

  // Get group roles
  ipcMain.handle('groups:get-roles', async (_event, { groupId }: { groupId: string }) => {
    try {
      // SECURITY: Validate group access
      groupAuthorizationService.validateAccess(groupId, 'groups:get-roles');
      
      const client = getVRChatClient();
      if (!client) throw new Error("Not authenticated");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientAny = client as any;
      
      let roles: unknown[] = [];
      let success = false;
      let error = '';

      // Strategy 0: Check for internal Axios
      const axiosInstance = clientAny.axios || clientAny.api;

      // Strategy 1: SDK Method
      if (typeof clientAny.getGroupRoles === 'function') {
           try {
               const response = await clientAny.getGroupRoles({ path: { groupId } });
               if (!response.error) {
                   roles = extractArray(response.data);
                   success = true;
               }
           } catch (e) {
               logger.warn('SDK getGroupRoles failed', e);
           }
      }

      // Strategy 2: Axios Re-use (preserves session cookies)
      if (!success && axiosInstance) {
           try {
               logger.info('Attempting roles fetch via client.axios');
               const response = await axiosInstance.get(`groups/${groupId}/roles`);
               const data = response.data || response;
               roles = extractArray(data);
               success = true;
           } catch (e) {
                logger.warn('Axios strategy failed', e);
           }
      }

      // Strategy 3: Raw Request (Fetch)
      if (!success) {
          try {
              const cookies = getAuthCookieString();
              const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/roles`;
              logger.info(`Fetching roles via fallback FETCH: ${url} (Cookies present: ${!!cookies})`);
              
              const response = await fetch(url, {
                  method: 'GET',
                  headers: {
                      'Cookie': cookies || '',
                      'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                      'Content-Type': 'application/json'
                  }
              });
              
              if (response.ok) {
                  const data = await response.json();
                  roles = extractArray(data);
                  success = true;
              } else {
                  error = `Fetch status: ${response.status} ${response.statusText}`;
                  logger.warn('Fetch roles failed:', response.status, await response.text());
              }
          } catch (e) {
              logger.error('Raw fetch groups/:id/roles failed', e);
              error = (e as Error).message;
          }
      }

      if (!success) {
          return { success: false, error: error || 'Failed to fetch roles' };
      }
      
      return { success: true, roles };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Failed to fetch group roles:', error);
      return { success: false, error: err.message || 'Failed to fetch roles' };
    }
  });

  // Add role to member
  ipcMain.handle('groups:add-member-role', async (_event, { groupId, userId, roleId }: { groupId: string, userId: string, roleId: string }) => {
      try {
          // SECURITY: Validate group access
          groupAuthorizationService.validateAccess(groupId, 'groups:add-member-role');
          
          const client = getVRChatClient();
          if (!client) throw new Error("Not authenticated");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clientAny = client as any;
          
          logger.info(`Adding role ${roleId} to user ${userId} in group ${groupId}`);
          // DEBUG: Log methods to help find correct SDK method
          // logger.info('Client keys:', Object.keys(clientAny));

          const axiosInstance = clientAny.axios || clientAny.api;

          // Strategy 1: SDK
          if (typeof clientAny.addRoleToGroupMember === 'function') {
               try {
                   await clientAny.addRoleToGroupMember({ path: { groupId, userId, roleId } });
                   return { success: true };
               } catch (e) {
                   logger.warn('SDK addRoleToGroupMember failed', e);
               }
          }

          // Strategy 2: Axios Re-use
          if (axiosInstance) {
              try {
                  const url = `groups/${groupId}/members/${userId}/roles/${roleId}`;
                  logger.info('Attempting add role via client.axios:', url);
                  await axiosInstance.put(url, {}); // Empty body often needed for PUT
                  return { success: true };
              } catch (e) {
                   logger.warn('Axios strategy for add role failed', e);
              }
          }

          // Strategy 3: Raw Request (Fetch)
          try {
              const cookies = getAuthCookieString();
              const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
              logger.info(`Fallback FETCH Add Role: ${url}`);
              
              const response = await fetch(url, {
                  method: 'PUT',
                  headers: {
                      'Cookie': cookies || '',
                      'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                      'Content-Type': 'application/json'
                  },
                  body: '{}' // Explicit empty body
              });
              
              if (response.ok) {
                  return { success: true };
              }
              const errText = await response.text();
              logger.error('Fallback Add Role failed:', response.status, errText);
              return { success: false, error: `API Error: ${response.status}` };
          } catch (e) {
              return { success: false, error: (e as Error).message };
          }
      } catch (error: unknown) {
          const err = error as { message?: string };
          logger.error('Failed to add member role:', error);
          return { success: false, error: err.message || 'Failed to add role' };
      }
  });

  // Remove role from member
  ipcMain.handle('groups:remove-member-role', async (_event, { groupId, userId, roleId }: { groupId: string, userId: string, roleId: string }) => {
      try {
          // SECURITY: Validate group access
          groupAuthorizationService.validateAccess(groupId, 'groups:remove-member-role');
          
          const client = getVRChatClient();
          if (!client) throw new Error("Not authenticated");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clientAny = client as any;
          const axiosInstance = clientAny.axios || clientAny.api;

          logger.info(`Removing role ${roleId} from user ${userId} in group ${groupId}`);

          // Strategy 1: SDK
          if (typeof clientAny.removeRoleFromGroupMember === 'function') {
              try {
                  await clientAny.removeRoleFromGroupMember({ path: { groupId, userId, roleId } });
                  return { success: true };
              } catch (e) {
                   logger.warn('SDK removeRoleFromGroupMember failed', e);
              }
          }

          // Strategy 2: Axios Re-use
          if (axiosInstance) {
              try {
                  const url = `groups/${groupId}/members/${userId}/roles/${roleId}`;
                  logger.info('Attempting remove role via client.axios:', url);
                  await axiosInstance.delete(url);
                  return { success: true };
              } catch (e) {
                   logger.warn('Axios strategy for remove role failed', e);
              }
          }

          // Strategy 3: Raw Request (Fetch)
          try {
               const cookies = getAuthCookieString();
               const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
               
               const response = await fetch(url, {
                   method: 'DELETE',
                   headers: {
                       'Cookie': cookies || '',
                       'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                       'Content-Type': 'application/json'
                   }
               });
               
               if (response.ok) {
                   return { success: true };
               }
               const errText = await response.text();
               logger.error('Fallback Remove Role failed:', response.status, errText);
               return { success: false, error: `API Error: ${response.status}` };
          } catch (e) {
               return { success: false, error: (e as Error).message };
          }
      } catch (error: unknown) {
          const err = error as { message?: string };
          logger.error('Failed to remove member role:', error);
          return { success: false, error: err.message || 'Failed to remove role' };
      }
  });
  // Respond to group join request
  ipcMain.handle('groups:respond-request', async (_event, { groupId, userId, action }: { groupId: string, userId: string, action: 'accept' | 'deny' }) => {
      try {
          // SECURITY: Validate group access
          groupAuthorizationService.validateAccess(groupId, 'groups:respond-request');
          
          const client = getVRChatClient();
          if (!client) throw new Error("Not authenticated");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clientAny = client as any;
          const axiosInstance = clientAny.axios || clientAny.api;

          const apiAction = action === 'deny' ? 'reject' : 'accept';
          logger.info(`Responding to join request for ${userId} in ${groupId}: ${apiAction}`);

          // Strategy 1: SDK (respondGroupJoinRequest)
          // Note: The method is named 'respondGroupJoinRequest' in the generated SDK, NOT 'respondToGroupJoinRequest'

          // DEBUG: Log available methods
          const clientKeys = [];
          let obj = clientAny;
          while (obj) {
              clientKeys.push(...Object.getOwnPropertyNames(obj));
              obj = Object.getPrototypeOf(obj);
          }
          const respondMethods = clientKeys.filter(k => k.toLowerCase().includes('respond'));
          logger.info(`[GroupService] Available respond methods on client: ${respondMethods.join(', ')}`);

          if (typeof clientAny.respondGroupJoinRequest === 'function') {
               try {
                   logger.info('Strategy 1: Attempting SDK respondGroupJoinRequest');
                   const response = await clientAny.respondGroupJoinRequest({ 
                       path: { groupId, userId },
                       body: { action: apiAction }
                   });
                   
                   if (response.error) {
                       logger.warn('Strategy 1 returned API error:', response.error);
                       throw new Error(`SDK Error: ${response.error.message || 'Unknown error'}`);
                   }
                   
                   logger.info('Strategy 1 success');
                   return { success: true };
                } catch (e: unknown) {
                    const err = e as { message?: string; response?: { status?: number } };
                    logger.warn('Strategy 1 failed:', err.message);
                    if (err.response) logger.warn('Strategy 1 response status:', err.response.status);
                }
          } else if (typeof clientAny.respondToGroupJoinRequest === 'function') {
               // Fallback to "To" variation just in case
               try {
                   logger.info('Strategy 1b: Attempting SDK respondToGroupJoinRequest');
                   const response = await clientAny.respondToGroupJoinRequest({ 
                       path: { groupId, userId },
                       body: { action: apiAction }
                   });
                   if (response.error) {
                       throw new Error(`SDK Error: ${response.error.message}`);
                   }
                   return { success: true };
                } catch (e: unknown) {
                    const err = e as { message?: string };
                    logger.warn('Strategy 1b failed:', err.message);
                }
          } else {
              logger.info('Strategy 1: respondGroupJoinRequest method not found on client');
          }

          // Strategy 1.5: Generic SDK Request
          // Sometimes generated methods are missing but the generic request capability exists
          try {
             if (typeof clientAny.put === 'function') {
                  logger.info('Strategy 1.5: Attempting client.put');
                  // SDK likely wraps axios or similar
                  await clientAny.put(`groups/${groupId}/requests/${userId}`, { action: apiAction });
                  return { success: true };
             } else if (typeof clientAny.request === 'function') {
                  logger.info('Strategy 1.5: Attempting client.request');
                  await clientAny.request({
                      method: 'PUT',
                      url: `groups/${groupId}/requests/${userId}`,
                      body: { action: apiAction },
                      // Ensure auth headers are included if manual
                      headers: {'Content-Type': 'application/json'}
                  });
                  return { success: true };
             }
          } catch (e: unknown) {
              const err = e as { message?: string };
              logger.warn('Strategy 1.5 failed:', err.message);
          }

          // Strategy 2: Axios Re-use
          if (axiosInstance) {
              try {
                  const url = `groups/${groupId}/requests/${userId}`;
                  logger.info('Strategy 2: Attempting client.axios PUT:', url);
                  await axiosInstance.put(url, { action: apiAction });
                  return { success: true };
              } catch (e: unknown) {
                   const err = e as { message?: string; response?: { status?: number; data?: unknown } };
                   logger.warn('Strategy 2 failed:', err.message);
                   if (err.response) logger.warn('Strategy 2 response:', err.response.status, err.response.data);
              }
          } else {
              logger.info('Strategy 2: axios instance not found on client');
          }

          // Strategy 3: Raw Request (Fetch)
          try {
               const cookies = getAuthCookieString();
               logger.info(`Strategy 3: Attempting Fallback Fetch. Cookies present: ${!!cookies} (Length: ${cookies?.length || 0})`);
               
               const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/requests/${userId}`;
               
               const response = await fetch(url, {
                   method: 'PUT',
                   headers: {
                       'Cookie': cookies || '',
                       'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                       'Content-Type': 'application/json'
                   },
                   body: JSON.stringify({ action: apiAction })
               });
               
               if (response.ok) {
                   return { success: true };
               }
               const errText = await response.text();
               logger.error('Strategy 3 failed:', response.status, errText);
               
               // If 401, trying to log more context
               if (response.status === 401) {
                    logger.error('Strategy 3 401 Context:', { 
                        hasCookies: !!cookies, 
                        cookieLength: cookies?.length
                    });
               }

               return { success: false, error: `API Error: ${response.status}` };
          } catch (e) {
               return { success: false, error: (e as Error).message };
          }
      } catch (error: unknown) {
          const err = error as { message?: string };
          logger.error('Failed to respond to request:', error);
          return { success: false, error: err.message || 'Failed to respond to request' };
      }
  });
}

