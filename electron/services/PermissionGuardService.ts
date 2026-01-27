import log from "electron-log";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { LRUCache } from "lru-cache";
import { vrchatApiService, VRCGroupRole } from "./VRChatApiService";
import { getVRChatClient } from "./AuthService";
import { groupAuthorizationService } from "./GroupAuthorizationService";
import { autoModConfigService } from "./AutoModConfigService";
import { instanceGuardService, InstanceGuardEvent } from "./InstanceGuardService";
import { databaseService } from "./DatabaseService";
import { windowService } from "./WindowService";

const logger = log.scope("PermissionGuardService");

const INSTANCE_CREATE_PERMISSIONS = [
    "group-instance-public-create",
    "group-instance-plus-create",
    "group-instance-open-create",
    "group-instance-restricted-create"
];

// Cache for processed audit logs
const processedAuditLogIds = new Set<string>();
const PROCESSED_AUDIT_LOG_CACHE_SIZE = 1000;

// Persistence file
const PROCESSED_LOGS_FILE = path.join(app.getPath('userData'), 'permission-guard-processed-logs.json');
let processedLogsLoaded = false;

// Rate limit backoff
let permissionGuardPausedUntil = 0;
const RATE_LIMIT_PAUSE_MS = 30 * 60 * 1000; // 30 minutes

// Cache for group roles
const groupRolesCache = new LRUCache<string, { roles: VRCGroupRole[], timestamp: number }>({
    max: 50,
    ttl: 1000 * 60 * 5 // 5 minutes
});

const persistAction = async (entry: {
    timestamp: Date;
    user: string;
    userId: string;
    groupId: string;
    action: string;
    reason: string;
    module: string;
    details?: Record<string, unknown>;
    skipBroadcast?: boolean;
}) => {
    try {
        await databaseService.createAutoModLog({
            timestamp: entry.timestamp,
            userId: entry.userId,
            user: entry.user,
            groupId: entry.groupId,
            action: entry.action,
            reason: entry.reason,
            module: entry.module,
            details: JSON.stringify(entry.details || {})
        });
    } catch (error) {
        logger.error("[PermissionGuard] Failed to persist action:", error);
    }
};

const loadProcessedAuditLogs = () => {
    if (processedLogsLoaded) return;
    try {
        if (fs.existsSync(PROCESSED_LOGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PROCESSED_LOGS_FILE, 'utf-8'));
            if (Array.isArray(data)) {
                data.forEach(id => processedAuditLogIds.add(id));
                logger.info(`[PermissionGuard] Loaded ${data.length} processed log IDs from disk`);
            }
        }
    } catch (err) {
        logger.warn(`[PermissionGuard] Failed to load processed logs from disk:`, err);
    }
    processedLogsLoaded = true;
};

const saveProcessedAuditLogs = () => {
    try {
        const entries = Array.from(processedAuditLogIds).slice(-PROCESSED_AUDIT_LOG_CACHE_SIZE);
        fs.writeFileSync(PROCESSED_LOGS_FILE, JSON.stringify(entries), 'utf-8');
    } catch (err) {
        logger.warn(`[PermissionGuard] Failed to save processed logs to disk:`, err);
    }
};

const pruneProcessedAuditLogs = () => {
    if (processedAuditLogIds.size > PROCESSED_AUDIT_LOG_CACHE_SIZE) {
        const entries = Array.from(processedAuditLogIds);
        entries.slice(0, PROCESSED_AUDIT_LOG_CACHE_SIZE / 2).forEach(e => processedAuditLogIds.delete(e));
    }
};

export const permissionGuardService = {
    checkPermissions: async (): Promise<{
        totalClosed: number;
        groupsChecked: number;
    }> => {
        // Load persisted audit log IDs on first run
        loadProcessedAuditLogs();

        // Check if we're paused due to rate limiting
        if (Date.now() < permissionGuardPausedUntil) {
            const remainingMinutes = Math.ceil((permissionGuardPausedUntil - Date.now()) / 60000);
            logger.debug(`[PermissionGuard] Rate limit pause active. ${remainingMinutes} minutes remaining.`);
            return { totalClosed: 0, groupsChecked: 0 };
        }

        const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
        if (authorizedGroups.length === 0) {
            return { totalClosed: 0, groupsChecked: 0 };
        }

        let totalClosed = 0;
        let groupsChecked = 0;

        // Helper to check permissions
        const hasInstanceCreatePermission = (userRoleIds: string[], groupRoles: VRCGroupRole[]) => {
            // Build a map of roleId -> permissions for quick lookup
            const rolePermissionsMap = new Map<string, string[]>();
            groupRoles.forEach(r => {
                if (r.id && r.permissions) {
                    rolePermissionsMap.set(r.id, r.permissions);
                }
            });

            for (const roleId of userRoleIds) {
                const permissions = rolePermissionsMap.get(roleId) || [];
                if (permissions.includes("*")) return true; // Wildcard admin

                for (const perm of permissions) {
                    if (INSTANCE_CREATE_PERMISSIONS.includes(perm)) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Helper to parse targetId from audit log
        const parseInstanceLocation = (targetId: string) => {
            if (!targetId) return null;
            // Format: "wrld_xxx:12345~..."
            const colonIndex = targetId.indexOf(':');
            if (colonIndex === -1) return null;
            return {
                worldId: targetId.substring(0, colonIndex),
                instanceId: targetId.substring(colonIndex + 1)
            };
        };

        for (const groupId of authorizedGroups) {
            try {
                // Check if INSTANCE_PERMISSION_GUARD is enabled
                const config = autoModConfigService.getGroupConfig(groupId);
                const sniperRule = config.rules.find(r => r.type === 'INSTANCE_PERMISSION_GUARD' && r.enabled);

                if (!sniperRule) continue;
                groupsChecked++;

                // 1. Fetch Audit Logs
                const logsResult = await vrchatApiService.getGroupAuditLogs(groupId, 20);
                if (!logsResult.success || !logsResult.data) {
                    // Check for 429 rate limit
                    if (logsResult.error?.includes('429') || logsResult.error?.toLowerCase().includes('rate limit')) {
                        logger.warn(`[PermissionGuard] Rate limit hit (429). Pausing for 30 minutes.`);
                        permissionGuardPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
                        return { totalClosed, groupsChecked };
                    }
                    continue;
                }

                const logs = logsResult.data;

                // 2. Filter for new 'group.instance.create' events
                const creationEvents = logs.filter(log =>
                    log.eventType === "group.instance.create" &&
                    !processedAuditLogIds.has(`${groupId}:${log.id}`)
                );

                if (creationEvents.length === 0) continue;

                logger.info(`[PermissionGuard] Found ${creationEvents.length} new instance creation events for group ${groupId}`);

                // 3. Ensure we have group roles loaded
                let groupRoles = groupRolesCache.get(groupId)?.roles;
                if (!groupRoles) {
                    const rolesResult = await vrchatApiService.getGroupRoles(groupId);
                    if (rolesResult.success && rolesResult.data) {
                        groupRoles = rolesResult.data;
                        groupRolesCache.set(groupId, { roles: groupRoles, timestamp: Date.now() });
                    } else {
                        logger.warn(`[PermissionGuard] Failed to fetch roles for ${groupId}, skipping check.`);
                        continue;
                    }
                }

                // 4. Process each event
                for (const logItem of creationEvents) {
                    const logKey = `${groupId}:${logItem.id}`;
                    processedAuditLogIds.add(logKey); // Mark as processed immediately
                    pruneProcessedAuditLogs();

                    const actorId = logItem.actorId;
                    const targetId = logItem.targetId; // This contains worldId:instanceId

                    if (!actorId || !targetId) continue;

                    const location = parseInstanceLocation(targetId);
                    if (!location) continue;

                    // Check if the instance is already closed (cached check)
                    const instanceKey = `${groupId}:${location.worldId}:${location.instanceId}`;
                    if (instanceGuardService.isClosed(instanceKey)) continue;

                    logger.debug(`[PermissionGuard] Checking instance created by ${logItem.actorDisplayName} (${actorId})`);

                    // 5. Check User Roles
                    try {
                        const client = getVRChatClient();
                        if (!client) continue;

                        let member;
                        try {
                            const memberResp = await client.getGroupMember({ path: { groupId, userId: actorId } });
                            member = memberResp.data;
                        } catch (unknownError: unknown) {
                            const e = unknownError as { response?: { status: number } };
                            if (e.response?.status === 404) {
                                logger.warn(`[PermissionGuard] Creator ${actorId} is no longer in group. treating as UNAUTHORIZED.`);
                            } else {
                                logger.error(`[PermissionGuard] Error fetching member ${actorId}:`, unknownError);
                                continue; // Skip if API error (not 404)
                            }
                        }

                        let isAuthorized = false;

                        if (member) {
                            const userRoleIds = [
                                ...(member.roleIds || []),
                                ...(member.mRoleIds || [])
                            ];
                            isAuthorized = hasInstanceCreatePermission(userRoleIds, groupRoles);
                        } else {
                            // User not found (404) -> Unauthorized
                            isAuthorized = false;
                        }

                        if (!isAuthorized) {
                            const reason = member ? `User does not have instance creation permissions` : `User is not a member of the group`;
                            logger.info(`[PermissionGuard] 🚨 UNAUTHORIZED INSTANCE DETECTED! Closing... Creator: ${logItem.actorDisplayName} (${actorId}). Reason: ${reason}`);

                            // CLOSE IT
                            const closeResult = await vrchatApiService.closeInstance(location.worldId, location.instanceId);

                            // Treat "Already Closed" (403) as success to stop retrying
                            const isAlreadyClosed = closeResult.error?.includes('403') || closeResult.error?.toLowerCase().includes('already closed');

                            if (closeResult.success || isAlreadyClosed) {
                                totalClosed++;
                                // Add to closed cache
                                instanceGuardService.markClosed(instanceKey);

                                if (isAlreadyClosed) {
                                    logger.info(`[PermissionGuard] Instance already closed (treating as success)`);
                                }

                                // Log action
                                await persistAction({
                                    timestamp: new Date(),
                                    user: logItem.actorDisplayName || 'Unknown',
                                    userId: actorId,
                                    groupId,
                                    action: 'INSTANCE_CLOSED',
                                    reason: `[Permission Guard] ${reason}`,
                                    module: 'PermissionGuard',
                                    details: {
                                        worldId: location.worldId,
                                        instanceId: location.instanceId,
                                        ruleName: 'Permission Guard'
                                    },
                                    skipBroadcast: false // Broadcast this! It's important.
                                });

                                // Event for UI
                                const eventEntry: InstanceGuardEvent = {
                                    id: `pg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    timestamp: Date.now(),
                                    action: 'AUTO_CLOSED',
                                    worldId: location.worldId,
                                    worldName: 'Unknown (Sniper)', // We'd need to fetch world info to know name, maybe overkill for now
                                    instanceId: location.instanceId,
                                    groupId,
                                    reason: `[Permission Guard] ${reason}`,
                                    closedBy: 'Permission Guard',
                                    wasAgeGated: false, // Unknown
                                    ownerId: actorId,
                                    ownerName: logItem.actorDisplayName,
                                };
                                instanceGuardService.addEvent(eventEntry);

                            } else {
                                // Check for 429 rate limit on close attempt
                                if (closeResult.error?.includes('429') || closeResult.error?.toLowerCase().includes('rate limit')) {
                                    logger.warn(`[PermissionGuard] Rate limit hit (429) during close. Pausing for 30 minutes.`);
                                    permissionGuardPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
                                } else {
                                    logger.error(`[PermissionGuard] Failed to close instance: ${closeResult.error}`);
                                }
                            }
                        } else {
                            logger.debug(`[PermissionGuard] Instance allowed. Creator has permission.`);
                        }

                    } catch (err) {
                        logger.error(`[PermissionGuard] Error processing log entry`, err);
                    }
                }

            } catch (e) {
                logger.error(`[PermissionGuard] Error checking group ${groupId}:`, e);
            }
        }

        // Save processed logs to disk after each cycle
        saveProcessedAuditLogs();

        return { totalClosed, groupsChecked };
    }
};
