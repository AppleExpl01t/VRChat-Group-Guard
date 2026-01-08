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
}

// Initialize store
const store = new Store<AutoModStoreSchema>({
    name: 'automod-rules',
    defaults: {
        rules: []
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

// ... (rest of the file until setupAutoModHandlers)

export const setupAutoModHandlers = () => {
    logger.info('Initializing AutoMod handlers...');

    // Handlers
    ipcMain.handle('automod:get-rules', () => {
        return store.get('rules');
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
    ipcMain.handle('automod:check-user', async (_e, user: {
        id: string;
        displayName: string;
        tags?: string[];
        bio?: string;
        status?: string;
        statusDescription?: string;
        pronouns?: string;
    }) => {
        logger.info(`[AutoMod] check-user called for: ${user.displayName} (${user.id})`);
        
        try {
            const rules = store.get('rules').filter(r => r.enabled) as AutoModRule[];
            
            logger.info(`[AutoMod] Found ${rules.length} enabled rules to check against`);
            
            if (rules.length === 0) {
                logger.info(`[AutoMod] No enabled rules, returning ALLOW`);
                return { action: 'ALLOW' };
            }

            logger.debug(`[AutoMod] Checking user ${user.displayName} against ${rules.length} rules...`);

            for (const rule of rules) {
                let matches = false;
                let reason = '';

                if (rule.type === 'KEYWORD_BLOCK') {
                    // Parse config - stored as JSON object { keywords: [], whitelist: [], matchMode: string, scanBio: bool, scanStatus: bool, scanPronouns: bool }
                    let keywords: string[] = [];
                    let whitelist: string[] = [];
                    let scanBio = true;      // Default to true for safety
                    let scanStatus = true;   // Default to true for safety
                    let scanPronouns = false; // Default to false (matches frontend default)
                    
                    try {
                        const parsed = JSON.parse(rule.config);
                        // Config is an object with keywords array
                        if (parsed && typeof parsed === 'object') {
                            keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
                            whitelist = Array.isArray(parsed.whitelist) ? parsed.whitelist : [];
                            // Read scan* options from config
                            scanBio = parsed.scanBio !== false; // Default true if not explicitly false
                            scanStatus = parsed.scanStatus !== false; // Default true if not explicitly false
                            scanPronouns = parsed.scanPronouns === true; // Default false unless explicitly true
                        } else if (Array.isArray(parsed)) {
                            // Legacy: direct array of keywords
                            keywords = parsed;
                        } else if (typeof parsed === 'string') {
                            // Legacy: single keyword string
                            keywords = [parsed];
                        }
                    } catch {
                        // Single keyword string fallback
                        keywords = rule.config ? [rule.config] : [];
                    }
                    
                    logger.info(`[AutoMod] KEYWORD_BLOCK rule "${rule.name}": ${keywords.length} keywords, scanBio=${scanBio}, scanStatus=${scanStatus}, scanPronouns=${scanPronouns}`);

                    // Build searchable text based on config options
                    const textParts: string[] = [user.displayName]; // Always check displayName
                    if (scanBio && user.bio) textParts.push(user.bio);
                    if (scanStatus) {
                        if (user.status) textParts.push(user.status);
                        if (user.statusDescription) textParts.push(user.statusDescription);
                    }
                    if (scanPronouns && user.pronouns) textParts.push(user.pronouns);
                    
                    const searchableText = textParts.join(' ').toLowerCase();
                    logger.debug(`[AutoMod] Searchable text for ${user.displayName}: "${searchableText.substring(0, 100)}..."`);

                    for (const keyword of keywords) {
                        const kw = keyword.toLowerCase().trim();
                        if (!kw) continue;
                        
                        // Check if keyword is in searchable text
                        if (searchableText.includes(kw)) {
                            // Check if there's a whitelist match that overrides
                            const isWhitelisted = whitelist.some(w => 
                                searchableText.includes(w.toLowerCase().trim())
                            );
                            
                            if (!isWhitelisted) {
                                matches = true;
                                reason = `Keyword: "${keyword}"`;
                                break;
                            } else {
                                logger.debug(`[AutoMod] Keyword "${keyword}" matched but whitelisted`);
                            }
                        }
                    }
                } else if (rule.type === 'TRUST_CHECK') {
                    // Check trust level via tags
                    const tags = user.tags || [];
                    let configLevel = '';
                    try {
                        const parsed = JSON.parse(rule.config);
                        configLevel = parsed.minTrustLevel || parsed.trustLevel || rule.config;
                    } catch {
                        configLevel = rule.config;
                    }
                    
                    const trustLevels = ['system_trust_visitor', 'system_trust_basic', 'system_trust_known', 'system_trust_trusted', 'system_trust_veteran', 'system_trust_legend'];
                    const requiredIndex = trustLevels.findIndex(t => t.includes(configLevel.toLowerCase()));
                    
                    if (requiredIndex > 0) {
                        const userTrustIndex = trustLevels.findIndex(level => tags.includes(level));
                        if (userTrustIndex < requiredIndex) {
                            matches = true;
                            reason = `Trust Level below ${configLevel}`;
                        }
                    }
                }
                // Add other rule types as needed (AGE_CHECK, etc.)

                if (matches) {
                    logger.info(`[AutoMod] User ${user.displayName} matched rule: ${rule.name} (${rule.type})`);
                    return { 
                        action: rule.actionType, 
                        reason,
                        ruleName: rule.name
                    };
                }
            }

            return { action: 'ALLOW' };
            
        } catch (error) {
            logger.error('[AutoMod] Error checking user:', error);
            return { action: 'ALLOW' }; // Fail-open to not block on errors
        }
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

    const executeAction = async (player: { userId: string; displayName: string }, rule: AutoModRule, groupId: string) => {
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

        if (rule.actionType === 'REJECT' || rule.actionType === 'AUTO_BLOCK') {
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

        logger.info(`[AutoMod] Checking ${player.displayName} against ${rules.length} rules...`);

        // Fetch detailed user info if needed for rules (Trust Rank, etc)
        // For simple name checks we don't need API
        let fullUser = null;
        
        for (const rule of rules) {
            let matches = false;

            if (rule.type === 'KEYWORD_BLOCK') {
                if (rule.config && player.displayName.toLowerCase().includes(rule.config.toLowerCase())) {
                    matches = true;
                }
            } else if (rule.type === 'AGE_CHECK' || rule.type === 'TRUST_CHECK') {
                // We need full user profile
                if (!fullUser) {
                    try {
                         const client = getVRChatClient();
                         if (client) {
                             // eslint-disable-next-line @typescript-eslint/no-explicit-any
                             const res = await (client as any).getUser({ path: { userId: player.userId } });
                             fullUser = res.data;
                         }
                    } catch (e) {
                        logger.warn(`[AutoMod] Failed to fetch user details for ${player.displayName}`, e);
                    }
                }

                if (fullUser) {
                     if (rule.type === 'TRUST_CHECK') {
                         // config might be "known", "trusted" etc.
                         // Implementation depends on tags
                         // const tags = fullUser.tags || [];
                         // Simple logic: if config is 'user' and they are 'visitor', block?
                         // For now, placeholder or simple check
                         logger.debug('[AutoMod] Trust Check logic pending refinement');
                     }
                }
            }

            if (matches) {
                await executeAction(player, rule, groupId);
                processedRequests.add(key);
                break; // Stop after first violation
            }
        }
        
        // Mark as checked to prevent loop spam (API rate limits)
        processedRequests.add(key);
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
