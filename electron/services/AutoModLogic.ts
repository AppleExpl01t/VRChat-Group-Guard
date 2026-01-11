

import { AutoModActionType, AutoModRule, store } from './AutoModService';
import log from 'electron-log';

const logger = log.scope('AutoModService');

    export const evaluateUser = async (user: {
        id: string;
        displayName: string;
        tags?: string[];
        bio?: string;
        status?: string;
        statusDescription?: string;
        pronouns?: string;
        ageVerified?: boolean;
        ageVerificationStatus?: string;
    }, options: { allowMissingData?: boolean } = {}): Promise<{ action: AutoModActionType | 'ALLOW'; reason?: string; ruleName?: string }> => {
        // logger.info(`[AutoMod] evaluateUser called for: ${user.displayName} (${user.id})`);
        
        try {
            const rules = store.get('rules').filter(r => r.enabled) as AutoModRule[];
            
            if (rules.length === 0) {
                return { action: 'ALLOW' };
            }

            for (const rule of rules) {
                let matches = false;
                let reason = '';

                if (rule.type === 'KEYWORD_BLOCK') {
                    // ... (existing logic) ...
                    // Parse config
                    let keywords: string[] = [];
                    let whitelist: string[] = [];
                    let scanBio = true;
                    let scanStatus = true;
                    let scanPronouns = false;
                    
                    try {
                        const parsed = JSON.parse(rule.config);
                        if (parsed && typeof parsed === 'object') {
                            keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
                            whitelist = Array.isArray(parsed.whitelist) ? parsed.whitelist : [];
                            scanBio = parsed.scanBio !== false;
                            scanStatus = parsed.scanStatus !== false;
                            scanPronouns = parsed.scanPronouns === true;
                        } else if (Array.isArray(parsed)) {
                            keywords = parsed;
                        } else if (typeof parsed === 'string') {
                            keywords = [parsed];
                        }
                    } catch {
                        keywords = rule.config ? [rule.config] : [];
                    }
                    
                    const textParts: string[] = [user.displayName];
                    if (scanBio && user.bio) textParts.push(user.bio);
                    if (scanStatus) {
                        if (user.status) textParts.push(user.status);
                        if (user.statusDescription) textParts.push(user.statusDescription);
                    }
                    if (scanPronouns && user.pronouns) textParts.push(user.pronouns);
                    
                    const searchableText = textParts.join(' ').toLowerCase();

                    for (const keyword of keywords) {
                        const kw = keyword.toLowerCase().trim();
                        if (!kw) continue;
                        
                        if (searchableText.includes(kw)) {
                            const isWhitelisted = whitelist.some(w => 
                                searchableText.includes(w.toLowerCase().trim())
                            );
                            
                            if (!isWhitelisted) {
                                matches = true;
                                reason = `Keyword: "${keyword}"`;
                                break;
                            }
                        }
                    }
                } else if (rule.type === 'AGE_VERIFICATION') {
                    // Debug Logging for Age Verification
                    if (user.ageVerificationStatus === undefined) {
                        logger.warn(`[AutoMod] User ${user.displayName} (${user.id}) has NO ageVerificationStatus. Defaulting to ALLOW (Safe Fail).`);
                        // Use option to strictly block unknowns if needed? For now, SAFE FAIL.
                    } else {
                         // logger.debug(`[AutoMod] Checking Age for ${user.displayName}: ${user.ageVerificationStatus}`);
                    }

                    // If allowMissingData is true and we don't have status, SKIP this check (SAFE FAIL)
                    if (user.ageVerificationStatus === undefined) {
                         // Fallback check? 
                         // Check tags for 'system_age_verified'? (VRChat might verify 18+ via tags too?)
                         // For now, if undefined, we can't enforce "18+".
                         // Rule of thumb: If strict mode, BLOCK. If lenient, ALLOW.
                         // Given "Group Guard", safety first? But blocking everyone due to API privacy is bad.
                         // User reported "failing preventing me to invite", implying FALSE POSITIVES (blocking good users).
                         // So we must ALLOW if undefined.
                         continue; 
                    } 
                    
                    const normalizedStatus = (user.ageVerificationStatus || '').toLowerCase();
                    // Check against '18+' (exact) or 'hidden' (case-insensitive normalized)
                    if (user.ageVerificationStatus !== '18+' && normalizedStatus !== 'hidden') {
                        matches = true;
                        reason = `Age Verification Required (Found: ${user.ageVerificationStatus})`;
                    }
                } else if (rule.type === 'TRUST_CHECK') {
                    // Trust check logic
                    const tags = user.tags || [];
                    
                    // If allowMissingData is true and no tags, assume safe (or skip)
                    if (options.allowMissingData && (!user.tags || user.tags.length === 0)) {
                         // Skip check if we can't determine rank
                    } else {
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
                            // If user has no trust tags and we aren't allowing missing data, they are -1 (below visitor)
                            if (userTrustIndex < requiredIndex) {
                                matches = true;
                                reason = `Trust Level below ${configLevel}`;
                            }
                        }
                    }
                }

                if (matches) {
                    logger.info(`[AutoMod] User ${user.displayName} matched rule: ${rule.name}`);
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
            return { action: 'ALLOW' };
        }
    };
