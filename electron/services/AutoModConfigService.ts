import Store from "electron-store";

// Simplified Types
export type AutoModActionType = "REJECT" | "AUTO_BLOCK" | "NOTIFY_ONLY";
export type AutoModRuleType = "AGE_VERIFICATION" | "INSTANCE_18_GUARD" | "INSTANCE_PERMISSION_GUARD" | string;

export interface AutoModRule {
  id: number;
  name: string;
  enabled: boolean;
  type: AutoModRuleType;
  config: string; // JSON
  actionType: AutoModActionType;
  createdAt?: string;

  // Exemptions
  whitelistedUserIds?: string[];
  whitelistedGroupIds?: string[];
}

export interface GroupConfig {
  rules: AutoModRule[];
  enableAutoProcess: boolean;
  enableAutoBan: boolean;
}

interface AutoModStoreSchema {
  groups: Record<string, GroupConfig>;
  // Legacy global fallback
  rules?: AutoModRule[];
  enableAutoReject?: boolean; // Kept for types if needed, but logic moved
  enableAutoBan?: boolean;
}

// Initialize store
export const store = new Store<AutoModStoreSchema>({
  name: "automod-rules",
  defaults: {
    groups: {},
    rules: [],
    enableAutoReject: false,
    enableAutoBan: false,
  },
  migrations: {
    "2.0.0": () => {
       // Future migration
    },
  },
});

export const autoModConfigService = {
  getGroupConfig: (groupId: string): GroupConfig => {
    const groups = store.get('groups', {});
    if (groups[groupId]) {
       const config = groups[groupId];
       // Migration: If enableAutoProcess is undefined, take enableAutoReject value if present, else false.
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       if ((config as any).enableAutoProcess === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (config as any).enableAutoProcess = (config as any).enableAutoReject ?? false;
       }
       return config;
    }
    return { 
        rules: [], 
        enableAutoProcess: false, // Default OFF as requested
        enableAutoBan: false 
    };
  },

  saveGroupConfig: (groupId: string, config: GroupConfig) => {
    const groups = store.get('groups', {});
    groups[groupId] = config;
    store.set('groups', groups);
  }
};
