export type AutoModActionType = 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY';

export type AutoModRuleType = 
    | 'AGE_CHECK' 
    | 'TRUST_CHECK' 
    | 'KEYWORD_BLOCK' 
    | 'WHITELIST_CHECK' 
    | 'BAN_EVASION_CHECK'
    | 'AGE_VERIFICATION'
    | 'BLACKLISTED_GROUPS'
    | 'INSTANCE_18_GUARD'
    | 'CLOSE_ALL_INSTANCES';

export interface AutoModRuleConfig {
    // For AGE_CHECK
    minDays?: number;

    // For TRUST_CHECK
    allowedRanks?: string[]; // e.g. ['system_trust_known', 'system_trust_veteran']
    blockedRanks?: string[]; // e.g. ['system_trust_visitor']

    // For KEYWORD_BLOCK / WHITELIST_CHECK
    keywords?: string[];

    // For Generic use
    enabled?: boolean;
}

export interface AutoModRule {
    id: number;
    name: string;
    enabled: boolean;
    type: AutoModRuleType;
    config: string; // JSON string of AutoModRuleConfig
    actionType: AutoModActionType;
    createdAt: Date;
    updatedAt: Date;
}

export interface Infraction {
    id: number;
    targetId: string;
    issuerId: string;
    type: string; // 'WARNING', 'NOTE', 'BAN_EVASION'
    reason?: string;
    createdAt: Date;
}

export interface AutoModCheckResult {
    triggered: boolean;
    action?: AutoModActionType;
    reason?: string;
    ruleId?: number;
}
