import log from "electron-log";
import { vrchatApiService } from "./VRChatApiService";
import { windowService } from "./WindowService";
import { groupAuthorizationService } from "./GroupAuthorizationService";
import { autoModConfigService } from "./AutoModConfigService";
import { databaseService } from "./DatabaseService";

const logger = log.scope("InstanceGuardService");

// Instance Guard event history (in-memory, persists for session)
export interface InstanceGuardEvent {
  id: string;
  timestamp: number;
  action: 'OPENED' | 'CLOSED' | 'AUTO_CLOSED' | 'INSTANCE_CLOSED';
  worldId: string;
  worldName: string;
  instanceId: string;
  groupId: string;
  reason?: string;
  closedBy?: string;
  wasAgeGated?: boolean;
  userCount?: number;
  // Owner/starter info
  ownerId?: string;
  ownerName?: string;
  // World info for modal display
  worldThumbnailUrl?: string;
  worldAuthorName?: string;
  worldCapacity?: number;
}

const instanceGuardHistory: InstanceGuardEvent[] = [];
const INSTANCE_HISTORY_MAX_SIZE = 200;

// Track instances that have already been closed to prevent spam
// Key format: "groupId:worldId:instanceId"
const closedInstancesCache = new Set<string>();
const CLOSED_INSTANCES_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const closedInstancesTimestamps = new Map<string, number>();

// Track known instances to detect new ones (for OPENED events)
// Key format: "groupId:worldId:instanceId"
const knownInstancesCache = new Set<string>();

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
        // We don't broadcast to generic automod UI here, Instance Guard has its own events
    } catch (error) {
        logger.error("[InstanceGuard] Failed to persist action:", error);
    }
};

export const instanceGuardService = {
    // Prune old entries from closed instances cache
    pruneClosedInstancesCache: () => {
        const now = Date.now();
        for (const [key, timestamp] of closedInstancesTimestamps.entries()) {
            if (now - timestamp > CLOSED_INSTANCES_CACHE_TTL) {
                closedInstancesCache.delete(key);
                closedInstancesTimestamps.delete(key);
            }
        }
    },

    getHistory: (groupId?: string) => {
        if (!groupId) return instanceGuardHistory;
        return instanceGuardHistory.filter(e => e.groupId === groupId);
    },

    clearHistory: () => {
        instanceGuardHistory.length = 0;
        return true;
    },

    // Add an event to history (used by Permission Guard too)
    addEvent: (event: InstanceGuardEvent) => {
        instanceGuardHistory.unshift(event);
        if (instanceGuardHistory.length > INSTANCE_HISTORY_MAX_SIZE) {
            instanceGuardHistory.pop();
        }
        windowService.broadcast('instance-guard:event', event);
    },

    isClosed: (key: string) => closedInstancesCache.has(key),
    markClosed: (key: string) => {
        closedInstancesCache.add(key);
        closedInstancesTimestamps.set(key, Date.now());
    },

    processInstanceGuard: async (): Promise<{
        totalClosed: number;
        groupsChecked: number;
    }> => {
        const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
        if (authorizedGroups.length === 0) {
            return { totalClosed: 0, groupsChecked: 0 };
        }

        instanceGuardService.pruneClosedInstancesCache();

        let totalClosed = 0;
        let groupsChecked = 0;

        for (const groupId of authorizedGroups) {
            try {
                // Check if any instance-related rules are enabled for this group
                const config = autoModConfigService.getGroupConfig(groupId);
                const instanceGuardRule = config.rules.find(r => r.type === 'INSTANCE_18_GUARD' && r.enabled);
                const closeAllRule = config.rules.find(r => r.type === 'CLOSE_ALL_INSTANCES' && r.enabled);

                if (!instanceGuardRule && !closeAllRule) {
                    continue; // Skip groups without any rule enabled
                }

                groupsChecked++;

                // Get configuration from whichever rule is enabled
                let whitelistedWorlds: string[] = [];
                let blacklistedWorlds: string[] = [];
                let useAgeGateLogic = false;

                if (instanceGuardRule) {
                    const ruleConfig = JSON.parse(instanceGuardRule.config || '{}');
                    whitelistedWorlds = ruleConfig.whitelistedWorlds || [];
                    blacklistedWorlds = ruleConfig.blacklistedWorlds || [];
                    useAgeGateLogic = true;
                } else if (closeAllRule) {
                    const ruleConfig = JSON.parse(closeAllRule.config || '{}');
                    whitelistedWorlds = ruleConfig.whitelistedWorlds || [];
                    blacklistedWorlds = ruleConfig.blacklistedWorlds || [];
                    useAgeGateLogic = false;
                }

                // Fetch all instances for this group
                const result = await vrchatApiService.getGroupInstances(groupId);
                if (!result.success || !result.data) {
                    logger.warn(`[InstanceGuard] Failed to fetch instances for group ${groupId}: ${result.error}`);
                    continue;
                }

                const instances = result.data;
                logger.debug(`[InstanceGuard] Checking ${instances.length} instances for group ${groupId}`);

                for (const instance of instances) {
                    const worldId = instance.worldId || instance.world?.id;
                    const instanceId = instance.instanceId || instance.name;
                    const worldName = instance.world?.name || 'Unknown World';
                    const ownerId = instance.ownerId;
                    const worldThumbnailUrl = instance.world?.thumbnailImageUrl;
                    const worldAuthorName = instance.world?.authorName;
                    const worldCapacity = instance.capacity || instance.world?.capacity;

                    if (!worldId || !instanceId) {
                        logger.warn(`[InstanceGuard] Skipping instance with missing worldId or instanceId`);
                        continue;
                    }

                    // Create a unique key for this instance
                    const instanceKey = `${groupId}:${worldId}:${instanceId}`;

                    // Check if this is a NEW instance we haven't seen before
                    const isNewInstance = !knownInstancesCache.has(instanceKey) && !closedInstancesCache.has(instanceKey);

                    if (isNewInstance) {
                        // Mark as known
                        knownInstancesCache.add(instanceKey);

                        // Fetch owner name if we have an ownerId
                        let ownerName: string | undefined;
                        if (ownerId && ownerId.startsWith('usr_')) {
                            try {
                                const ownerResult = await vrchatApiService.getUser(ownerId);
                                if (ownerResult.success && ownerResult.data) {
                                    ownerName = ownerResult.data.displayName;
                                }
                            } catch (e) {
                                logger.warn(`[InstanceGuard] Failed to fetch owner name for ${ownerId}:`, e);
                            }
                        }

                        // Log the OPENED event
                        const hasAgeGate = instance.world?.ageGate === true;
                        const openEvent: InstanceGuardEvent = {
                            id: `ig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: Date.now(),
                            action: 'OPENED',
                            worldId,
                            worldName,
                            instanceId,
                            groupId,
                            wasAgeGated: hasAgeGate,
                            userCount: instance.n_users || instance.userCount,
                            ownerId,
                            ownerName,
                            worldThumbnailUrl,
                            worldAuthorName,
                            worldCapacity
                        };

                        instanceGuardService.addEvent(openEvent);

                        logger.info(`[InstanceGuard] New instance opened: ${worldName} by ${ownerName || ownerId || 'Unknown'} (18+: ${hasAgeGate})`);
                    }

                    // Skip if we've already closed this instance recently
                    if (closedInstancesCache.has(instanceKey)) {
                        logger.debug(`[InstanceGuard] Skipping already-closed instance: ${worldName} (${instanceKey})`);
                        continue;
                    }

                    // Check blacklist first (always close blacklisted worlds)
                    const isBlacklisted = blacklistedWorlds.includes(worldId);

                    // Check whitelist (allow whitelisted worlds even if not 18+)
                    const isWhitelisted = whitelistedWorlds.includes(worldId);

                    // Important: Skip ALL processing for whitelisted worlds - they should never be closed
                    if (isWhitelisted) {
                        logger.info(`[InstanceGuard] SKIPPING whitelisted world: ${worldName} (${worldId}) - will never be closed`);
                        continue; // Skip to next instance
                    }

                    // Log blacklisted worlds for clarity
                    if (isBlacklisted) {
                        logger.info(`[InstanceGuard] Found blacklisted world: ${worldName} (${worldId}) - will be closed`);
                    }

                    // ALWAYS fetch complete instance data when using 18+ Guard logic
                    if (useAgeGateLogic && !isBlacklisted) {
                        try {
                            logger.debug(`[InstanceGuard] Fetching complete instance data for age gate check: ${worldName}`);
                            const instId = instance.instanceId || instance.name;
                            if (instId) {
                                const instanceResult = await vrchatApiService.getInstance(instance.worldId || worldId, instId);

                                if (instanceResult.success && instanceResult.data) {
                                    // Update instance with complete data including ageGate
                                    instance.ageGate = instanceResult.data.ageGate;
                                    if (instanceResult.data.world?.ageGate !== undefined) {
                                        if (instance.world) {
                                            instance.world.ageGate = instanceResult.data.world.ageGate;
                                        } else {
                                            instance.world = {
                                                id: instanceResult.data.world.id || '',
                                                name: instanceResult.data.world.name || worldName,
                                                ageGate: instanceResult.data.world.ageGate
                                            };
                                        }
                                    }
                                    
                                    // Additional check: Inspect location string for "ageGate" tag (from reference logic)
                                    // Some instances might not have the flag set correctly in API but have it in location
                                    if (instance.location && instance.location.includes('ageGate')) {
                                        instance.ageGate = true;
                                        logger.debug(`[InstanceGuard] Detected 'ageGate' tag in location string for ${worldName}: ${instance.location}`);
                                    }

                                    logger.info(`[InstanceGuard] Fetched and verified age gate for ${worldName}: instance.ageGate=${instance.ageGate}, world.ageGate=${instance.world?.ageGate}`);
                                } else {
                                    logger.warn(`[InstanceGuard] Failed to fetch complete instance data for ${worldName}: ${instanceResult.error}`);
                                }
                            }
                        } catch (fetchError) {
                            logger.warn(`[InstanceGuard] Error fetching complete instance data for ${worldName}:`, fetchError);
                        }
                    }

                    // Determine if we should close this instance
                    let shouldClose = false;
                    let closeReason = '';

                    const logPrefix = `[InstanceGuard] Checking ${worldName} (${instanceKey}):`;
                    logger.info(`${logPrefix} whitelisted=${isWhitelisted}, blacklisted=${isBlacklisted}, ruleType=${useAgeGateLogic ? '18+ Guard' : 'Close All'}`);

                    if (isBlacklisted) {
                        shouldClose = true;
                        closeReason = `World "${worldName}" is blacklisted`;
                    } else if (!isWhitelisted) {
                        if (useAgeGateLogic) {
                            // 18+ Guard logic
                            const hasAgeGate = instance.ageGate === true || instance.world?.ageGate === true;
                            logger.info(`${logPrefix} Age gate check: hasAgeGate=${hasAgeGate}`);

                            if (!hasAgeGate) {
                                shouldClose = true;
                                closeReason = `Instance is not 18+ age-gated`;
                            } else {
                                logger.info(`[InstanceGuard] Instance ${worldName} is 18+ verified - will NOT be closed`);
                            }
                        } else {
                            // Close All Instances logic - close regardless of age gate
                            shouldClose = true;
                            closeReason = `Close all instances rule enabled`;
                        }
                    }

                    if (shouldClose) {
                        logger.warn(`[InstanceGuard] Closing instance: ${worldName} (${worldId}:${instanceId}) - Reason: ${closeReason}`);

                        try {
                            const closeResult = await vrchatApiService.closeInstance(worldId, instanceId);

                            if (closeResult.success) {
                                totalClosed++;

                                // Mark this instance as closed to prevent duplicate actions
                                instanceGuardService.markClosed(instanceKey);

                                // Log the action
                                await persistAction({
                                    timestamp: new Date(),
                                    user: 'System',
                                    userId: 'system',
                                    groupId,
                                    action: 'INSTANCE_CLOSED',
                                    reason: closeReason,
                                    module: 'InstanceGuard',
                                    details: {
                                        worldId,
                                        instanceId,
                                        worldName,
                                        wasAgeGated: instance.ageGate === true || instance.world?.ageGate === true,
                                        wasBlacklisted: isBlacklisted,
                                        ruleName: '18+ Instance Guard'
                                    },
                                    skipBroadcast: true
                                });

                                // Fetch owner name if we have an ownerId
                                let ownerName: string | undefined;
                                if (ownerId && ownerId.startsWith('usr_')) {
                                    try {
                                        const ownerResult = await vrchatApiService.getUser(ownerId);
                                        if (ownerResult.success && ownerResult.data) {
                                            ownerName = ownerResult.data.displayName;
                                        }
                                    } catch {
                                        // Ignore
                                    }
                                }

                                // Create event entry
                                const eventEntry: InstanceGuardEvent = {
                                    id: `ig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    timestamp: Date.now(),
                                    action: 'AUTO_CLOSED',
                                    worldId,
                                    worldName,
                                    instanceId,
                                    groupId,
                                    reason: closeReason,
                                    closedBy: 'System',
                                    wasAgeGated: instance.ageGate === true || instance.world?.ageGate === true,
                                    userCount: instance.n_users || instance.userCount,
                                    ownerId,
                                    ownerName,
                                    worldThumbnailUrl,
                                    worldAuthorName,
                                    worldCapacity
                                };

                                instanceGuardService.addEvent(eventEntry);
                                logger.info(`[InstanceGuard] Successfully closed instance: ${worldName}`);
                            } else {
                                // If the close failed, also add to cache to prevent spamming retries
                                instanceGuardService.markClosed(instanceKey);
                                logger.error(`[InstanceGuard] Failed to close instance ${worldName}: ${closeResult.error}`);
                            }
                        } catch (closeError) {
                            // On error, also cache to prevent spam retries
                            instanceGuardService.markClosed(instanceKey);
                            logger.error(`[InstanceGuard] Error closing instance ${worldName}:`, closeError);
                        }
                    }
                }
            } catch {
                logger.error(`[InstanceGuard] Error processing group ${groupId}`);
            }
        }

        if (totalClosed > 0) {
            logger.info(`[InstanceGuard] Processing complete: ${totalClosed} instances closed across ${groupsChecked} groups`);
        }

        return { totalClosed, groupsChecked };
    }
};
