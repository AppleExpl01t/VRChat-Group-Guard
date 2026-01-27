import log from "electron-log";
import { LRUCache } from "lru-cache";
import { userProfileService } from "./UserProfileService";
import { AutoModRule, autoModConfigService } from "./AutoModConfigService";

const logger = log.scope("AutoModRuleService");

export type AutoModActionType = "REJECT" | "AUTO_BLOCK" | "NOTIFY_ONLY" | "ALLOW";

export interface ScanResult {
    userId: string;
    displayName: string;
    userIcon?: string;
    action: "BANNED" | "VIOLATION" | "SAFE";
    reason?: string;
    ruleName?: string;
    ruleId?: number;
}

interface ParsedRule {
    keywords: string[];
    whitelist: string[];
    whitelistedUserIds: string[];
    whitelistedGroupIds: string[];
    scanBio: boolean;
    scanStatus: boolean;
    scanPronouns: boolean;
    scanGroups: boolean;
    matchMode: "PARTIAL" | "WHOLE_WORD";
    regexes: RegExp[]; // Pre-compiled regexes for WHOLE_WORD mode
    compiledWhitelist: RegExp[]; // Pre-compiled whitelist (if needed, or just strings)
}

// Cache for parsed rules to avoid re-parsing JSON and re-compiling Regex on every user evaluation
const ruleCache = new LRUCache<string, ParsedRule>({
    max: 100,
    ttl: 1000 * 60 * 5 // 5 minutes
});

export const autoModRuleService = {
    evaluateUser: async (
        user: {
            id: string;
            displayName: string;
            tags?: string[];
            bio?: string;
            status?: string;
            statusDescription?: string;
            pronouns?: string;
            ageVerified?: boolean;
            ageVerificationStatus?: string;
        },
        options: { allowMissingData?: boolean } = {},
        groupId: string
    ): Promise<{
        action: AutoModActionType;
        reason?: string;
        ruleName?: string;
        ruleId?: number;
    }> => {
        try {
            const config = autoModConfigService.getGroupConfig(groupId);
            const rules = config.rules.filter((r) => r.enabled);

            if (rules.length === 0) {
                return { action: "ALLOW" };
            }

            // Helper to escape regex special characters
            const escapeRegExp = (string: string) => {
                return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            };

            const getParsedRule = (rule: AutoModRule): ParsedRule => {
                const cacheKey = `${rule.id}-${rule.config}`; // Simple cache key
                if (ruleCache.has(cacheKey)) return ruleCache.get(cacheKey)!;

                let keywords: string[] = [];
                let whitelist: string[] = [];
                let whitelistedUserIds: string[] = [];
                let whitelistedGroupIds: string[] = [];
                let scanBio = true;
                let scanStatus = true;
                let scanPronouns = false;
                let scanGroups = false;
                let matchMode: "PARTIAL" | "WHOLE_WORD" = "PARTIAL";

                try {
                    const parsed = JSON.parse(rule.config);
                    if (parsed && typeof parsed === "object") {
                        keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
                        whitelist = Array.isArray(parsed.whitelist) ? parsed.whitelist : [];
                        whitelistedUserIds = Array.isArray(parsed.whitelistedUserIds) ? parsed.whitelistedUserIds : [];
                        whitelistedGroupIds = Array.isArray(parsed.whitelistedGroupIds) ? parsed.whitelistedGroupIds : [];
                        scanBio = parsed.scanBio !== false;
                        scanStatus = parsed.scanStatus !== false;
                        scanPronouns = parsed.scanPronouns === true;
                        scanGroups = parsed.scanGroups === true;
                        if (parsed.matchMode === "WHOLE_WORD") matchMode = "WHOLE_WORD";
                    } else if (Array.isArray(parsed)) {
                        keywords = parsed;
                    } else if (typeof parsed === "string") {
                        keywords = [parsed];
                    }
                } catch {
                    keywords = rule.config ? [rule.config] : [];
                }

                // Pre-compile Regexes for WHOLE_WORD mode
                const regexes: RegExp[] = [];
                if (matchMode === "WHOLE_WORD") {
                    for (const kw of keywords) {
                        if (!kw.trim()) continue;
                        try {
                            regexes.push(new RegExp(`\\b${escapeRegExp(kw.trim())}\\b`, "i"));
                        } catch {
                            // Ignore invalid regex
                            regexes.push(new RegExp(escapeRegExp(kw.trim()), "i")); // Fallback
                        }
                    }
                }

                const parsedRule: ParsedRule = {
                    keywords,
                    whitelist,
                    whitelistedUserIds,
                    whitelistedGroupIds,
                    scanBio,
                    scanStatus,
                    scanPronouns,
                    scanGroups,
                    matchMode,
                    regexes,
                    compiledWhitelist: []
                };

                ruleCache.set(cacheKey, parsedRule);
                return parsedRule;
            };

            for (const rule of rules) {
                if (!rule.id) logger.warn(`[AutoMod] Rule has no ID: ${rule.name}`); // DEBUG
                let matches = false;
                let reason = "";

                if (rule.type === "KEYWORD_BLOCK") {
                    const {
                        keywords, whitelist, whitelistedUserIds, whitelistedGroupIds,
                        scanBio, scanStatus, scanPronouns, scanGroups, matchMode, regexes
                    } = getParsedRule(rule);

                    // 1. CHECK USER WHITELIST (Exemptions)
                    if (whitelistedUserIds.some(id => id === user.id)) {
                        continue;
                    }

                    // 2. CHECK GROUP WHITELIST (Exemptions)
                    let userGroups = null;
                    if (whitelistedGroupIds.length > 0 || scanGroups) {
                        try {
                            userGroups = await userProfileService.getUserGroups(user.id);
                        } catch (e) {
                            logger.warn(`[AutoMod] Failed to fetch groups for ${user.displayName} during scan: ${e}`);
                        }
                    }

                    if (whitelistedGroupIds.length > 0 && userGroups) {
                        const isGroupWhitelisted = userGroups.some(g => whitelistedGroupIds.includes(g.groupId));
                        if (isGroupWhitelisted) continue;
                    }

                    // Helper to check text
                    const checkText = (text: string | undefined, contextName: string): boolean => {
                        if (!text) return false;
                        const lower = text.toLowerCase();

                        for (let i = 0; i < keywords.length; i++) {
                            const kw = keywords[i];
                            const safeKw = kw.trim();
                            if (!safeKw) continue;

                            let hasMatch = false;

                            if (matchMode === "WHOLE_WORD") {
                                // Use pre-compiled regex
                                if (regexes[i]) {
                                    hasMatch = regexes[i].test(text);
                                } else {
                                    // Should be cached, but safe fallback
                                    hasMatch = lower.includes(safeKw.toLowerCase());
                                }
                            } else {
                                // Loose Mode
                                hasMatch = lower.includes(safeKw.toLowerCase());
                            }

                            if (hasMatch) {
                                const isWhitelisted = whitelist.some(w => lower.includes(w.toLowerCase().trim()));
                                if (!isWhitelisted) {
                                    matches = true;
                                    reason = `Keyword "${safeKw}" found in ${contextName}`;
                                    return true;
                                }
                            }
                        }
                        return false;
                    };

                    // 3. Scan Text Fields
                    if (checkText(user.displayName, "Display Name")) { /* match found */ }
                    else if (scanBio && checkText(user.bio, "Bio")) { /* match found */ }
                    else if (scanStatus && (checkText(user.status, "Status") || checkText(user.statusDescription, "Status Description"))) { /* match found */ }
                    else if (scanPronouns && checkText(user.pronouns, "Pronouns")) { /* match found */ }
                    else if (scanGroups && !matches && userGroups) {
                        for (const g of userGroups) {
                            if (checkText(g.name, `Group: "${g.name}"`)) break;
                            if (checkText(g.shortCode, `Group Shortcode: "${g.shortCode}"`)) break;
                        }
                    }

                    // Logic for Age Verification check
                    if (user.ageVerificationStatus !== undefined) {
                        const normalizedStatus = (user.ageVerificationStatus || "").toLowerCase();
                        if (user.ageVerificationStatus !== "18+" && normalizedStatus !== "hidden") {
                            matches = true;
                            reason = `Age Verification Required (Found: ${user.ageVerificationStatus})`;
                        }
                    }

                } else if (rule.type === "TRUST_CHECK") {
                    const tags = user.tags || [];
                    if (options.allowMissingData && (!user.tags || user.tags.length === 0)) {
                        // Skip
                    } else {
                        let configLevel = "";
                        try {
                            const parsed = JSON.parse(rule.config);
                            configLevel = parsed.minTrustLevel || parsed.trustLevel || rule.config;
                        } catch {
                            configLevel = rule.config;
                        }

                        const trustLevels = [
                            "system_trust_visitor", "system_trust_basic", "system_trust_known",
                            "system_trust_trusted", "system_trust_veteran", "system_trust_legend",
                        ];
                        const requiredIndex = trustLevels.findIndex((t) => t.includes(configLevel.toLowerCase()));

                        if (requiredIndex > 0) {
                            const userTrustIndex = trustLevels.findIndex((level) => tags.includes(level));
                            if (userTrustIndex < requiredIndex) {
                                matches = true;
                                reason = `Trust Level below ${configLevel}`;
                            }
                        }
                    }
                } else if (rule.type === "BLACKLISTED_GROUPS") {
                    let config = { groupIds: [] as string[] };
                    try { config = JSON.parse(rule.config); } catch { /* Ignore parse error */ }
                    const blacklistedIds = config.groupIds || [];

                    if (blacklistedIds.length > 0) {
                        try {
                            const userGroups = await userProfileService.getUserGroups(user.id);
                            for (const group of userGroups) {
                                if (blacklistedIds.includes(group.groupId)) {
                                    matches = true;
                                    reason = `Member of blacklisted group: ${group.name}`;
                                    break;
                                }
                            }
                        } catch (e) {
                            logger.warn(`[AutoMod] Failed to fetch groups: ${e}`);
                        }
                    }
                }

                if (matches) {
                    logger.info(`[AutoMod] User ${user.displayName} matched rule: ${rule.name}`);
                    return {
                        action: rule.actionType,
                        reason,
                        ruleName: rule.name,
                        ruleId: rule.id
                    };
                }
            }

            return { action: "ALLOW" };
        } catch (error) {
            logger.error("[AutoMod] Error checking user:", error);
            return { action: "ALLOW" };
        }
    },

    addToWhitelist: async (groupId: string, ruleId: number, target: { userId?: string; groupId?: string }) => {
        logger.info(`Adding to whitelist for rule ${ruleId} in group ${groupId}:`, target);

        // Find the rule
        const config = autoModConfigService.getGroupConfig(groupId);
        const rules = config.rules;
        const ruleIndex = rules.findIndex(r => r.id === ruleId);

        if (ruleIndex === -1) {
            throw new Error(`Rule with ID ${ruleId} not found`);
        }

        const rule = rules[ruleIndex];
        let updated = false;

        if (target.userId) {
            if (!rule.whitelistedUserIds) rule.whitelistedUserIds = [];
            if (!rule.whitelistedUserIds.includes(target.userId)) {
                rule.whitelistedUserIds.push(target.userId);
                updated = true;
            }
        }

        if (target.groupId) {
            if (!rule.whitelistedGroupIds) rule.whitelistedGroupIds = [];
            if (!rule.whitelistedGroupIds.includes(target.groupId)) {
                rule.whitelistedGroupIds.push(target.groupId);
                updated = true;
            }
        }

        if (updated) {
            rules[ruleIndex] = rule;
            autoModConfigService.saveGroupConfig(groupId, { ...config, rules });
            logger.info(`Whitelist updated for rule ${rule.name}`);
            return true;
        }

        return false;
    }
};
