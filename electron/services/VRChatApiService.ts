/**
 * VRChat API Microservice
 * 
 * Centralized service for all VRChat API interactions.
 * Provides typed methods, centralized caching, and consistent error handling.
 * 
 * This service consolidates API calls from AuthService, GroupService, 
 * InstanceService, UserService, AutoModService, and others into a single module.
 */

import log from 'electron-log';
import { LRUCache } from 'lru-cache';
import { networkService } from './NetworkService';
import { VRChat } from 'vrchat';

const logger = log.scope('VRChatApiService');

// ============================================
// TYPES
// ============================================

export interface VRCUser {
    id: string;
    displayName: string;
    userIcon?: string;
    currentAvatarImageUrl?: string;
    currentAvatarThumbnailImageUrl?: string;
    thumbnailUrl?: string;
    profilePicOverride?: string;
    status?: string;
    statusDescription?: string;
    state?: string;
    tags?: string[];
    bio?: string;
    location?: string;
    friendKey?: string;
    isFriend?: boolean;
    last_login?: string | Date;
    last_activity?: string | Date;
    ageVerificationStatus?: string;
    ageVerified?: boolean;
    date_joined?: string | Date;
    [key: string]: unknown;
}

export interface VRCGroup {
    id: string;
    name: string;
    shortCode?: string;
    discriminator?: string;
    description?: string;
    iconUrl?: string;
    bannerUrl?: string;
    ownerId?: string;
    memberCount?: number;
    memberCountSyncedAt?: string;
    onlineMemberCount?: number;
    rules?: string;
    links?: string[];
    createdAt?: string;
    roles?: VRCGroupRole[];
    myMember?: {
        id?: string;
        userId?: string;
        groupId?: string;
        roleIds?: string[];
        permissions?: string[];
        isRepresenting?: boolean;
    };
    [key: string]: unknown;
}

export interface VRCGroupRole {
    id: string;
    groupId?: string;
    name: string;
    description?: string;
    order?: number;
    permissions?: string[];
    isSelfAssignable?: boolean;
    requiresTwoFactor?: boolean;
    requiresPurchase?: boolean;
    isDefault?: boolean;
}

export interface VRCGroupMember {
    id: string;
    groupId?: string;
    userId: string;
    user?: VRCUser;
    isRepresenting?: boolean;
    roleIds?: string[];
    joinedAt?: string;
    membershipStatus?: string;
    visibility?: string;
    isSubscribedToAnnouncements?: boolean;
    [key: string]: unknown;
}

export interface VRCGroupRequest {
    id: string;
    userId: string;
    groupId?: string;
    user?: VRCUser;
    createdAt?: string;
    [key: string]: unknown;
}

export interface VRCGroupBan {
    id: string;
    userId: string;
    groupId?: string;
    user?: VRCUser;
    bannedByUserId?: string;
    reason?: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface VRCInstance {
    id: string;
    instanceId?: string;
    worldId?: string;
    world?: VRCWorld;
    name?: string;
    type?: string;
    capacity?: number;
    n_users?: number;
    userCount?: number;
    full?: boolean;
    users?: VRCUser[];
    ownerId?: string;
    groupAccessType?: string;
    active?: boolean;
    location?: string;
    ageGate?: boolean; // 18+ age verification required (available in getInstance API)
    [key: string]: unknown;
}

export interface VRCWorld {
    id: string;
    name: string;
    description?: string;
    authorId?: string;
    authorName?: string;
    imageUrl?: string;
    thumbnailImageUrl?: string;
    capacity?: number;
    publicOccupants?: number;
    privateOccupants?: number;
    tags?: string[];
    favorites?: number;
    visits?: number;
    created_at?: string | Date;
    updated_at?: string | Date;
    ageGate?: boolean; // 18+ age verification required
    [key: string]: unknown;
}

export interface VRCAuditLogEntry {
    id: string;
    created_at: string;
    groupId?: string;
    actorId?: string;
    actorDisplayName?: string;
    targetId?: string;
    eventType?: string;
    description?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface VRCFriend {
    id: string;
    displayName: string;
    currentAvatarImageUrl?: string;
    currentAvatarThumbnailImageUrl?: string;
    status?: string;
    statusDescription?: string;
    state?: string;
    location?: string;
    tags?: string[];
    [key: string]: unknown;
}

// Result types for API operations
export interface ApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================
// CACHES - LRU to prevent memory leaks
// ============================================

const userCache = new LRUCache<string, { data: VRCUser; timestamp: number }>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 minute TTL
});

const groupCache = new LRUCache<string, { data: VRCGroup; timestamp: number }>({
    max: 100,
    ttl: 1000 * 60 * 2, // 2 minute TTL
});

const worldCache = new LRUCache<string, { data: VRCWorld; timestamp: number }>({
    max: 200,
    ttl: 1000 * 60 * 10, // 10 minute TTL
});

const groupMembersCache = new LRUCache<string, { data: VRCGroupMember[]; timestamp: number }>({
    max: 50,
    ttl: 1000 * 60 * 1, // 1 minute TTL (members change frequently)
});

// ============================================
// CLIENT ACCESSOR
// ============================================

// We import the client accessor from AuthService which owns the VRChat SDK session
// This maintains the existing authentication flow while centralizing API calls
import {
    getVRChatClient,
    isAuthenticated as authIsAuthenticated,
    getCurrentUserId as authGetCurrentUserId,
    getAuthCookieStringAsync,
    fetchCurrentLocationFromApi as authFetchCurrentLocation,
    fetchInstancePlayers as authFetchInstancePlayers
} from './AuthService';

// ============================================
// VRChat API SERVICE - The Microservice
// ============================================

export const vrchatApiService = {
    // ========================================
    // CORE - Client and Auth State
    // ========================================

    /**
     * Get the underlying VRChat SDK client (for advanced use cases)
     */
    getClient(): InstanceType<typeof VRChat> | null {
        return getVRChatClient();
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return authIsAuthenticated();
    },

    /**
     * Get current user's ID
     */
    getCurrentUserId(): string | null {
        return authGetCurrentUserId();
    },

    /**
     * Get auth cookie string for authenticated requests
     */
    async getAuthCookie(): Promise<string | undefined> {
        return getAuthCookieStringAsync();
    },

    // ========================================
    // USERS
    // ========================================

    /**
     * Get user by ID with caching
     */
    async getUser(userId: string, bypassCache = false): Promise<ApiResult<VRCUser>> {
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }

        // Check cache first
        if (!bypassCache) {
            const cached = userCache.get(userId);
            if (cached) {
                logger.debug(`User ${userId} served from cache`);
                return { success: true, data: cached.data };
            }
        }

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            logger.debug(`Fetching user ${userId} from API`);
            const response = await client.getUser({ path: { userId } });
            const user = response.data as VRCUser;

            // Cache the result
            userCache.set(userId, { data: user, timestamp: Date.now() });

            return user;
        }, `getUser:${userId}`);
    },

    /**
     * Get current user's location from API
     */
    async getCurrentLocation(): Promise<string | null> {
        return authFetchCurrentLocation();
    },

    /**
     * Get players in a specific instance
     */
    async getInstancePlayers(location: string): Promise<{ id: string; displayName: string }[]> {
        return authFetchInstancePlayers(location);
    },

    /**
     * Clear user cache (for a specific user or all)
     */
    clearUserCache(userId?: string): void {
        if (userId) {
            userCache.delete(userId);
        } else {
            userCache.clear();
        }
    },

    // ========================================
    // GROUPS
    // ========================================

    /**
     * Get groups the current user belongs to (with moderation powers)
     */
    async getMyGroups(): Promise<ApiResult<VRCGroup[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const userId = authGetCurrentUserId();
            if (!userId) throw new Error('No current user');

            const response = await client.getUserGroups({ path: { userId } });
            const groups = extractArray(response.data || response) as VRCGroup[];
            const result = groups;

            // DEBUG: Log group details to investigate role/permission data
            logger.info(`[getMyGroups] Fetched ${result.length} groups for user ${userId}`);
            result.forEach((g, i) => {
                const isOwner = g.ownerId === userId;
                const perms = g.myMember?.permissions || [];
                const roles = g.myMember?.roleIds || [];
                logger.info(`[getMyGroups] Group ${i + 1}: "${g.name}" (${g.id}) - Owner: ${isOwner}, Roles: [${roles.join(', ')}], Permissions: [${perms.join(', ')}]`);
            });

            // Populate Cache
            const now = Date.now();
            result.forEach(g => {
                if (g && g.id) {
                    groupCache.set(g.id, { data: g, timestamp: now });
                }
            });

            return result;
        }, 'getMyGroups');
    },

    /**
     * Get group details by ID
     */
    async getGroupDetails(groupId: string, bypassCache = false, options: { includeRoles?: boolean } = { includeRoles: true }): Promise<ApiResult<VRCGroup>> {
        if (!groupId) {
            return { success: false, error: 'Group ID is required' };
        }

        // Check cache
        if (!bypassCache) {
            const cached = groupCache.get(groupId);
            if (cached) {
                logger.debug(`Group ${groupId} served from cache`);
                return { success: true, data: cached.data };
            }
        }

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const query: { includeRoles?: boolean } = {};
            if (options.includeRoles) {
                query.includeRoles = true;
            }

            const response = await client.getGroup({ path: { groupId }, query });
            const group = response.data as VRCGroup;

            // Cache the result
            groupCache.set(groupId, { data: group, timestamp: Date.now() });

            return group;
        }, `getGroupDetails:${groupId}`);
    },

    /**
     * Get group members with pagination
     */
    async getGroupMembers(groupId: string, offset = 0, n = 100): Promise<ApiResult<VRCGroupMember[]>> {
        const cacheKey = `${groupId}:${offset}:${n}`;
        const cached = groupMembersCache.get(cacheKey);
        if (cached) {
            return { success: true, data: cached.data };
        }

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupMembers({
                path: { groupId },
                query: { offset, n }
            });
            const members = extractArray(response.data || response) as VRCGroupMember[];

            groupMembersCache.set(cacheKey, { data: members, timestamp: Date.now() });

            return members;
        }, `getGroupMembers:${groupId}`);
    },

    /**
     * Search group members by name
     */
    async searchGroupMembers(groupId: string, query: string, n = 20): Promise<ApiResult<VRCGroupMember[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.searchGroupMembers({
                path: { groupId },
                query: { query, n }
            });
            const members = extractArray(response.data || response) as VRCGroupMember[];

            return members;
        }, `searchGroupMembers:${groupId}:${query}`);
    },

    /**
     * Get group join requests
     */
    async getGroupRequests(groupId: string): Promise<ApiResult<VRCGroupRequest[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupRequests({ path: { groupId } });
            const requests = extractArray(response.data || response) as VRCGroupRequest[];

            return requests;
        }, `getGroupRequests:${groupId}`);
    },

    /**
     * Respond to a group join request
     */
    async respondToGroupRequest(groupId: string, userId: string, action: 'accept' | 'deny'): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            if (action === 'accept') {
                await client.respondGroupJoinRequest({
                    path: { groupId, userId },
                    body: { action: 'accept' }
                });
            } else {
                await client.respondGroupJoinRequest({
                    path: { groupId, userId },
                    body: { action: 'reject' }
                });
            }
            return undefined;
        }, `respondToGroupRequest:${groupId}:${userId}:${action}`);
    },

    /**
     * Get group bans
     */
    async getGroupBans(groupId: string): Promise<ApiResult<VRCGroupBan[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupBans({ path: { groupId } });
            const bans = extractArray(response.data || response) as VRCGroupBan[];

            return bans;
        }, `getGroupBans:${groupId}`);
    },

    /**
     * Ban a user from a group
     */
    async banUser(groupId: string, userId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.banGroupMember({
                path: { groupId },
                body: { userId }
            });
            return undefined;
        }, `banUser:${groupId}:${userId}`);
    },

    /**
     * Unban a user from a group
     */
    async unbanUser(groupId: string, userId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.unbanGroupMember({
                path: { groupId, userId }
            });
            return undefined;
        }, `unbanUser:${groupId}:${userId}`);
    },

    /**
     * Get group roles
     */
    async getGroupRoles(groupId: string): Promise<ApiResult<VRCGroupRole[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupRoles({ path: { groupId } });
            const roles = extractArray(response.data || response) as VRCGroupRole[];

            return roles;
        }, `getGroupRoles:${groupId}`);
    },

    /**
     * Add a role to a group member
     */
    async addMemberRole(groupId: string, userId: string, roleId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.addGroupMemberRole({
                path: { groupId, userId, groupRoleId: roleId }
            });
            return undefined;
        }, `addMemberRole:${groupId}:${userId}:${roleId}`);
    },

    /**
     * Remove a role from a group member
     */
    async removeMemberRole(groupId: string, userId: string, roleId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.removeGroupMemberRole({
                path: { groupId, userId, groupRoleId: roleId }
            });
            return undefined;
        }, `removeMemberRole:${groupId}:${userId}:${roleId}`);
    },

    /**
     * Get group audit logs
     */
    async getGroupAuditLogs(groupId: string, n = 60): Promise<ApiResult<VRCAuditLogEntry[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupAuditLogs({
                path: { groupId },
                query: { n }
            });
            const logs = extractArray(response.data || response) as VRCAuditLogEntry[];

            return logs;
        }, `getGroupAuditLogs:${groupId}`);
    },

    /**
     * Kick a user from a group
     */
    async kickUser(groupId: string, userId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.kickGroupMember({
                path: { groupId, userId }
            });
            return undefined;
        }, `kickUser:${groupId}:${userId}`);
    },

    /**
     * Search VRChat groups by name or shortCode
     */
    async searchGroups(query: string, n = 20): Promise<ApiResult<VRCGroup[]>> {
        return networkService.execute(async () => {
            const cookie = await getAuthCookieStringAsync();
            if (!cookie) throw new Error('Not authenticated');

            const url = `https://api.vrchat.cloud/api/1/groups?query=${encodeURIComponent(query)}&n=${n}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return (Array.isArray(data) ? data : []) as VRCGroup[];
        }, `searchGroups:${query}`);
    },

    // ========================================
    // INSTANCES
    // ========================================

    /**
     * Get group instances
     */
    async getGroupInstances(groupId: string): Promise<ApiResult<VRCInstance[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getGroupInstances({
                path: { groupId }
            });
            const instances = extractArray(response.data || response) as VRCInstance[];

            // Log a sample instance for debugging age gate structure
            if (instances.length > 0) {
                logger.debug(`[VRChatAPI] Sample instance structure:`, networkService.safeStringify(instances[0]));
            }

            return instances;
        }, `getGroupInstances:${groupId}`);
    },

    /**
     * Get instance details
     */
    async getInstance(worldId: string, instanceId: string): Promise<ApiResult<VRCInstance>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getInstance({
                path: { worldId, instanceId }
            });
            const instance = (response.data || response) as VRCInstance;

            return instance;
        }, `getInstance:${worldId}:${instanceId}`);
    },

    /**
     * Send invite to a user
     */
    async sendInvite(userId: string, instanceId: string, message?: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.inviteUser({
                path: { userId },
                body: {
                    instanceId,
                    ...(message ? { message } : {})
                }
            });
            return undefined;
        }, `sendInvite:${userId}`);
    },

    /**
     * Close/destroy a group instance
     */
    async closeInstance(worldId: string, instanceId: string): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            await client.closeInstance({
                path: { worldId, instanceId }
            });
            return undefined;
        }, `closeInstance:${worldId}:${instanceId}`);
    },

    /**
     * Update invite message slot
     */
    async updateInviteMessage(_slot: number): Promise<ApiResult<void>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const userId = authGetCurrentUserId();
            if (!userId) throw new Error('No current user');

            await client.updateUser({
                path: { userId },
                body: {
                    // VRChat stores invite messages in userNotes or similar - check SDK
                }
            });
            return undefined;
        }, `updateInviteMessage:${_slot}`);
    },

    // ========================================
    // WORLDS
    // ========================================

    /**
     * Get world details by ID
     */
    async getWorld(worldId: string, bypassCache = false): Promise<ApiResult<VRCWorld>> {
        if (!worldId) {
            return { success: false, error: 'World ID is required' };
        }

        // Check cache
        if (!bypassCache) {
            const cached = worldCache.get(worldId);
            if (cached) {
                logger.debug(`World ${worldId} served from cache`);
                return { success: true, data: cached.data };
            }
        }

        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            const response = await client.getWorld({ path: { worldId } });
            const world = response.data as VRCWorld;

            // Cache the result
            worldCache.set(worldId, { data: world, timestamp: Date.now() });

            return world;
        }, `getWorld:${worldId}`);
    },

    // ========================================
    // FRIENDS
    // ========================================

    /**
     * Get current user's friends list
     */
    async getFriends(offline = false): Promise<ApiResult<VRCFriend[]>> {
        return networkService.execute(async () => {
            const client = getVRChatClient();
            if (!client) throw new Error('Not authenticated');

            let allFriends: VRCFriend[] = [];
            let offset = 0;
            const n = 100;

            while (true) {
                logger.debug(`Fetching friends (offline=${offline}, offset=${offset})`);
                const response = await client.getFriends({
                    query: { offline, n, offset }
                });

                // Use the lower-level data or handle various SDK response formats
                const chunk = (Array.isArray(response.data) ? response.data :
                    (response.data && Array.isArray((response.data as any).data) ? (response.data as any).data : [])) as VRCFriend[];

                if (chunk.length === 0) break;

                allFriends = allFriends.concat(chunk);

                // If we got fewer than requested, we're done
                if (chunk.length < n) break;

                offset += n;
                if (offset > 1500) {
                    logger.warn(`Friend list fetch reached sanity limit of ${offset}. Truncating.`);
                    break;
                }
            }

            logger.info(`Fetched ${allFriends.length} total ${offline ? 'offline' : 'online'} friends.`);
            return allFriends;
        }, `getFriends:${offline ? 'offline' : 'online'}`);
    },

    // ========================================
    // CACHE MANAGEMENT
    // ========================================

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        userCache.clear();
        groupCache.clear();
        worldCache.clear();
        groupMembersCache.clear();
        logger.info('All API caches cleared');
    },

    /**
     * Clear group-related caches for a specific group
     */
    clearGroupCache(groupId: string): void {
        groupCache.delete(groupId);
        // Clear all member caches for this group
        for (const key of groupMembersCache.keys()) {
            if (key.startsWith(groupId)) {
                groupMembersCache.delete(key);
            }
        }
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Helper to extract array from VRChat API response
 * Some endpoints return Array, others return { results: Array } or { instances: Array }
 */
function extractArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;

    if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.results)) return obj.results;
        if (Array.isArray(obj.instances)) return obj.instances;
        if (Array.isArray(obj.members)) return obj.members;
        if (Array.isArray(obj.bans)) return obj.bans;
        if (Array.isArray(obj.roles)) return obj.roles;
        if (Array.isArray(obj.requests)) return obj.requests;
    }

    return [];
}

// Export types for consumers
export type VRChatApiService = typeof vrchatApiService;
