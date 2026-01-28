/**
 * Application Constants
 * Centralized configuration for the VRChat Group Guard application
 */

// Import version from package.json
import packageJson from '../../package.json';

// Application Metadata
export const APP_NAME = 'VRChat Group Guard';
export const APP_VERSION = packageJson.version;
export const APP_AUTHOR = 'VRChat Group Guard Team';

// API Configuration
export const VRCHAT_API_BASE = 'https://api.vrchat.cloud/api/1';

// Feature Flags (for gradual rollout)
export const FEATURES = {
  AUTO_MOD: true,
  AUDIT_LOGS: true,
  DATABASE_VIEWER: false, // Coming soon
  INSTANCE_MANAGEMENT: false, // Coming soon
} as const;

// UI Constants
export const ANIMATION_DURATION = {
  FAST: 0.2,
  NORMAL: 0.3,
  SLOW: 0.5,
} as const;

// Refresh Intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  AUDIT_LOGS: 30000, // 30 seconds
  GROUP_DATA: 60000, // 1 minute
  SESSION_CHECK: 300000, // 5 minutes
} as const;

// Pagination Defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
} as const;

// Trust Rank Colors (for user badges)
export const TRUST_RANK_COLORS = {
  visitor: '#cccccc',
  new_user: '#1778ff',
  user: '#2bcf5c',
  known_user: '#ff7b42',
  trusted_user: '#8143e6',
  veteran_user: '#ffe716',
} as const;

// Trust Rank Labels
export const TRUST_RANK_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  new_user: 'New User',
  user: 'User',
  known_user: 'Known User',
  trusted_user: 'Trusted User',
  veteran_user: 'Veteran',
  system_trust_basic: 'User',
  system_trust_known: 'Known User',
  system_trust_trusted: 'Trusted User',
  system_trust_veteran: 'Veteran',
  system_trust_legend: 'Legendary',
};

/**
 * Get trust rank from user tags
 */
export function getTrustRankFromTags(tags: string[] = []): { label: string; color: string } {
  // Priority order for trust rank detection
  const rankPriority = [
    { tag: 'system_trust_legend', label: 'Legendary', color: '#ffe716' },
    { tag: 'system_trust_veteran', label: 'Veteran', color: '#8143e6' },
    { tag: 'system_trust_trusted', label: 'Trusted', color: '#ff7b42' },
    { tag: 'system_trust_known', label: 'Known', color: '#2bcf5c' },
    { tag: 'system_trust_basic', label: 'New User', color: '#1778ff' },
  ];

  for (const rank of rankPriority) {
    if (tags.includes(rank.tag)) {
      return { label: rank.label, color: rank.color };
    }
  }

  return { label: 'Visitor', color: '#cccccc' };
}
