/**
 * GroupAuthorizationService
 * 
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     CRITICAL SECURITY SERVICE                            ║
 * ║                                                                          ║
 * ║  ANY new feature that accepts a groupId MUST use this service!          ║
 * ║  See: .agent/workflows/security-requirements.md                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * This service enforces that ALL group-related API actions are only performed
 * on groups where the current user has verified moderation permissions.
 * 
 * SECURITY CONTRACT:
 * - Only groups returned by VRChat's getUserGroups API with moderation permissions are allowed
 * - All IPC handlers MUST call validateAccess() before performing any group action
 * - Unauthorized access attempts are logged for security auditing
 * 
 * USAGE EXAMPLE:
 * ```typescript
 * import { groupAuthorizationService } from './GroupAuthorizationService';
 * 
 * ipcMain.handle('groups:new-feature', async (_event, { groupId }) => {
 *   // SECURITY: Always validate first!
 *   groupAuthorizationService.validateAccess(groupId, 'groups:new-feature');
 *   // ... your code here
 * });
 * ```
 */

import log from 'electron-log';
import { serviceEventBus } from './ServiceEventBus';
import { getVRChatClient } from './AuthService';
import Store from 'electron-store';
import { LRUCache } from 'lru-cache';

const logger = log.scope('GroupAuthorization');

// Moderation permission strings that indicate mod powers
const MODERATION_PERMISSIONS = [
    'group-bans-manage',
    'group-members-manage',
    // 'group-members-viewall', // Too broad - regular members often have this
    'group-members-remove',
    'group-data-manage',
    'group-audit-view',
    'group-join-request-manage',
    'group-instance-moderate',
    'group-instance-open',
    'group-instance-close'
];

interface GroupMembershipData {
    id: string;
    groupId?: string;
    ownerId?: string;
    userId?: string;
    roleIds?: string[];
    myMember?: { permissions?: string[]; roleIds?: string[] };
    group?: { ownerId?: string; name?: string };
    [key: string]: unknown;
}

class GroupAuthorizationService {
    // Set of group IDs where the user has moderation permissions
    private allowedGroupIds: Set<string> = new Set();

    // Persistent store for allowed groups (for instant startup)
    private store = new Store({ name: 'group-authorization-cache' });

    // Role cache to prevent redundant API calls
    // Key: groupId, Value: array of roles
    private roleCache = new LRUCache<string, any[]>({
        max: 200,
        ttl: 1000 * 60 * 60 * 24 // 24 hour TTL for roles
    });

    // Flag to track if permissions have been initialized
    private initialized: boolean = false;

    // Audit log of rejected access attempts
    private rejectionLog: Array<{
        timestamp: Date;
        groupId: string;
        action: string;
        reason: string;
    }> = [];

    constructor() {
        // Load allowed groups from disk for instant dashboard unlocking
        this.loadPersistedGroups();

        // Listen for raw group updates from GroupService (legacy support for event-based calls)
        serviceEventBus.on('groups-raw', async (payload) => {
            logger.info(`[SECURITY] Received groups-raw event with ${payload.groups?.length || 0} groups`);
            await this.processAndAuthorizeGroups(payload.groups || [], payload.userId);
        });
    }

    /**
     * Load allowed groups from persistent storage
     */
    private loadPersistedGroups(): void {
        try {
            const cached = this.store.get('allowedGroupIds') as string[];
            if (Array.isArray(cached) && cached.length > 0) {
                this.allowedGroupIds = new Set(cached.filter(id => id && id.startsWith('grp_')));
                this.initialized = true;
                logger.info(`[SECURITY] Loaded ${this.allowedGroupIds.size} allowed groups from disk cache`);

                // Emit event early to unlock UI
                // We'll emit an empty array of group objects just to signal initialization
                // if other services need the actual objects, they'll wait for the network fetch
                serviceEventBus.emit('groups-cache-ready', { groupIds: Array.from(this.allowedGroupIds) });
            }
        } catch (e) {
            logger.warn('[SECURITY] Failed to load persisted groups:', e);
        }
    }

    /**
     * Persist allowed groups to disk
     */
    private persistGroups(): void {
        try {
            this.store.set('allowedGroupIds', Array.from(this.allowedGroupIds));
        } catch (e) {
            logger.error('[SECURITY] Failed to persist groups:', e);
        }
    }

    /**
     * Process raw group memberships and determine which ones the user can moderate.
     * This is the core authorization logic - checking ownership or mod permissions.
     * 
     * @param groups Raw group membership data from VRChat API
     * @param userId The user ID to check permissions for
     * @returns Array of groups where the user has moderation permissions
     */
    public async processAndAuthorizeGroups(groups: GroupMembershipData[], userId: string): Promise<GroupMembershipData[]> {
        const client = getVRChatClient();
        const moderatableGroups: GroupMembershipData[] = [];

        if (!client || !userId) {
            logger.warn('[SECURITY] Cannot process groups: no client or userId');
            this.setAllowedGroups([]);
            return [];
        }

        for (const g of groups) {
            const groupId = g.groupId || g.id;
            if (!groupId || !groupId.startsWith('grp_')) {
                continue;
            }

            // Check if user is owner
            const isOwner = g.ownerId === userId || g.group?.ownerId === userId;

            if (isOwner) {
                moderatableGroups.push(g);
                continue;
            }

            // Check for moderation permissions via roles
            const hasMod = await this.checkModPermissions(groupId, userId, g);
            if (hasMod) {
                moderatableGroups.push(g);
            }
        }

        // Map the groups to ensure 'id' is the Group ID (grp_), not the Member ID (gmem_)
        const mappedGroups = moderatableGroups.map((g) => {
            if (g.groupId && typeof g.groupId === 'string' && g.groupId.startsWith('grp_')) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const groupObj = g as any;
                const innerGroup = groupObj.group || {};

                return {
                    ...g,
                    id: g.groupId,
                    _memberId: g.id,
                    name: innerGroup.name || g.group?.name || groupObj.name || 'Unknown Group',
                    onlineMemberCount: innerGroup.onlineMemberCount ?? groupObj.onlineMemberCount,
                    activeInstanceCount: innerGroup.activeInstanceCount ?? groupObj.activeInstanceCount
                };
            }
            return g;
        });

        // Set allowed groups
        const groupIds = mappedGroups
            .map((g) => g.id || g.groupId)
            .filter((id): id is string => !!id && id.startsWith('grp_'));
        this.setAllowedGroups(groupIds);
        this.persistGroups();

        // Emit filtered groups for other services
        logger.info(`[SECURITY] Authorized ${mappedGroups.length} moderatable groups`);
        serviceEventBus.emit('groups-updated', { groups: mappedGroups });

        return mappedGroups;
    }

    /**
     * Check if a user has moderation permissions in a group by checking their roles.
     */
    private async checkModPermissions(groupId: string, userId: string, membership: GroupMembershipData): Promise<boolean> {
        const client = getVRChatClient();
        if (!client) return false;

        // roleIds might be at top level, in myMember, or we need to fetch them
        let userRoleIds = membership.roleIds || membership.myMember?.roleIds || [];

        // If no roleIds in the membership response, fetch member record directly
        if (userRoleIds.length === 0) {
            try {
                const memberResp = await client.getGroupMember({
                    path: { groupId, userId }
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const memberRecord = (memberResp.data || memberResp) as any;

                if (memberRecord) {
                    userRoleIds = memberRecord.roleIds || [];
                }
            } catch (e) {
                logger.warn(`[SECURITY] Failed to fetch member record for group ${groupId}:`, e);
                return false;
            }
        }

        if (!userRoleIds || userRoleIds.length === 0) {
            return false;
        }

        // Fetch group roles and check for moderation permissions
        try {
            // Use cache if available
            let roles = this.roleCache.get(groupId);

            if (!roles) {
                const rolesResponse = await client.getGroupRoles({ path: { groupId } });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                roles = (rolesResponse.data || rolesResponse || []) as any[];
                this.roleCache.set(groupId, roles);
            }

            for (const roleId of userRoleIds) {
                const role = roles.find((r: { id?: string }) => r.id === roleId);
                if (role && role.permissions && Array.isArray(role.permissions)) {
                    const hasModPerm = role.permissions.some((p: string) =>
                        MODERATION_PERMISSIONS.includes(p)
                    );
                    if (hasModPerm) {
                        return true;
                    }
                }
            }

            return false;
        } catch (e) {
            logger.warn(`[SECURITY] Failed to fetch roles for group ${groupId}:`, e);
            return false;
        }
    }

    /**
     * Updates the list of allowed groups.
     * Called by GroupService after fetching user's moderated groups.
     * 
     * @param groupIds Array of group IDs where user has moderation permissions
     */
    public setAllowedGroups(groupIds: string[]): void {
        this.allowedGroupIds = new Set(groupIds.filter(id => id && id.startsWith('grp_')));
        this.initialized = true;
        logger.info(`[SECURITY] Authorized groups updated: ${this.allowedGroupIds.size} groups allowed`);
        logger.debug(`[SECURITY] Allowed group IDs: ${Array.from(this.allowedGroupIds).join(', ')}`);
    }

    /**
     * Clears all allowed groups (used on logout)
     */
    public clearAllowedGroups(): void {
        this.allowedGroupIds.clear();
        this.initialized = false;
        logger.info('[SECURITY] Authorized groups cleared (logout)');
    }

    /**
     * Checks if a group ID is in the allowed list
     * 
     * @param groupId The group ID to check
     * @returns true if access is allowed, false otherwise
     */
    public isGroupAllowed(groupId: string): boolean {
        if (!groupId || !groupId.startsWith('grp_')) {
            return false;
        }
        return this.allowedGroupIds.has(groupId);
    }

    /**
     * Validates access to a group and throws if unauthorized.
     * This is the primary method that MUST be called by all IPC handlers.
     * 
     * @param groupId The group ID being accessed
     * @param action Description of the action being attempted (for logging)
     * @throws Error if access is denied
     */
    public validateAccess(groupId: string, action: string): void {
        // Validate group ID format
        if (!groupId || typeof groupId !== 'string') {
            const reason = 'Invalid group ID format (null or non-string)';
            this.logRejection(groupId, action, reason);
            throw new Error(`[SECURITY] Access Denied: ${reason}`);
        }

        if (!groupId.startsWith('grp_')) {
            const reason = `Invalid group ID format (must start with 'grp_'): ${groupId}`;
            this.logRejection(groupId, action, reason);
            throw new Error(`[SECURITY] Access Denied: ${reason}`);
        }

        // Check if authorized
        if (!this.allowedGroupIds.has(groupId)) {
            const reason = `User does not have moderation permissions for group: ${groupId}`;
            this.logRejection(groupId, action, reason);
            throw new Error(`[SECURITY] Access Denied: ${reason}`);
        }

        // Access granted - log for audit trail
        logger.debug(`[SECURITY] Access granted: ${action} on ${groupId}`);
    }

    /**
     * Validates access and returns a result object instead of throwing.
     * Use this when you need to handle rejection gracefully in the caller.
     * 
     * @param groupId The group ID being accessed
     * @param action Description of the action being attempted
     * @returns Object with success boolean and optional error message
     */
    public validateAccessSafe(groupId: string, action: string): { allowed: boolean; error?: string } {
        try {
            this.validateAccess(groupId, action);
            return { allowed: true };
        } catch (e) {
            const err = e as Error;
            return { allowed: false, error: err.message };
        }
    }

    /**
     * Get all currently allowed group IDs
     * 
     * @returns Array of allowed group IDs
     */
    public getAllowedGroupIds(): string[] {
        return Array.from(this.allowedGroupIds);
    }

    /**
     * Filters a list of data items to ensure they only belong to authorized groups.
     * Useful for cleaning API responses that might return data for groups the user
     * is in but doesn't have moderation permissions for.
     * 
     * @param items Array of data items to filter
     * @param groupIdExtractor Function to extract the group ID from an item
     * @returns Array containing only items belonging to authorized groups
     */
    public filterAuthorizedData<T>(items: T[], groupIdExtractor: (item: T) => string | undefined): T[] {
        if (!Array.isArray(items)) {
            return [];
        }

        const filtered = items.filter(item => {
            try {
                const groupId = groupIdExtractor(item);
                // If we can't extract a group ID, we assume it's not group-specific data
                // OR it's malformed. To be safe/strict as requested:
                if (!groupId) return false;

                return this.isGroupAllowed(groupId);
            } catch (e) {
                logger.error('[SECURITY] Error extracting group ID during filter:', e);
                return false;
            }
        });

        const removedCount = items.length - filtered.length;
        if (removedCount > 0) {
            logger.warn(`[SECURITY] Cleaned API data: Removed ${removedCount} items belonging to unauthorized groups.`);
        }

        return filtered;
    }

    /**
     * Check if the service has been initialized with group data
     */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get rejection audit log
     */
    public getRejectionLog(): ReadonlyArray<{
        timestamp: Date;
        groupId: string;
        action: string;
        reason: string;
    }> {
        return this.rejectionLog;
    }

    /**
     * Clear rejection log
     */
    public clearRejectionLog(): void {
        this.rejectionLog = [];
    }

    /**
     * Internal: Log a rejection for security auditing
     */
    private logRejection(groupId: string, action: string, reason: string): void {
        const entry = {
            timestamp: new Date(),
            groupId: groupId || 'null',
            action,
            reason
        };

        this.rejectionLog.push(entry);

        // Keep log from growing unbounded
        if (this.rejectionLog.length > 1000) {
            this.rejectionLog = this.rejectionLog.slice(-500);
        }

        logger.warn(`[SECURITY VIOLATION] Action: ${action} | Group: ${groupId} | Reason: ${reason}`);
    }
}

// Singleton export
export const groupAuthorizationService = new GroupAuthorizationService();
