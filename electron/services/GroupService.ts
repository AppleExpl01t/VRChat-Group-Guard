import { ipcMain } from 'electron';
import log from 'electron-log';
const logger = log.scope('GroupService');
import { getVRChatClient, getCurrentUserId, getAuthCookieStringAsync } from './AuthService';
import { vrchatApiService } from './VRChatApiService';
import { databaseService } from './DatabaseService';
import { groupAuthorizationService } from './GroupAuthorizationService';
import { networkService } from './NetworkService';
import { discordWebhookService } from './DiscordWebhookService';
import { serviceEventBus } from './ServiceEventBus';
import { windowService } from './WindowService';

export function setupGroupHandlers() {

    // Listen for security updates and broadcast to renderer
    serviceEventBus.on('groups-updated', ({ groups }) => {
        logger.info(`Broadcasting ${groups.length} authorized groups to renderer`);
        windowService.broadcast('groups:updated', { groups });
    });

    serviceEventBus.on('groups-cache-ready', ({ groupIds }) => {
        logger.info(`Broadcasting cache ready event for ${groupIds.length} groups`);
        windowService.broadcast('groups:cache-ready', { groupIds });
    });

    serviceEventBus.on('group-verified', ({ group }) => {
        // Broadacst granular update to UI
        windowService.broadcast('groups:verified', { group });
    });

    // Get user's groups (groups where user is a member)
    // Get user's groups (groups where user is a member)
    ipcMain.handle('groups:get-my-groups', async () => {
        const client = getVRChatClient();
        const userId = getCurrentUserId();

        if (!client || !userId) {
            return { success: false, error: "Not authenticated. Please log in first." };
        }

        const safeUserId = userId.trim();

        // STAGE 1: Check if we have cached authorized groups already
        if (groupAuthorizationService.isInitialized()) {
            // SECURITY CRITICAL: Verify the cache belongs to the CURRENT user
            if (groupAuthorizationService.isCacheOwnedBy(safeUserId)) {
                const cachedGroupIds = groupAuthorizationService.getAllowedGroupIds();
                const cachedFullObjects = groupAuthorizationService.getCachedGroupObjects();

                if (cachedGroupIds.length > 0) {
                    logger.info(`[PERF] Returning ${cachedGroupIds.length} cached groups instantly (Stage 1)`);

                    // Trigger Stage 2 refresh in background
                    setTimeout(() => {
                        vrchatApiService_refreshGroups(safeUserId).catch(err => {
                            logger.error('Background refresh failed:', err);
                        });
                    }, 100);

                    // Return full cached objects if available, otherwise return minimal placeholders
                    if (cachedFullObjects.length > 0) {
                        logger.info(`[PERF] Returning ${cachedFullObjects.length} full cached group objects with images`);
                        return {
                            success: true,
                            groups: cachedFullObjects,
                            isPartial: true // Still mark as partial so UI knows a refresh is coming
                        };
                    }

                    // Fallback: minimal objects (no images, but UI won't be stuck)
                    return {
                        success: true,
                        groups: cachedGroupIds.map(id => ({ id, name: 'Loading...', shortCode: '' })),
                        isPartial: true
                    };
                }
            } else {
                logger.warn(`[SECURITY] Cache mismatch! Cache belongs to different user. clearing cache.`);
                groupAuthorizationService.clearAllowedGroups();
            }
        }

        // STAGE 2: Perform the actual network fetch
        return vrchatApiService_refreshGroups(safeUserId);
    });

    /**
     * Internal helper to refresh groups from VRChat API and authorize them.
     */
    async function vrchatApiService_refreshGroups(userId: string) {
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            const response = await client.getUserGroups({
                path: { userId }
            });

            if (response.error) {
                throw (response.error as { message?: string }).message || 'Failed to fetch groups';
            }

            const groups = response.data || [];

            // Map and Normalize
            const mappedGroups = (groups as any[]).map((g) => {
                if (g.groupId && typeof g.groupId === 'string' && g.groupId.startsWith('grp_')) {
                    return { ...g, id: g.groupId };
                }
                return g;
            });

            const authorizedGroups = await groupAuthorizationService.processAndAuthorizeGroups(
                mappedGroups,
                userId
            );

            return { groups: authorizedGroups };
        }, 'groups:get-my-groups:refresh').then(res => {
            if (res.success) {
                // START PREDICTIVE CACHING SERVICE ONCE AUTH IS CONFIRMED
                groupAuthorizationService.startPredictiveCaching();

                return { success: true, groups: res.data?.groups };
            }
            return { success: false, error: res.error };
        });
    }

    // Get ALL active instances (Unified Fetch)
    ipcMain.handle('groups:get-all-active-instances', async () => {
        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };
        const userId = getCurrentUserId();
        if (!userId) return { success: false, error: "Not authenticated" };

        return networkService.execute(async () => {
            // Strategy: Use getUserGroupInstances to get everything at once
            const response = await client.getUserGroupInstances({
                path: { userId }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let allInstances = (response.data || response) as any;

            // Handle { instances: [...] } wrapper commonly returned by VRChat API
            if (!Array.isArray(allInstances) && allInstances && Array.isArray(allInstances.instances)) {
                logger.info(`[GroupService] Extracting instances from wrapped response for unified fetch`);
                allInstances = allInstances.instances;
            }

            if (!Array.isArray(allInstances)) {
                // Safe logging for BigInt
                logger.warn('[GroupService] getAllActiveInstances returned non-array:',
                    JSON.stringify(allInstances, (key, value) => typeof value === 'bigint' ? value.toString() : value)
                );
                return { instances: [] };
            }

            logger.info(`[GroupService] Fetched ${allInstances.length} active instances across all groups (Unified)`);
            return { instances: allInstances };

        }, 'groups:get-all-active-instances').then(res => {
            if (res.success) return { success: true, instances: res.data?.instances };
            return { success: false, error: res.error };
        });
    });

    // Get specific group details (Strict Moderation Only)
    ipcMain.handle('groups:get-details', async (_event, { groupId }: { groupId: string }) => {
        groupAuthorizationService.validateAccess(groupId, 'groups:get-details');
        const result = await vrchatApiService.getGroupDetails(groupId);
        return { ...result, group: result.data };
    });

    // Get public group details (Bypasses moderation check, for profile viewing)
    ipcMain.handle('groups:get-public-details', async (_event, { groupId }: { groupId: string }) => {
        // No moderation check here - VRChat API handles public/private visibility
        const result = await vrchatApiService.getGroupDetails(groupId);
        return { ...result, group: result.data };
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
        // SECURITY: Validate group access
        groupAuthorizationService.validateAccess(groupId, 'groups:get-members');

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error("Not authenticated");

            const response = await client.getGroupMembers({
                path: { groupId },
                query: { n, offset }
            });
            return { members: response.data ?? [] };
        }, `groups:get-members:${groupId}`).then(res => {
            if (res.success) return { success: true, members: res.data?.members };
            return { success: false, error: res.error };
        });
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

    // Search group members (Server-side)
    ipcMain.handle('groups:search-members', async (_event, { groupId, query, n = 50 }: { groupId: string; query: string; n?: number }) => {
        // SECURITY: Validate group access
        groupAuthorizationService.validateAccess(groupId, 'groups:search-members');

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error("Not authenticated");

            const searchQuery = query.trim();
            if (!searchQuery) return { members: [] };

            logger.info(`Searching members in group ${groupId} for "${searchQuery}" (server-side)`);

            // Use direct fetch with explicit cookie headers - axios instance doesn't reliably pass auth
            // Endpoint: /groups/{groupId}/members/search?query={query}&n={n}
            const cookies = await getAuthCookieStringAsync();
            logger.info(`Searching with native fetch. Cookie present: ${!!cookies} (Length: ${cookies?.length || 0})`);

            const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/search?query=${encodeURIComponent(searchQuery)}&n=${n}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cookie': cookies || '',
                    'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const text = await response.text();
                logger.error(`Fetch API Error: ${response.status} ${text}`);
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const data = await response.json();
            return { members: extractArray(data) };

        }, `groups:search-members:${groupId}`).then(res => {
            if (res.success) return { success: true, members: res.data?.members };
            return { success: false, error: res.error };
        });
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
                    const rawLogs = extractArray(response.data);
                    setLogs = rawLogs.map((l: unknown) => {
                        const log = l as Record<string, unknown>;
                        return {
                            ...log,
                            type: log.eventType || 'unknown', // Map eventType to type
                            eventType: log.eventType,
                            // Ensure other fields are present/flat
                            actorId: log.actorId || (log.actor as { id: string })?.id,
                            actorDisplayName: log.actorDisplayName || (log.actor as { displayName: string })?.displayName,
                            targetId: log.targetId || (log.target as { id: string })?.id,
                            targetDisplayName: log.targetDisplayName || (log.target as { displayName: string })?.displayName,
                            created_at: log.created_at || log.createdAt
                        };
                    });
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
            interface AuditLogEntry { created_at: string;[key: string]: unknown; }
            const allLogs = ([...setLogs, ...localLogs] as AuditLogEntry[]).sort((a, b) => {
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
    // Get active group instances - using direct HTTP to bypass SDK quirks
    ipcMain.handle('groups:get-instances', async (_event, { groupId }: { groupId: string }) => {
        // SECURITY: Validate group access first
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:get-instances');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };
        const userId = getCurrentUserId();
        if (!userId) return { success: false, error: "No user ID" };

        // Define Strategies
        const strategies = [
            // Strategy 1: SDK getUserGroupInstancesForGroup
            async () => {
                const clientAny = client as unknown as Record<string, unknown>;
                if (typeof clientAny.getUserGroupInstancesForGroup === 'function') {
                    const response = await (clientAny.getUserGroupInstancesForGroup as CallableFunction)({ path: { userId, groupId } });
                    const data = (response as { data?: unknown })?.data ?? response;
                    return extractArray(data);
                }
                throw new Error('SDK method generic failure');
            },
            // Strategy 2: SDK getUserGroupInstances (all) + Filter
            async () => {
                const clientAny = client as unknown as Record<string, unknown>;
                if (typeof clientAny.getUserGroupInstances !== 'function') throw new Error('SDK method missing');

                const response = await (clientAny.getUserGroupInstances as CallableFunction)({ path: { userId } });
                const data = (response as { data?: unknown })?.data ?? response;
                const allInstances = extractArray(data);

                // Security Filter
                const authorizedInstances = groupAuthorizationService.filterAuthorizedData(allInstances, (inst: unknown) => {
                    const i = inst as Record<string, unknown>;
                    if (typeof i.groupId === 'string') return i.groupId;
                    if (i.group && typeof (i.group as Record<string, unknown>).id === 'string') return (i.group as Record<string, unknown>).id as string;
                    if (typeof i.ownerId === 'string' && i.ownerId.startsWith('grp_')) return i.ownerId;
                    return undefined;
                });

                // Group Filter
                return authorizedInstances.filter((inst: unknown) => {
                    const i = inst as Record<string, unknown>;
                    const matchGroupId = i.groupId === groupId;
                    const matchGroupObj = (i.group as Record<string, unknown>)?.id === groupId;
                    const matchOwnerId = String(i.ownerId || '').includes(groupId);
                    return matchGroupId || matchGroupObj || matchOwnerId;
                });
            },
            // Strategy 3: Client.get Fallback
            async () => {
                const clientAny = client as unknown as Record<string, unknown>;
                if (typeof clientAny.get !== 'function') throw new Error('Client.get missing');
                const url = `users/${userId}/instances/groups/${groupId}`;
                const response = await (clientAny.get as CallableFunction)(url);
                const data = (response as { data?: unknown })?.data ?? response;
                return extractArray(data);
            },
            // Strategy 4: getGroupInstances
            async () => {
                const clientAny = client as unknown as Record<string, unknown>;
                if (typeof clientAny.getGroupInstances !== 'function') throw new Error('SDK method missing');
                const response = await (clientAny.getGroupInstances as CallableFunction)({ path: { groupId } });
                const data = (response as { data?: unknown })?.data ?? response;
                return extractArray(data);
            }
        ];

        return networkService.executeWithFallback(strategies, `groups:get-instances:${groupId}`).then(res => {
            if (res.success) return { success: true, instances: res.data };
            return { success: false, error: res.error || 'Failed to fetch instances' };
        });
    });

    // Ban a user from a group
    ipcMain.handle('groups:ban-user', async (_event, { groupId, userId }: { groupId: string; userId: string }) => {
        // SECURITY: Validate group access first
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:ban-user');
        if (!authCheck.allowed) {
            return { success: false, error: authCheck.error };
        }

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error("Not authenticated");
            logger.info(`[GroupService] Banning user ${userId} from group ${groupId}`);

            await client.banGroupMember({
                path: { groupId },
                body: { userId }
            });

            discordWebhookService.sendEvent(
                groupId,
                {
                    title: '🚫 User Banned (Manual)',
                    description: `User ${userId} was manually banned via the Group Guard Dashboard.`,
                    type: 'ERROR',
                    fields: [
                        { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                        { name: 'Admin', value: getCurrentUserId() || 'Unknown', inline: true }
                    ]
                }
            ).catch(e => logger.error('Webhook failed', e));

            return { success: true };
        }, `groups:ban-user:${groupId}:${userId}`).then(res => {
            if (res.success) return { success: true };
            return { success: false, error: res.error };
        });
    });

    // Unban a user from a group
    ipcMain.handle('groups:unban-user', async (_event, { groupId, userId }: { groupId: string; userId: string }) => {
        // SECURITY: Validate group access first
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:unban-user');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };

        const strategies = [
            // Strategy 1: SDK unbanGroupMember
            async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const clientAny = client as any;
                if (typeof clientAny.unbanGroupMember !== 'function') throw new Error('SDK method missing');
                await clientAny.unbanGroupMember({ path: { groupId, userId } });
                return true;
            },
            // Strategy 2: Raw Fetch (DELETE /groups/{groupId}/bans/{userId})
            async () => {
                const cookies = await getAuthCookieStringAsync();
                const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/bans/${userId}`;
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'Cookie': cookies || '',
                        'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok || response.status === 404) return true;
                throw new Error(`API Error: ${response.status} ${await response.text()}`);
            }
        ];

        return networkService.executeWithFallback(strategies, `groups:unban-user:${groupId}:${userId}`).then(res => {
            if (res.success) {
                discordWebhookService.sendEvent(
                    groupId,
                    {
                        title: '🔓 User Unbanned (Manual)',
                        description: `User ${userId} was manually unbanned via the Group Guard Dashboard.`,
                        type: 'SUCCESS',
                        fields: [
                            { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                            { name: 'Admin', value: getCurrentUserId() || 'Unknown', inline: true }
                        ]
                    }
                ).catch(e => logger.error('Webhook failed', e));

                return { success: true };
            }
            return { success: false, error: res.error };
        });
    });
    // Get group messages
    // ... (omitted, assuming no collision)

    // Get group roles
    ipcMain.handle('groups:get-roles', async (_event, { groupId }: { groupId: string }) => {
        // SECURITY: Validate group access
        groupAuthorizationService.validateAccess(groupId, 'groups:get-roles');

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientAny = client as any;

        const strategies = [
            // Strategy 1: SDK Method
            async () => {
                if (typeof clientAny.getGroupRoles !== 'function') throw new Error('SDK method missing');
                const response = await clientAny.getGroupRoles({ path: { groupId } });
                return extractArray(response.data);
            },
            // Strategy 2: Axios Re-use
            async () => {
                const axiosInstance = clientAny.axios || clientAny.api;
                if (!axiosInstance) throw new Error('Axios missing');
                const response = await axiosInstance.get(`groups/${groupId}/roles`);
                const data = response.data || response;
                return extractArray(data);
            },
            // Strategy 3: Raw Request (Fetch)
            async () => {
                const cookies = await getAuthCookieStringAsync();
                const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/roles`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Cookie': cookies || '',
                        'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                        'Content-Type': 'application/json'
                    }
                });
                if (!response.ok) throw new Error(`Fetch status: ${response.status}`);
                const data = await response.json();
                return extractArray(data);
            }
        ];

        return networkService.executeWithFallback(strategies, `groups:get-roles:${groupId}`).then(res => {
            if (res.success) return { success: true, roles: res.data };
            return { success: false, error: res.error };
        });
    });

    // Add role to member
    ipcMain.handle('groups:add-member-role', async (_event, { groupId, userId, roleId }: { groupId: string, userId: string, roleId: string }) => {
        // SECURITY: Validate group access
        groupAuthorizationService.validateAccess(groupId, 'groups:add-member-role');

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientAny = client as any;

        logger.info(`Adding role ${roleId} to user ${userId} in group ${groupId}`);

        const strategies = [
            // Strategy 1: SDK
            async () => {
                if (typeof clientAny.addRoleToGroupMember !== 'function') throw new Error('SDK method missing');
                await clientAny.addRoleToGroupMember({ path: { groupId, userId, roleId } });
                return true;
            },
            // Strategy 2: Axios Re-use
            async () => {
                const axiosInstance = clientAny.axios || clientAny.api;
                if (!axiosInstance) throw new Error('Axios missing');
                const url = `groups/${groupId}/members/${userId}/roles/${roleId}`;
                await axiosInstance.put(url, {}); // Empty body often needed for PUT
                return true;
            },
            // Strategy 3: Raw Request (Fetch)
            async () => {
                const cookies = await getAuthCookieStringAsync();
                const url = `https://api.vrchat.cloud/api/1/groups/${groupId}/members/${userId}/roles/${roleId}`;
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Cookie': cookies || '',
                        'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)',
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) return true;
                throw new Error(`Fetch status: ${response.status}`);
            }
        ];

        return networkService.executeWithFallback(strategies, `groups:add-member-role:${groupId}:${userId}`).then(res => {
            if (res.success) {
                discordWebhookService.sendEvent(
                    groupId,
                    {
                        title: '👮 Role Added',
                        description: `Role added to user ${userId}.`,
                        type: 'WARNING',
                        fields: [
                            { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                            { name: 'Role ID', value: roleId, inline: true },
                            { name: 'Admin', value: getCurrentUserId() || 'Unknown', inline: true }
                        ]
                    }
                ).catch(e => logger.error('Webhook failed', e));
                return { success: true };
            }
            return { success: false, error: res.error };
        });
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
                const cookies = await getAuthCookieStringAsync();
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
        // SECURITY: Validate group access
        const authCheck = groupAuthorizationService.validateAccessSafe(groupId, 'groups:respond-request');
        if (!authCheck.allowed) return { success: false, error: authCheck.error };

        const client = getVRChatClient();
        if (!client) return { success: false, error: "Not authenticated" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientAny = client as any;
        const axiosInstance = clientAny.axios || clientAny.api;

        const apiAction = action === 'deny' ? 'reject' : 'accept';
        logger.info(`Responding to join request for ${userId} in ${groupId}: ${apiAction}`);

        const strategies = [
            // Strategy 1: SDK Methods
            async () => {
                if (typeof clientAny.respondGroupJoinRequest === 'function') {
                    const response = await clientAny.respondGroupJoinRequest({ path: { groupId, userId }, body: { action: apiAction } });
                    if (response.error) throw new Error(response.error.message);
                    return true;
                }
                if (typeof clientAny.respondToGroupJoinRequest === 'function') {
                    const response = await clientAny.respondToGroupJoinRequest({ path: { groupId, userId }, body: { action: apiAction } });
                    if (response.error) throw new Error(response.error.message);
                    return true;
                }
                throw new Error('SDK method missing');
            },
            // Strategy 2: Generic SDK Request
            async () => {
                if (typeof clientAny.put === 'function') {
                    await clientAny.put(`groups/${groupId}/requests/${userId}`, { action: apiAction });
                    return true;
                }
                if (typeof clientAny.request === 'function') {
                    await clientAny.request({
                        method: 'PUT',
                        url: `groups/${groupId}/requests/${userId}`,
                        body: { action: apiAction },
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return true;
                }
                throw new Error('Generic SDK method missing');
            },
            // Strategy 3: Axios
            async () => {
                if (!axiosInstance) throw new Error('Axios missing');
                await axiosInstance.put(`groups/${groupId}/requests/${userId}`, { action: apiAction });
                return true;
            },
            // Strategy 4: Raw Fetch
            async () => {
                const cookies = await getAuthCookieStringAsync();
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
                if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
                return true;
            }
        ];

        return networkService.executeWithFallback(strategies, `groups:respond-request:${groupId}:${userId}`).then(res => {
            if (res.success) {
                const isAccept = action === 'accept';

                discordWebhookService.sendEvent(
                    groupId,
                    {
                        title: isAccept ? '✅ Join Request Accepted' : '❌ Join Request Denied',
                        description: `Join request ${isAccept ? 'accepted' : 'denied'} by admin.`,
                        type: isAccept ? 'SUCCESS' : 'ERROR',
                        fields: [
                            { name: 'User', value: `[${userId}](https://vrchat.com/home/user/${userId})`, inline: true },
                            { name: 'Action', value: action.toUpperCase(), inline: true },
                            { name: 'Admin', value: getCurrentUserId() || 'Unknown', inline: true }
                        ]
                    }
                ).catch(e => logger.error('Webhook failed', e));

                return { success: true };
            }
            return { success: false, error: res.error };
        });
    });
}

