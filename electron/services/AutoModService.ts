import Store from 'electron-store';
import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { getVRChatClient } from './AuthService';
import { databaseService } from './DatabaseService';
import { instanceLoggerService } from './InstanceLoggerService';
import { logWatcherService } from './LogWatcherService';
import { groupAuthorizationService } from './GroupAuthorizationService';
import { evaluateUser } from './AutoModLogic';
import { fetchUser } from './UserService';
import { windowService } from './WindowService';
import { discordWebhookService } from './DiscordWebhookService';

const logger = log.scope('AutoModService');

// Simplified Types
export type AutoModActionType = 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY';
export type AutoModRuleType = 'AGE_VERIFICATION' | string;

export interface AutoModRule {
    id: number;
    name: string;
    enabled: boolean;
    type: AutoModRuleType;
    config: string; // JSON
    actionType: AutoModActionType;
    createdAt?: string;
}

interface AutoModStoreSchema {
    rules: AutoModRule[];
    liveAutoBan: boolean;
}

// Initialize store
export const store = new Store<AutoModStoreSchema>({
    name: 'automod-rules',
    defaults: {
        rules: [],
        liveAutoBan: false
    }
});



// The core AutoMod logic
let autoModInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL = 60 * 1000; // Check every minute

// Track processed requests to prevent duplicates within a session
const processedRequests = new Set<string>();
const PROCESSED_CACHE_MAX_SIZE = 1000;

// Clear old entries if cache gets too large
const pruneProcessedCache = () => {
    if (processedRequests.size > PROCESSED_CACHE_MAX_SIZE) {
        const entries = Array.from(processedRequests);
        entries.slice(0, PROCESSED_CACHE_MAX_SIZE / 2).forEach(e => processedRequests.delete(e));
    }
};

// Persist AutoMod actions to database file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistAction = async (logEntry: any) => {
    try {
        await databaseService.createAutoModLog({
            timestamp: new Date(logEntry.timestamp),
            user: logEntry.user,
            userId: logEntry.userId,
            groupId: logEntry.groupId,
            action: logEntry.action,
            reason: logEntry.reason,
            module: logEntry.module,
            details: logEntry.details
        });
        logger.info('Persisted AutoMod action to database');
    } catch (error) {
        logger.error('Failed to persist AutoMod action', error);
         // Fallback?
    }
};

// ============================================
// AUTO-PROCESS JOIN REQUESTS
// ============================================

// Process a single join request
export const processJoinRequest = async (
    groupId: string, 
    userId: string, 
    displayName: string,
    _userDetails?: {
        bio?: string;
        status?: string;
        statusDescription?: string;
        pronouns?: string;
        tags?: string[];
        ageVerificationStatus?: string;
    }
): Promise<{ processed: boolean; action: 'accept' | 'reject' | 'skip'; reason?: string }> => {
    const client = getVRChatClient();
    if (!client) {
        logger.warn('[AutoMod] Cannot process request - not authenticated');
        return { processed: false, action: 'skip', reason: 'Not authenticated' };
    }

    // Check if already processed
    const cacheKey = `gatekeeper:${groupId}:${userId}`;
    if (processedRequests.has(cacheKey)) {
        logger.debug(`[AutoMod] Request ${userId} already processed, skipping`);
        return { processed: false, action: 'skip', reason: 'Already processed' };
    }

    // Check if any rules are enabled
    const rules = store.get('rules').filter(r => r.enabled);
    if (rules.length === 0) {
        logger.debug('[AutoMod] No enabled rules, skipping auto-processing');
        return { processed: false, action: 'skip', reason: 'No enabled rules' };
    }

    try {
        // Fetch full user details if not provided
        let fullUser = _userDetails;
        
        if (!fullUser || !fullUser.tags) {
            try {
                // Use centralized fetchUser to leverage cache and consistent logging
                const fetched = await fetchUser(userId);
                if (fetched) {
                    fullUser = {
                        ...fullUser,
                        tags: fetched.tags,
                        bio: fetched.bio,
                        status: fetched.status,
                        statusDescription: fetched.statusDescription,
                        pronouns: fetched.pronouns,
                        ageVerificationStatus: fetched.ageVerificationStatus // Verify this field exists on fetched user
                    };
                }
            } catch (e) {
                logger.warn(`[AutoMod] Failed to fetch user details for ${displayName}`, e);
            }
        }

        // Evaluate user against all enabled rules
        const evaluation = await evaluateUser({
            id: userId,
            displayName: displayName,
            tags: fullUser?.tags,
            bio: fullUser?.bio,
            status: fullUser?.status,
            statusDescription: fullUser?.statusDescription,
            pronouns: fullUser?.pronouns,
            ageVerificationStatus: fullUser?.ageVerificationStatus
        });

        logger.info(`[AutoMod] Gatekeeper evaluation for ${displayName}: ${evaluation.action}${evaluation.reason ? ` (${evaluation.reason})` : ''}`);

        // Mark as processed
        processedRequests.add(cacheKey);
        pruneProcessedCache();

        if (evaluation.action === 'ALLOW') {
            // User passes all rules - auto-accept
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const clientAny = client as any;
                await clientAny.respondGroupJoinRequest({
                    path: { groupId, userId },
                    body: { action: 'accept' }
                });
                
                logger.info(`[AutoMod] ✓ Auto-accepted ${displayName} into group ${groupId}`);
                
                await persistAction({
                    timestamp: new Date(),
                    user: displayName,
                    userId: userId,
                    groupId: groupId,
                    action: 'AUTO_ACCEPT',
                    reason: 'Passed all AutoMod filters',
                    module: 'Gatekeeper',
                    details: { evaluation }
                });

                return { processed: true, action: 'accept' };
            } catch (e) {
                logger.error(`[AutoMod] Failed to accept ${displayName}:`, e);
                return { processed: false, action: 'skip', reason: 'API error on accept' };
            }
        } else {
            // User failed a rule - auto-reject/block logic

            // Check Master Switch for destructive actions
            const liveAutoBanEnabled = store.get('liveAutoBan') === true;
            if (!liveAutoBanEnabled) {
                logger.info(`[AutoMod] 🛑 Auto-Ban/Reject SKIPPED for ${displayName} (Auto-Ban Toggle is OFF). Reason: ${evaluation.reason}`);
                // We SKIP the rejection. The request remains pending.
                return { processed: false, action: 'skip', reason: 'Auto-Ban Disabled' };
            }

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const clientAny = client as any;
                await clientAny.respondGroupJoinRequest({
                    path: { groupId, userId },
                    body: { action: 'reject' }
                });
                
                logger.info(`[AutoMod] ✗ Auto-rejected ${displayName} from group ${groupId}: ${evaluation.reason}`);
                
                await persistAction({
                    timestamp: new Date(),
                    user: displayName,
                    userId: userId,
                    groupId: groupId,
                    action: evaluation.action,
                    reason: evaluation.reason || 'Failed AutoMod filter',
                    module: 'Gatekeeper',
                    details: { evaluation, ruleName: evaluation.ruleName }
                });

                // WEBHOOK
                discordWebhookService.sendEvent(
                    groupId,
                    '🛡️ AutoMod Gatekeeper',
                    `**User Rejected**: ${displayName} (${userId})\n**Reason**: ${evaluation.reason}`,
                    0xED4245, // Red
                    [
                        { name: 'Request Type', value: 'Join Request', inline: true },
                        { name: 'Rule', value: evaluation.ruleName || 'Unknown', inline: true }
                    ]
                );

                return { processed: true, action: 'reject', reason: evaluation.reason };
            } catch (e) {
                logger.error(`[AutoMod] Failed to reject ${displayName}:`, e);
                return { processed: false, action: 'skip', reason: 'API error on reject' };
            }
        }
    } catch (error) {
        logger.error(`[AutoMod] Error processing join request for ${displayName}:`, error);
        return { processed: false, action: 'skip', reason: 'Processing error' };
    }
};

// Process all pending requests for all authorized groups
export const processAllPendingRequests = async (): Promise<{ 
    totalProcessed: number; 
    accepted: number; 
    rejected: number;
    skipped: number;
}> => {
    const client = getVRChatClient();
    if (!client) {
        logger.warn('[AutoMod] Cannot process pending requests - not authenticated');
        return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
    }

    // Check if any rules are enabled
    const allRules = store.get('rules');
    const rules = allRules.filter(r => r.enabled);
    logger.info(`[AutoMod] Rules check: ${rules.length} enabled out of ${allRules.length} total`);
    
    if (rules.length === 0) {
        logger.info('[AutoMod] No enabled rules, skipping gatekeeper processing. Enable at least one AutoMod filter to auto-process requests.');
        return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
    }
    
    logger.info(`[AutoMod] Enabled rules: ${rules.map(r => r.name || r.type).join(', ')}`);

    const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
    if (authorizedGroups.length === 0) {
        logger.info('[AutoMod] No authorized groups, skipping gatekeeper processing');
        return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
    }

    logger.info(`[AutoMod] Starting gatekeeper processing for ${authorizedGroups.length} authorized groups...`);

    let totalProcessed = 0;
    let accepted = 0;
    let rejected = 0;
    let skipped = 0;

    for (const groupId of authorizedGroups) {
        try {
            // Fetch pending requests for this group
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (client as any).getGroupRequests({
                path: { groupId },
                query: { n: 100, offset: 0 }
            });

            interface JoinRequest {
                userId?: string;
                user?: {
                    id?: string;
                    displayName?: string;
                    bio?: string;
                    status?: string;
                    statusDescription?: string;
                    pronouns?: string;
                    tags?: string[];
                    ageVerificationStatus?: string;
                };
            }

            const requests: JoinRequest[] = Array.isArray(response.data) ? response.data : [];
            
            if (requests.length === 0) {
                logger.debug(`[AutoMod] No pending requests for group ${groupId}`);
                continue;
            }

            logger.info(`[AutoMod] Processing ${requests.length} pending requests for group ${groupId}`);

            for (const req of requests) {
                const userId = req.userId || req.user?.id;
                const displayName = req.user?.displayName || 'Unknown';

                if (!userId) {
                    logger.warn('[AutoMod] Request missing userId, skipping');
                    skipped++;
                    continue;
                }

                const result = await processJoinRequest(groupId, userId, displayName, req.user);
                
                if (result.processed) {
                    totalProcessed++;
                    if (result.action === 'accept') accepted++;
                    else if (result.action === 'reject') rejected++;
                } else {
                    skipped++;
                }

                // Small delay between requests to avoid rate limiting
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (e) {
            logger.error(`[AutoMod] Error fetching requests for group ${groupId}:`, e);
        }
    }

    logger.info(`[AutoMod] Gatekeeper processing complete: ${totalProcessed} processed (${accepted} accepted, ${rejected} rejected, ${skipped} skipped)`);
    return { totalProcessed, accepted, rejected, skipped };
};

// Process a group join notification from WebSocket
export const processGroupJoinNotification = async (notification: {
    type?: string;
    senderUserId?: string;
    senderUsername?: string;
    details?: {
        groupId?: string;
        groupName?: string;
    };
}): Promise<void> => {
    // Check if this is a group join request notification
    if (notification.type !== 'groupannouncement' && notification.type !== 'group.queueReady') {
        return;
    }

    const groupId = notification.details?.groupId;
    const userId = notification.senderUserId;
    const displayName = notification.senderUsername || 'Unknown';

    if (!groupId || !userId) {
        logger.debug('[AutoMod] Notification missing groupId or userId, skipping');
        return;
    }

    // Check if this group is authorized
    if (!groupAuthorizationService.isGroupAllowed(groupId)) {
        logger.debug(`[AutoMod] Notification for unauthorized group ${groupId}, skipping`);
        return;
    }

    logger.info(`[AutoMod] Processing real-time join notification: ${displayName} for group ${groupId}`);
    await processJoinRequest(groupId, userId, displayName);
};

// ... (rest of the file until setupAutoModHandlers)

export const setupAutoModHandlers = () => {
    logger.info('Initializing AutoMod handlers...');

    // Handlers
    ipcMain.handle('automod:get-rules', () => {
        return store.get('rules');
    });

    ipcMain.handle('automod:get-live-autoban', () => {
        return store.get('liveAutoBan');
    });

    ipcMain.handle('automod:set-live-autoban', (_e, enabled: boolean) => {
        store.set('liveAutoBan', enabled);
        return enabled;
    });

    ipcMain.handle('automod:save-rule', (_e, rule: AutoModRule) => {
        const rules = store.get('rules');
        if (rule.id) {
            const index = rules.findIndex(r => r.id === rule.id);
            if (index !== -1) {
                rules[index] = { ...rules[index], ...rule };
            } else {
                rules.push(rule);
            }
        } else {
            rule.id = Date.now();
            rule.createdAt = new Date().toISOString();
            rules.push(rule);
        }
        store.set('rules', rules);
        return rule;
    });

    ipcMain.handle('automod:delete-rule', (_e, ruleId: number) => {
        const rules = store.get('rules');
        const newRules = rules.filter(r => r.id !== ruleId);
        store.set('rules', newRules);
        return true;
    });

    // History Handlers
    ipcMain.handle('automod:get-history', async () => {
        try {
            return await databaseService.getAutoModLogs();
        } catch (error) {
            logger.error('Failed to get AutoMod history', error);
            return [];
        }
    });

    ipcMain.handle('automod:clear-history', async () => {
        try {
            await databaseService.clearAutoModLogs();
            // Also clear file if exists?
            const dbPath = path.join(app.getPath('userData'), 'automod_history.jsonl');
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
            }
            // Also clear the processed cache
            processedRequests.clear();
            return true;
        } catch (error) {
            logger.error('Failed to clear AutoMod history', error);
            return false;
        }
    });

    // Check User against AutoMod rules (used by LiveView for mass invites)
    ipcMain.handle('automod:check-user', async (_e, user) => {
        return evaluateUser(user);
    });

    ipcMain.handle('automod:test-notification', () => {
        windowService.broadcast('automod:violation', {
            displayName: 'Test User',
            userId: 'usr_test',
            action: 'REJECT',
            reason: 'Test Rule Violation'
        });
        return true;
    });

    // Helper to extract Group ID from current location
    const getCurrentGroupId = (): string | null => {
        // We can get this from LogWatcher or InstanceLogger
        // LogWatcher state is private but we can access via formatted getters if we had them.
        // But we DO have logWatcherService.state which is private.
        // However, LogWatcher emits 'location' event.
        // Better: instanceLoggerService tracks this too?
        // Let's use the messy way or check if LogWatcherService exports a getter for location.
        // It does not export location getter, but we can rely on what we have.
        // Actually, let's assume valid group instance if we can find 'group(grp_...)' in instanceId
        const instanceId = instanceLoggerService.getCurrentInstanceId();
        if (!instanceId) return null;
        
        const match = instanceId.match(/group\((grp_[a-zA-Z0-9-]+)\)/);
        return match ? match[1] : null;
    };

    const executeAction = async (player: { userId: string; displayName: string }, rule: AutoModRule, groupId: string, notifyOnly: boolean = false) => {
        // SECURITY: Validate that we have permission to moderate this group
        if (!groupAuthorizationService.isGroupAllowed(groupId)) {
            logger.warn(`[AutoMod] [SECURITY BLOCK] Attempted action on unauthorized group: ${groupId}. Skipping.`);
            return;
        }
        
        const client = getVRChatClient();
        if (!client) return;

        logger.info(`[AutoMod] Executing ${rule.actionType} on ${player.displayName} (${player.userId}) for rule ${rule.name}`);

        // Persist the violation
        await persistAction({
            timestamp: new Date(),
            user: player.displayName,
            userId: player.userId,
            groupId: groupId,
            action: rule.actionType,
            reason: `Violated Rule: ${rule.name}`,
            module: 'AutoMod',
            details: { ruleId: rule.id, config: rule.config }
        });

        // NOTIFY RENDERER (TOAST)
        // NOTIFY RENDERER (TOAST)
        // NOTIFY RENDERER (TOAST)
        windowService.broadcast('automod:violation', {
            displayName: player.displayName,
            userId: player.userId,
            action: rule.actionType,
            reason: rule.name,
            skipped: notifyOnly // Tell frontend if action was skipped
        });

        // WEBHOOK
        const isActionable = rule.actionType === 'REJECT' || rule.actionType === 'AUTO_BLOCK';
        const actionColor = isActionable ? 0xED4245 : 0xFEE75C;
        
        let title = `🛡️ AutoMod Violation: ${rule.actionType}`;
        let actionValue = rule.actionType;
        
        if (notifyOnly && isActionable) {
            title = `🛡️ AutoMod Alert: ${rule.actionType} (Action Skipped)`;
            actionValue = `${rule.actionType} (Prevented by Auto-Ban OFF)`;
        }

        discordWebhookService.sendEvent(
            groupId,
            title,
            `**User**: ${player.displayName} (${player.userId})\n**Reason**: ${rule.name}`,
            actionColor,
            [
                { name: 'Action Taken', value: actionValue, inline: true },
                { name: 'Location', value: getCurrentGroupId() === groupId ? 'Current Group Instance' : 'Remote Request', inline: true }
            ]
        );

        if (!notifyOnly && (rule.actionType === 'REJECT' || rule.actionType === 'AUTO_BLOCK')) {
            try {
                // Ban from Group (Kick)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (client as any).banGroupMember({
                    path: { groupId },
                    body: { userId: player.userId }
                });
                logger.info(`[AutoMod] Banned ${player.displayName} from group ${groupId}`);
            } catch (error) {
                logger.error(`[AutoMod] Failed to ban ${player.displayName}`, error);
            }
        }
        // NOTIFY_ONLY is handled by just logging (and potentially frontend events via log database)
    };

    const checkPlayer = async (player: { userId: string; displayName: string }, groupId: string) => {
        // Prevent duplicate checks
        const key = `${groupId}:${player.userId}`;
        if (processedRequests.has(key)) return;

        const rules = store.get('rules').filter(r => r.enabled) as AutoModRule[];
        if (rules.length === 0) return;

        // Fetch detailed user info for accurate checking (Trust, Age, Bio, etc.)
        let fullUser: {
            userId: string;
            displayName: string;
            tags?: string[];
            bio?: string;
            status?: string;
            statusDescription?: string;
            pronouns?: string;
            ageVerificationStatus?: string;
        } = { 
            userId: player.userId,
            displayName: player.displayName
        };

        try {
             // fetchUser is robust and cached
             const userDetails = await fetchUser(player.userId);
             if (userDetails) {
                 fullUser = { ...fullUser, ...userDetails };
             }
        } catch (e) {
            logger.warn(`[AutoMod] Failed to fetch user details for ${player.displayName}`, e);
        }

        // Evaluate using central logic
        const evaluation = await evaluateUser({
            id: player.userId,
            displayName: player.displayName,
            tags: fullUser.tags,
            bio: fullUser.bio,
            status: fullUser.status,
            statusDescription: fullUser.statusDescription,
            pronouns: fullUser.pronouns,
            ageVerificationStatus: fullUser.ageVerificationStatus
        });

        if (evaluation.action !== 'ALLOW') {
            logger.info(`[AutoMod] Detected violation for ${player.displayName}: ${evaluation.reason}`);
            
            // Execute Action
            // Construct a synthetic rule object to pass to executeAction
            const syntheticRule: AutoModRule = {
                id: Date.now(),
                name: evaluation.reason || evaluation.ruleName || 'AutoMod Violation',
                enabled: true,
                type: 'AUTO_DETECTED',
                config: '',
                actionType: evaluation.action as AutoModActionType,
                createdAt: new Date().toISOString()
            };

            // Notify only depending on setting
            // Default liveAutoBan is false.
            const liveAutoBanSetting = store.get('liveAutoBan');
            const notifyOnly = liveAutoBanSetting !== true; // Only valid if explicitly true
            
            logger.info(`[AutoMod] Action Triggered. LiveAutoBan: ${liveAutoBanSetting}, NotifyOnly: ${notifyOnly}`);

            await executeAction(player, syntheticRule, groupId, notifyOnly);
        }
        
        // Mark as checked
        processedRequests.add(key);
        pruneProcessedCache();
    };

    const runAutoModCycle = async () => {
        try {
            const client = getVRChatClient();
            if (!client) return;

            pruneProcessedCache();

            const groupId = getCurrentGroupId();
            if (!groupId) {
                // Not in a group instance, nothing to guard
                return;
            }

            // SECURITY: Validate that we have permission to moderate this group
            if (!groupAuthorizationService.isGroupAllowed(groupId)) {
                logger.debug(`[AutoMod] Skipping unauthorized group: ${groupId}`);
                return;
            }

            const players = logWatcherService.getPlayers();
            
            for (const p of players) {
                if (!p.userId) continue;
                await checkPlayer({ userId: p.userId, displayName: p.displayName }, groupId);
            }

        } catch (error) {
            logger.error('AutoMod Loop Error:', error);
        }
    };

    // Listen for realtime joins
    logWatcherService.on('player-joined', async (event: { displayName: string; userId?: string }) => {
        if (!event.userId) return;
        const groupId = getCurrentGroupId();
        if (!groupId) return;
        
        // SECURITY: Validate that we have permission to moderate this group
        if (!groupAuthorizationService.isGroupAllowed(groupId)) {
            return; // Silently skip - not our group
        }
        
        await checkPlayer({ userId: event.userId, displayName: event.displayName }, groupId);
    });

    // Start Loop (Backup)
    if (!autoModInterval) {
        // Run once immediately (delayed slightly to allow auth) then interval
        setTimeout(runAutoModCycle, 5000);
        autoModInterval = setInterval(runAutoModCycle, CHECK_INTERVAL);
    }
};
