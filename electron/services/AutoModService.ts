import Store from "electron-store";
import { ipcMain, app } from "electron";
import fs from "fs";
import path from "path";
import log from "electron-log";
import { getVRChatClient } from "./AuthService";
import { vrchatApiService } from "./VRChatApiService";
import { databaseService } from "./DatabaseService";
import { instanceLoggerService } from "./InstanceLoggerService";
import { logWatcherService } from "./LogWatcherService";
import { groupAuthorizationService } from "./GroupAuthorizationService";
import { fetchUser } from "./UserService";
import { windowService } from "./WindowService";
import { discordWebhookService } from "./DiscordWebhookService";
import { watchlistService } from "./WatchlistService";
import { serviceEventBus } from "./ServiceEventBus";
import { userProfileService } from "./UserProfileService";

const logger = log.scope("AutoModService");

// Helper to persist actions (used by both scan and live checks)
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
    // 1. Log to database
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


    // 2. Broadcast to UI (if not skipped)
    if (!entry.skipBroadcast) {
        windowService.broadcast("automod:violation", {
        userId: entry.userId,
        displayName: entry.user,
        action: entry.action,
        reason: entry.reason,
        ruleName: (entry.details?.ruleName as string),
        timestamp: entry.timestamp.toISOString()
    });
    }

  } catch (error) {
    logger.error("[AutoMod] Failed to persist action:", error);
  }
};

const addToWhitelist = async (groupId: string, ruleId: number, target: { userId?: string; groupId?: string }) => {
    logger.info(`Adding to whitelist for rule ${ruleId} in group ${groupId}:`, target);
    
    // Find the rule
    const config = getGroupConfig(groupId);
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
        saveGroupConfig(groupId, { ...config, rules });
        logger.info(`Whitelist updated for rule ${rule.name}`);
        return true;
    }
    
    return false;
};

// Simplified Types
export type AutoModActionType = "REJECT" | "AUTO_BLOCK" | "NOTIFY_ONLY";
export type AutoModRuleType = "AGE_VERIFICATION" | string;

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

interface GroupConfig {
  rules: AutoModRule[];
  enableAutoReject: boolean;
  enableAutoBan: boolean;
}

interface AutoModStoreSchema {
  groups: Record<string, GroupConfig>;
  // Legacy global fallback (kept for backup/reference)
  rules?: AutoModRule[];
  enableAutoReject?: boolean;
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
      // Future migration: could move global rules to a "default" group or similar
    },
  },
});

// Helper to get group config safely
const getGroupConfig = (groupId: string): GroupConfig => {
    const groups = store.get('groups', {});
    if (!groups[groupId]) {
        // Initialize if missing
        groups[groupId] = {
            rules: [],
            enableAutoReject: false,
            enableAutoBan: false
        };
        store.set('groups', groups);
    }
    return groups[groupId];
};

const saveGroupConfig = (groupId: string, config: GroupConfig) => {
    const groups = store.get('groups', {});
    groups[groupId] = config;
    store.set('groups', groups);
};

// The core AutoMod logic
let autoModInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL = 60 * 1000; // Check every minute

// Track processed requests to prevent duplicates within a session
const processedRequests = new Set<string>();
const PROCESSED_CACHE_MAX_SIZE = 1000;

// Instance Guard event history (in-memory, persists for session)
interface InstanceGuardEvent {
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

// Prune old entries from closed instances cache
const pruneClosedInstancesCache = () => {
  const now = Date.now();
  for (const [key, timestamp] of closedInstancesTimestamps.entries()) {
    if (now - timestamp > CLOSED_INSTANCES_CACHE_TTL) {
      closedInstancesCache.delete(key);
      closedInstancesTimestamps.delete(key);
    }
  }
};

// Clear old entries if cache gets too large
const pruneProcessedCache = () => {
  if (processedRequests.size > PROCESSED_CACHE_MAX_SIZE) {
    const entries = Array.from(processedRequests);
    entries
      .slice(0, PROCESSED_CACHE_MAX_SIZE / 2)
      .forEach((e) => processedRequests.delete(e));
  }
};

// ============================================
// USER EVALUATION LOGIC (Consolidated from AutoModLogic.ts)
// ============================================

export const evaluateUser = async (
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
  groupId: string // New Requirement
): Promise<{
  action: AutoModActionType | "ALLOW";
  reason?: string;
  ruleName?: string;
  ruleId?: number;
}> => {
  try {
    const config = getGroupConfig(groupId);
    const rules = config.rules.filter((r) => r.enabled);

    if (rules.length === 0) {
      return { action: "ALLOW" };
    }

    for (const rule of rules) {
      if (!rule.id) logger.warn(`[AutoMod] Rule has no ID: ${rule.name}`); // DEBUG
      let matches = false;
      let reason = "";

      if (rule.type === "KEYWORD_BLOCK") {
        let matchMode: "PARTIAL" | "WHOLE_WORD" = "PARTIAL";
        let keywords: string[] = [];
        let whitelist: string[] = [];
        let whitelistedUserIds: string[] = [];
        let whitelistedGroupIds: string[] = [];
        let scanBio = true;
        let scanStatus = true;
        let scanPronouns = false;
        let scanGroups = false;

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

        // -------------------------------------------------------------
        // 1. CHECK USER WHITELIST (Exemptions)
        // -------------------------------------------------------------
        if (whitelistedUserIds.some(id => id === user.id)) {
            // User is explicitly whitelisted from this rule
            continue;
        }

        // -------------------------------------------------------------
        // 2. CHECK GROUP WHITELIST (Exemptions)
        // -------------------------------------------------------------
        // We only fetch groups if we have a group whitelist OR we need to scan groups
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
            if (isGroupWhitelisted) {
                // User is in a whitelisted group - exempt from this rule
                continue;
            }
        }

        // Helper to escape regex special characters
        const escapeRegExp = (string: string) => {
          return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        };

        // Helper to check text
        const checkText = (
          text: string | undefined,
          contextName: string,
        ): boolean => {
          if (!text) return false;
          // For loose matching, we can stick to simple lowercase includes for speed
          // For strict matching, we need regex with word boundaries

          const lower = text.toLowerCase();

          for (const keyword of keywords) {
            const kw = keyword.trim();
            if (!kw) continue;

            let hasMatch = false;

            if (matchMode === "WHOLE_WORD") {
              // Strict Mode: Use Regex with word boundaries
              // We construct regex dynamically. To avoid ReDoS, we should be careful,
              // but keywords are generally short.
              // We use case-insensitive flag 'i' so we don't need to lowercase the input repeatedly vs the regex.
              try {
                const pattern = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
                hasMatch = pattern.test(text);
              } catch {
                // Fallback if regex fails (rare)
                hasMatch = lower.includes(kw.toLowerCase());
              }
            } else {
              // Loose Mode (Default): Simple substring match
              hasMatch = lower.includes(kw.toLowerCase());
            }

            if (hasMatch) {
              // Check Whitelist (Keyword Safelist)
               const isWhitelisted = whitelist.some(w =>
                  lower.includes(w.toLowerCase().trim())
              );

              if (!isWhitelisted) {
                matches = true;
                reason = `Keyword "${keyword}" found in ${contextName}`;
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

        // 4. Check Groups (if no match yet and enabled)
        else if (scanGroups && !matches && userGroups) {
            for (const g of userGroups) {
                if (checkText(g.name, `Group: "${g.name}"`)) break;
                if (checkText(g.shortCode, `Group Shortcode: "${g.shortCode}"`)) break;
            }
        }
        // Debug Logging for Age Verification
        if (user.ageVerificationStatus === undefined) {
          logger.warn(
            `[AutoMod] User ${user.displayName} (${user.id}) has NO ageVerificationStatus. Defaulting to ALLOW (Safe Fail).`,
          );
        }

        // If allowMissingData is true and we don't have status, SKIP this check (SAFE FAIL)
        if (user.ageVerificationStatus === undefined) {
          continue;
        }

        const normalizedStatus = (
          user.ageVerificationStatus || ""
        ).toLowerCase();
        // Check against '18+' (exact) or 'hidden' (case-insensitive normalized)
        if (
          user.ageVerificationStatus !== "18+" &&
          normalizedStatus !== "hidden"
        ) {
          matches = true;
          reason = `Age Verification Required (Found: ${user.ageVerificationStatus})`;
        }
      } else if (rule.type === "TRUST_CHECK") {
        // Trust check logic
        const tags = user.tags || [];

        // If allowMissingData is true and no tags, assume safe (or skip)
        if (
          options.allowMissingData &&
          (!user.tags || user.tags.length === 0)
        ) {
          // Skip check if we can't determine rank
        } else {
          let configLevel = "";
          try {
            const parsed = JSON.parse(rule.config);
            configLevel =
              parsed.minTrustLevel || parsed.trustLevel || rule.config;
          } catch {
            configLevel = rule.config;
          }

          const trustLevels = [
            "system_trust_visitor",
            "system_trust_basic",
            "system_trust_known",
            "system_trust_trusted",
            "system_trust_veteran",
            "system_trust_legend",
          ];
          const requiredIndex = trustLevels.findIndex((t) =>
            t.includes(configLevel.toLowerCase()),
          );

          if (requiredIndex > 0) {
            const userTrustIndex = trustLevels.findIndex((level) =>
              tags.includes(level),
            );
            // If user has no trust tags and we aren't allowing missing data, they are -1 (below visitor)
            if (userTrustIndex < requiredIndex) {
              matches = true;
              reason = `Trust Level below ${configLevel}`;
            }
          }
        }
      } else if (rule.type === "BLACKLISTED_GROUPS") {
        // Check if user is member of any blacklisted groups
        let config: {
          groupIds?: string[];
          groups?: Array<{ id: string; name: string }>;
        } = { groupIds: [] };
        try {
          config = JSON.parse(rule.config);
        } catch {
          config = { groupIds: [] };
        }

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
            logger.warn(
              `[AutoMod] Failed to fetch groups for ${user.displayName}: ${e}`,
            );
            // Safe fail - don't block if we can't fetch groups
          }
        }
      }

        if (matches) {
        logger.info(
          `[AutoMod] User ${user.displayName} matched rule: ${rule.name}`,
        );
        return {
          action: rule.actionType,
          reason,
          ruleName: rule.name,
          ruleId: rule.id // Added ruleId
        };
      }
    }

    return { action: "ALLOW" };
  } catch (error) {
    logger.error("[AutoMod] Error checking user:", error);
    return { action: "ALLOW" };
  }
};

// ... (persistAction helper remains same)

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
  },
): Promise<{
  processed: boolean;
  action: "accept" | "reject" | "skip";
  reason?: string;
}> => {
  // ... (auth checks same)
  const client = getVRChatClient();
  if (!client) {
    logger.warn("[AutoMod] Cannot process request - not authenticated");
    return { processed: false, action: "skip", reason: "Not authenticated" };
  }

  // Check if already processed
  const cacheKey = `gatekeeper:${groupId}:${userId}`;
  if (processedRequests.has(cacheKey)) {
    logger.debug(`[AutoMod] Request ${userId} already processed, skipping`);
    return { processed: false, action: "skip", reason: "Already processed" };
  }
  
  // ... (rules fetch same)
  const config = getGroupConfig(groupId);
  const rules = config.rules.filter((r) => r.enabled);
  if (rules.length === 0) {
    logger.debug("[AutoMod] No enabled rules, skipping auto-processing");
    return { processed: false, action: "skip", reason: "No enabled rules" };
  }

  try {
    // ... (fetch fullUser details same)
    let fullUser = _userDetails;
    
    if (!fullUser || !fullUser.tags) {
       try {
        const fetched = await fetchUser(userId);
        if (fetched) {
          fullUser = {
            ...fullUser,
            tags: fetched.tags,
            bio: fetched.bio,
            status: fetched.status,
            statusDescription: fetched.statusDescription,
            pronouns: fetched.pronouns,
            ageVerificationStatus: fetched.ageVerificationStatus,
          };
        }
        } catch { /* ignore */ }
    }

    // ... (Watchlist Check same)
    const watched = watchlistService.getEntity(userId);
    if (watched) {
      if (
        watched.critical ||
        watched.priority <= -10 ||
        watched.tags.includes("malicious") ||
        watched.tags.includes("nuisance")
      ) {
         // ... log info
      }
    }

    // Evaluate user against all enabled rules
    let evaluation = await evaluateUser({
      id: userId,
      displayName: displayName,
      tags: fullUser?.tags,
      bio: fullUser?.bio,
      status: fullUser?.status,
      statusDescription: fullUser?.statusDescription,
      pronouns: fullUser?.pronouns,
      ageVerificationStatus: fullUser?.ageVerificationStatus,
    }, { allowMissingData: false }, groupId);
    
    // Add missing type def for custom return property if typescript complains, 
    // or we update the interface. Ideally update interface.
    // For now we assume evaluateUser returns generic object or extended interface.
    
    // OVERRIDE with Watchlist if applicable
    if (watched) {
       // ... (logic same)
       if (
        watched.critical ||
        watched.priority <= -10 ||
        (watched.tags && (watched.tags.includes("malicious") || watched.tags.includes("nuisance")))
      ) {
        evaluation = {
          action: "REJECT",
          reason: `Watchlist: ${watched.displayName} (Priority: ${watched.priority})`,
          ruleName: "Watchlist",
        };
      }
    }

    // ... (logging same)
    
    // Mark as processed
    processedRequests.add(cacheKey);
    pruneProcessedCache();

    if (evaluation.action === "ALLOW") {
       // ... (auto-accept logic same)
       await persistAction({
           timestamp: new Date(),
           user: displayName,
           userId: userId,
           groupId: groupId,
           action: "AUTO_ACCEPT",
           reason: "No rules violated",
           module: "AutoMod",
           skipBroadcast: true 
       });
       // ...
       return { processed: true, action: "accept" };
    } else {
      // User failed a rule - auto-reject/block logic

      // BROADCAST NOTIFICATION TO FRONTEND (For overlay)
      // We broadcast BEFORE action taken so user sees it happening
      windowService.broadcast("automod:violation", {
          displayName: displayName,
          userId: userId,
          action: evaluation.action,
          reason: evaluation.reason || "Violated AutoMod Rule",
          ruleName: evaluation.ruleName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ruleId: (evaluation as any).ruleId, 
          // We pass detectedGroupId so frontend knows context
          detectedGroupId: groupId 
      });

      // Check Setting: Auto-Reject
      const config = getGroupConfig(groupId);
      const autoRejectEnabled = config.enableAutoReject === true;
      if (!autoRejectEnabled) {
          logger.info(`[AutoMod] Auto-Reject disabled. Skipping reject for ${displayName}. Sending notification.`);
          
          // Send Webhook (Notify Only)
          discordWebhookService.sendEvent(groupId, {
              title: "AutoMod Alert: REJECT (Action Skipped)",
              description: `**User**: ${displayName} (${userId})\n**Reason**: ${evaluation.reason || "No reason provided"}`,
              type: "ERROR",
              fields: [
                  { name: "Action Taken", value: "REJECT (Prevented by Auto-Ban OFF)", inline: true },
                  { name: "Location", value: "Current Group Instance", inline: true },
                   {
                      name: "User Link",
                      value: `[Profile](https://vrchat.com/home/user/${userId})`,
                      inline: true,
                    },
              ],
              targetUser: { displayName, id: userId },
              footer: "Group Guard AutoMod"
          });

          return { processed: true, action: "skip", reason: "Auto-Reject Disabled" };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientAny = client as any;
        await clientAny.respondGroupJoinRequest({
          path: { groupId, userId },
          body: { action: "reject" },
        });

        logger.info(
          `[AutoMod] ✗ Auto-rejected ${displayName} from group ${groupId}: ${evaluation.reason}`,
        );

        await persistAction({
          timestamp: new Date(),
          user: displayName,
          userId: userId,
          groupId: groupId,
          action: evaluation.action,
          reason: evaluation.reason || "Failed AutoMod filter",
          module: "Gatekeeper",
          details: { evaluation, ruleName: evaluation.ruleName },
          skipBroadcast: true
        });

        // WEBHOOK
        discordWebhookService.sendEvent(groupId, {
          title: "AutoMod Gatekeeper",
          description: `**User Rejected**: ${displayName} (${userId})\n**Reason**: ${evaluation.reason || "No reason provided"}`,
          type: "ERROR",
          fields: [
            { name: "Request Type", value: "Join Request", inline: true },
            {
              name: "Rule",
              value: evaluation.ruleName || "Unknown Rule",
              inline: true,
            },
            {
              name: "User Link",
              value: `[Profile](https://vrchat.com/home/user/${userId})`,
              inline: true,
            },
          ],
          targetUser: { displayName, id: userId },
        });

        return { processed: true, action: "reject", reason: evaluation.reason };
      } catch (e) {
        logger.error(`[AutoMod] Failed to reject ${displayName}:`, e);
        return {
          processed: false,
          action: "skip",
          reason: "API error on reject",
        };
      }
    }
  } catch (error) {
    logger.error(
      `[AutoMod] Error processing join request for ${displayName}:`,
      error,
    );
    return { processed: false, action: "skip", reason: "Processing error" };
  }
};

// ============================================
// LIVE SCAN HELPERS
// ============================================

// Helper Interfaces
interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  isRepresenting: boolean;
  roleIds: string[];
  mRoleIds: string[];
  joinedAt: string;
  membershipStatus: string;
  visibility: string;
  isSubscribedToAnnouncements: boolean;
  createdAt?: string;
  bannedAt?: string;
  managerNotes?: string;
  lastPostReadAt?: string;
  hasJoinedFromPurchase?: boolean;
  user: {
    id: string;
    username?: string;
    displayName: string;
    userIcon?: string;
    currentAvatarImageUrl?: string;
    currentAvatarThumbnailImageUrl?: string;
    tags?: string[];
    bio?: string;
    status?: string;
    statusDescription?: string;
    pronouns?: string;
    ageVerificationStatus?: string;
  };
}

export const processFetchGroupMembers = async (
  groupId: string,
): Promise<{ success: boolean; members: GroupMember[]; error?: string }> => {
  const client = getVRChatClient();
  if (!client) throw new Error("Not authenticated");

  const members: GroupMember[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).getGroupMembers({
        path: { groupId },
        query: { n: limit, offset },
      });
      const batch = (
        Array.isArray(response.data) ? response.data : []
      ) as GroupMember[];

      if (batch.length > 0) {
        members.push(...batch);
      }

      if (batch.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit to avoid infinite loops or memory crashes
      if (members.length > 50000) {
        logger.warn(
          `[AutoMod] Scan limit reached for group ${groupId} (50,000 members)`,
        );
        break;
      }

      // Small delay to be kind to API if we are hammering it
      if (hasMore) await new Promise((r) => setTimeout(r, 200));
    }

    return { success: true, members };
  } catch (e) {
    logger.error(`[AutoMod] Error fetching members for ${groupId}:`, e);
    return { success: false, members: [], error: String(e) };
  }
};

export const processEvaluateMember = async (
  groupId: string,
  member: GroupMember,
): Promise<ScanResult> => {
  const user = member.user;
  if (!user) {
    return {
      userId: member.userId || member.id || "unknown", // Fallback
      displayName: "Unknown",
      action: "SAFE",
    };
  }

  const evaluation = await evaluateUser({
    id: user.id,
    displayName: user.displayName,
    tags: user.tags,
    bio: user.bio,
    status: user.status,
    statusDescription: user.statusDescription,
    pronouns: user.pronouns,
    ageVerificationStatus: user.ageVerificationStatus,
  }, {}, groupId);

  const config = getGroupConfig(groupId);
  const isBanned =
    config.enableAutoBan &&
    (evaluation.action === "REJECT" || evaluation.action === "AUTO_BLOCK");

  return {
    userId: user.id,
    displayName: user.displayName,
    userIcon: user.userIcon,
    action:
      evaluation.action === "ALLOW"
        ? "SAFE"
        : isBanned
          ? "BANNED"
          : "VIOLATION",
    reason: evaluation.reason,
    ruleName: evaluation.ruleName,
  };
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
    logger.warn(
      "[AutoMod] Cannot process pending requests - not authenticated",
    );
    return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
  }

  // No global rules check here. We check per group inside the loop.
  // const allRules = store.get("rules");
  // const rules = allRules.filter((r) => r.enabled);
  // logger.info(
  //   `[AutoMod] Rules check: ${rules.length} enabled out of ${allRules.length} total`,
  // );

  // if (rules.length === 0) {
  //   logger.info(
  //     "[AutoMod] No enabled rules, skipping gatekeeper processing. Enable at least one AutoMod filter to auto-process requests.",
  //   );
  //   return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
  // }

  // logger.info(
  //   `[AutoMod] Enabled rules: ${rules.map((r) => r.name || r.type).join(", ")}`,
  // );

  const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
  if (authorizedGroups.length === 0) {
    logger.info(
      "[AutoMod] No authorized groups, skipping gatekeeper processing",
    );
    return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
  }

  logger.info(
    `[AutoMod] Starting gatekeeper processing for ${authorizedGroups.length} authorized groups...`,
  );

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
        query: { n: 100, offset: 0 },
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

      const requests: JoinRequest[] = Array.isArray(response.data)
        ? response.data
        : [];

      if (requests.length === 0) {
        logger.debug(`[AutoMod] No pending requests for group ${groupId}`);
        continue;
      }

      logger.info(
        `[AutoMod] Processing ${requests.length} pending requests for group ${groupId}`,
      );

      for (const req of requests) {
        const userId = req.userId || req.user?.id;
        const displayName = req.user?.displayName || "Unknown";

        if (!userId) {
          logger.warn("[AutoMod] Request missing userId, skipping");
          skipped++;
          continue;
        }

        const result = await processJoinRequest(
          groupId,
          userId,
          displayName,
          req.user,
        );

        if (result.processed) {
          totalProcessed++;
          if (result.action === "accept") accepted++;
          else if (result.action === "reject") rejected++;
          else if (result.action === "skip") {
            // It was "Processed" (evaluated) but skipped action.
            // We count it as processed.
          }
        } else {
          skipped++;
        }

        // Small delay between requests to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logger.error(
        `[AutoMod] Error fetching requests for group ${groupId}:`,
        e,
      );
    }
  }

  logger.info(
    `[AutoMod] Gatekeeper processing complete: ${totalProcessed} processed (${accepted} accepted, ${rejected} rejected, ${skipped} skipped)`,
  );
  return { totalProcessed, accepted, rejected, skipped };
};

// ============================================
// SCAN GROUP MEMBERS
// ============================================

export interface ScanResult {
  userId: string;
  displayName: string;
  userIcon?: string;
  action: "BANNED" | "VIOLATION" | "SAFE";
  reason?: string;
  ruleName?: string;
  ruleId?: number;
}

export const processAllGroupMembers = async (
  groupId: string,
): Promise<ScanResult[]> => {
  const client = getVRChatClient();
  if (!client) {
    throw new Error("Not authenticated");
  }

  // Check if any rules are enabled
  const config = getGroupConfig(groupId);
  const rules = config.rules.filter((r) => r.enabled);
  if (rules.length === 0) {
    return [];
  }

  // Check authorization
  if (!groupAuthorizationService.isGroupAllowed(groupId)) {
    throw new Error("Unauthorized group");
  }

  const autoBanEnabled = config.enableAutoBan === true;
  const results: ScanResult[] = [];

  let offset = 0;
  const limit = 100;
  let hasMore = true;

  logger.info(`[AutoMod] Starting full member scan for group ${groupId}...`);

  while (hasMore) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).getGroupMembers({
        path: { groupId },
        query: { n: limit, offset },
      });
      const members = (
        Array.isArray(response.data) ? response.data : []
      ) as GroupMember[];

      if (members.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      if (members.length === 0) break;

      logger.info(
        `[AutoMod] Scanning batch of ${members.length} members (Offset: ${offset})...`,
      );

      for (const member of members) {
        let user = member.user;
        if (!user) continue;

        // FETCH FULL DETAILS if missing (critical for AutoMod)
        // Groups API returns "lite" user objects without bio, tags, trust rank, etc.
        if (!user.bio && !user.tags) {
           try {
             const fullUser = await fetchUser(user.id);
             if (fullUser) {
                user = { ...user, ...fullUser };
             }
             // Rate limiting: sleep slightly to strictly avoid specific user-fetch limits
             // 100ms per user = 10 users per second = safeish
             await new Promise(r => setTimeout(r, 100)); 
           } catch (e) {
             logger.warn(`[AutoMod] Failed to fetch full details for ${user.displayName} during scan`, e);
           }
        }

        // Evaluate
        const evaluation = await evaluateUser({
          id: user.id,
          displayName: user.displayName,
          tags: user.tags,
          bio: user.bio,
          status: user.status,
          statusDescription: user.statusDescription,
          pronouns: user.pronouns,
          ageVerificationStatus: user.ageVerificationStatus,
        }, {}, groupId);

        if (evaluation.action !== "ALLOW") {
          // Check logic:
          // If Auto-Ban is ON, and action is REJECT or AUTO_BLOCK -> Ban
          // If Auto-Ban is OFF -> Just Report

          let finalAction: "BANNED" | "VIOLATION" = "VIOLATION";

          if (
            autoBanEnabled &&
            (evaluation.action === "REJECT" ||
              evaluation.action === "AUTO_BLOCK")
          ) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (client as any).banGroupMember({
                path: { groupId },
                body: { userId: user.id },
              });
              logger.info(
                `[AutoMod] [SCAN] Auto-Banned ${user.displayName}: ${evaluation.reason}`,
              );
              finalAction = "BANNED";

              // Persist
              await persistAction({
                timestamp: new Date(),
                user: user.displayName,
                userId: user.id,
                groupId: groupId,
                action: "AUTO_BAN",
                reason: evaluation.reason || "Failed AutoMod Scan",
                module: "AutoMod Scan",
                details: { ruleName: evaluation.ruleName },
                skipBroadcast: true
              });
            } catch (e) {
              logger.error(
                `[AutoMod] [SCAN] Failed to auto-ban ${user.displayName}`,
                e,
              );
              // Keep as VIOLATION if ban failed
            }
          }

          results.push({
            userId: user.id,
            displayName: user.displayName,
            userIcon: user.userIcon || user.currentAvatarThumbnailImageUrl,
            action: finalAction,
            reason: evaluation.reason,
            ruleName: evaluation.ruleName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ruleId: (evaluation as any).ruleId,
          });
        }
      }

      // Rate Limit Respect: Delay between batches
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      logger.error(`[AutoMod] Error scanning group members`, e);
      hasMore = false; // Stop on error
    }
  }

  logger.info(`[AutoMod] Scan complete. Found ${results.length} violations.`);
  return results;
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
  if (
    notification.type !== "groupannouncement" &&
    notification.type !== "group.queueReady"
  ) {
    return;
  }

  const groupId = notification.details?.groupId;
  const userId = notification.senderUserId;
  const displayName = notification.senderUsername || "Unknown";

  if (!groupId || !userId) {
    logger.debug("[AutoMod] Notification missing groupId or userId, skipping");
    return;
  }

  // Check if this group is authorized
  if (!groupAuthorizationService.isGroupAllowed(groupId)) {
    logger.debug(
      `[AutoMod] Notification for unauthorized group ${groupId}, skipping`,
    );
    return;
  }

  logger.info(
    `[AutoMod] Processing real-time join notification: ${displayName} for group ${groupId}`,
  );
  await processJoinRequest(groupId, userId, displayName);
};

// ===== INSTANCE 18+ GUARD =====
// Auto-close group instances that are not marked as 18+ age-gated

export const processInstanceGuard = async (): Promise<{
  totalClosed: number;
  groupsChecked: number;
}> => {
  const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
  if (authorizedGroups.length === 0) {
    return { totalClosed: 0, groupsChecked: 0 };
  }

  // Prune old entries from closed instances cache
  pruneClosedInstancesCache();

  let totalClosed = 0;
  let groupsChecked = 0;

  for (const groupId of authorizedGroups) {
    try {
      // Check if any instance-related rules are enabled for this group
      const config = getGroupConfig(groupId);
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

          // Add to history
          instanceGuardHistory.unshift(openEvent);
          if (instanceGuardHistory.length > INSTANCE_HISTORY_MAX_SIZE) {
            instanceGuardHistory.pop();
          }

          // Broadcast to UI
          windowService.broadcast('instance-guard:event', openEvent);

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
        // The getGroupInstances API doesn't reliably include ageGate field
        // We must fetch via getInstance to get accurate age gate status
        if (useAgeGateLogic && !isBlacklisted) {
          try {
            logger.debug(`[InstanceGuard] Fetching complete instance data for age gate check: ${worldName}`);
            const instId = instance.instanceId || instance.name || name;
            if (!instId) {
              logger.warn(`[InstanceGuard] Missing instance ID for ${worldName} - cannot fetch complete data`);
            } else {
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
                logger.info(`[InstanceGuard] Fetched age gate for ${worldName}: instance.ageGate=${instance.ageGate}, world.ageGate=${instance.world?.ageGate}`);
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

        // Log key information for monitoring
        logger.info(`[InstanceGuard] Checking ${worldName} (${instanceKey}): whitelisted=${isWhitelisted}, blacklisted=${isBlacklisted}, ruleType=${useAgeGateLogic ? '18+ Guard' : 'Close All'}`);

        if (isBlacklisted) {
          shouldClose = true;
          closeReason = `World "${worldName}" is blacklisted`;
        } else if (!isWhitelisted) {
          if (useAgeGateLogic) {
            // 18+ Guard logic - check age gate status (after fetching complete data above)
            // Check both instance and world level age gate - either being true means it's 18+
            const hasAgeGate = instance.ageGate === true || instance.world?.ageGate === true;

            logger.info(`[InstanceGuard] Age gate check for ${worldName}: hasAgeGate=${hasAgeGate} (instance.ageGate=${instance.ageGate}, world.ageGate=${instance.world?.ageGate})`);

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
        }

        if (shouldClose) {

          try {
            const closeResult = await vrchatApiService.closeInstance(worldId, instanceId);

            if (closeResult.success) {
              totalClosed++;

              // Mark this instance as closed to prevent duplicate actions
              closedInstancesCache.add(instanceKey);
              closedInstancesTimestamps.set(instanceKey, Date.now());

              // Log the action (skipBroadcast to avoid spamming AutoMod log)
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
                skipBroadcast: true // Don't send to AutoMod UI - Instance Guard has its own log
              });

              // Fetch owner name if we have an ownerId (for the close event)
              let ownerName: string | undefined;
              if (ownerId && ownerId.startsWith('usr_')) {
                try {
                  const ownerResult = await vrchatApiService.getUser(ownerId);
                  if (ownerResult.success && ownerResult.data) {
                    ownerName = ownerResult.data.displayName;
                  }
                } catch (e) {
                  // Ignore - we may have already fetched this for the open event
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

              // Add to history
              instanceGuardHistory.unshift(eventEntry);
              if (instanceGuardHistory.length > INSTANCE_HISTORY_MAX_SIZE) {
                instanceGuardHistory.pop();
              }

              // Broadcast to UI
              windowService.broadcast('instance-guard:event', eventEntry);

              logger.info(`[InstanceGuard] Successfully closed instance: ${worldName}`);
            } else {
              // If the close failed, also add to cache to prevent spamming retries
              // (e.g., if the instance was already closed or we don't have permission)
              closedInstancesCache.add(instanceKey);
              closedInstancesTimestamps.set(instanceKey, Date.now());
              logger.error(`[InstanceGuard] Failed to close instance ${worldName}: ${closeResult.error}`);
            }
          } catch (closeError) {
            // On error, also cache to prevent spam retries
            closedInstancesCache.add(instanceKey);
            closedInstancesTimestamps.set(instanceKey, Date.now());
            logger.error(`[InstanceGuard] Error closing instance ${worldName}:`, closeError);
          }
        }
      }
    } catch (groupError) {
      logger.error(`[InstanceGuard] Error processing group ${groupId}:`, groupError);
    }
  }

  if (totalClosed > 0) {
    logger.info(`[InstanceGuard] Processing complete: ${totalClosed} instances closed across ${groupsChecked} groups`);
  }

  return { totalClosed, groupsChecked };
};

export const startAutoModService = () => {
  // Stop any existing interval first
  if (autoModInterval) {
    clearInterval(autoModInterval);
    autoModInterval = null;
  }

  logger.info(`[AutoMod] Starting AutoMod service with ${CHECK_INTERVAL / 1000}s interval...`);

  // Run immediately on start
  processAllPendingRequests().catch((err) =>
    logger.error("[AutoMod] Initial request processing failed", err)
  );

  // Set up periodic interval
  autoModInterval = setInterval(() => {
    logger.debug("[AutoMod] Running periodic join request check...");
    processAllPendingRequests().catch((err) =>
      logger.error("[AutoMod] Periodic request processing failed", err)
    );

    // Also run Instance Guard check
    processInstanceGuard().catch((err) =>
      logger.error("[AutoMod] Instance Guard processing failed", err)
    );
  }, CHECK_INTERVAL);
};

export const stopAutoModService = () => {
  if (autoModInterval) {
    clearInterval(autoModInterval);
    autoModInterval = null;
  }
};

export const setupAutoModHandlers = () => {
  logger.info("Initializing AutoMod handlers...");

  // Subscribe to group updates to triggering re-scan
  serviceEventBus.on("groups-updated", () => {
    logger.info(
      "[AutoMod] Groups updated, triggering re-scan of pending requests",
    );
    setTimeout(() => {
      processAllPendingRequests().catch((err) =>
        logger.error("AutoMod trigger failed", err),
      );
    }, 2000); // Small delay to ensuring other services updated first
  });

  // Handlers
  ipcMain.handle("automod:get-rules", (_, groupId: string) => {
    if (!groupId) return [];
    return getGroupConfig(groupId).rules;
  });

  ipcMain.handle("automod:get-status", (_, groupId: string) => {
    if (!groupId) return { autoReject: false, autoBan: false };
    const config = getGroupConfig(groupId);
    return {
      autoReject: config.enableAutoReject,
      autoBan: config.enableAutoBan,
    };
  });

  ipcMain.handle("automod:set-auto-reject", (_e, { groupId, enabled }) => {
    const config = getGroupConfig(groupId);
    config.enableAutoReject = enabled;
    saveGroupConfig(groupId, config);

    // Clear cache to re-evaluate pending requests immediately
    logger.info(
      `[AutoMod] Auto-Reject turned ${enabled ? "ON" : "OFF"} for group ${groupId}. Clearing cache and re-scanning.`,
    );
    processedRequests.clear();

    // Trigger a re-scan shortly
    setTimeout(() => {
      processAllPendingRequests().catch((err) =>
        logger.error("AutoMod trigger failed", err),
      );
    }, 1000);

    return enabled;
  });

  ipcMain.handle("automod:set-auto-ban", (_e, { groupId, enabled }) => {
    const config = getGroupConfig(groupId);
    config.enableAutoBan = enabled;
    saveGroupConfig(groupId, config);
    
    // We don't need to clear processedRequests for this necessarily,
    // as checkPlayer logic is run often.
    // But to be safe if we want immediate reaction to existing members:
    processedRequests.clear();
    return enabled;
  });

  ipcMain.handle("automod:save-rule", (_e, { groupId, rule }) => {
    const config = getGroupConfig(groupId);
    const rules = config.rules;
    
    if (rule.id) {
      const index = rules.findIndex((r) => r.id === rule.id);
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
    saveGroupConfig(groupId, { ...config, rules });
    return rule;
  });

  ipcMain.handle("automod:delete-rule", (_e, { groupId, ruleId }) => {
    const config = getGroupConfig(groupId);
    const rules = config.rules;
    const newRules = rules.filter((r) => r.id !== ruleId);
    saveGroupConfig(groupId, { ...config, rules: newRules });
    return true;
  });

  // History Handlers
  ipcMain.handle("automod:get-history", async (_e, { groupId } = {}) => {
    try {
      return await databaseService.getAutoModLogs(groupId);
    } catch (error) {
      logger.error("Failed to get AutoMod history", error);
      return [];
    }
  });

  ipcMain.handle("automod:clear-history", async () => {
    try {
      await databaseService.clearAutoModLogs();
      // Also clear file if exists?
      const dbPath = path.join(
        app.getPath("userData"),
        "automod_history.jsonl",
      );
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      // Also clear the processed cache
      processedRequests.clear();
      return true;
    } catch (error) {
      logger.error("Failed to clear AutoMod history", error);
      return false;
    }
  });

  // Check User against AutoMod rules (used by LiveView for mass invites)
  ipcMain.handle("automod:check-user", async (_e, { user, groupId }) => {
    return evaluateUser(user, {}, groupId);
  });

  ipcMain.handle("automod:test-notification", (_, { groupId }) => {
    windowService.broadcast("automod:violation", {
      displayName: "Test User",
      userId: "usr_test",
      action: "REJECT",
      reason: "Test Rule Violation",
      ruleId: 12345,
      detectedGroupId: groupId || "grp_test_group",
    });
    return true;
  });

  ipcMain.handle("automod:getWhitelistedEntities", async (_, groupId: string) => {
    if (!groupId) return { users: [], groups: [] };
    const config = getGroupConfig(groupId);
    const rules = config.rules;
    const userMap = new Map<string, { id: string, name: string, rules: string[] }>();
    const groupMap = new Map<string, { id: string, name: string, rules: string[] }>();

    for (const rule of rules) {
        if (rule.whitelistedUserIds) {
            for (const userId of rule.whitelistedUserIds) {
                if (!userId) continue;
                if (!userMap.has(userId)) {
                     // Try to fetch name from cache or API
                     let name = userId;
                     try {
                         const result = await vrchatApiService.getUser(userId);
                         if (result.success && result.data) {
                             name = result.data.displayName;
                         }
                     } catch(e) {
                         console.error(`[AutoMod] Failed to resolve name for ${userId}:`, e);
                     }
                     
                     userMap.set(userId, { id: userId, name, rules: [] });
                }
                userMap.get(userId)?.rules.push(rule.name);
            }
        }

        if (rule.whitelistedGroupIds) {
             for (const groupIdVal of rule.whitelistedGroupIds) {
                if (!groupIdVal) continue;
                if (!groupMap.has(groupIdVal)) {
                     let name = groupIdVal;
                     try {
                         const result = await vrchatApiService.getGroupDetails(groupIdVal);
                         if (result.success && result.data) {
                             name = result.data.name;
                         }
                     } catch(e) {
                         console.error(`[AutoMod] Failed to resolve group name for ${groupIdVal}:`, e);
                     }
                     groupMap.set(groupIdVal, { id: groupIdVal, name, rules: [] });
                }
                groupMap.get(groupIdVal)?.rules.push(rule.name);
            }
        }
    }
    
    return {
        users: Array.from(userMap.values()),
        groups: Array.from(groupMap.values())
    };
  });

  ipcMain.handle("automod:removeFromWhitelist", async (_, { groupId, id, type }) => {
    const config = getGroupConfig(groupId);
    const rules = config.rules; // Reference to rules array
    let updated = false;

    for (let i = 0; i < rules.length; i++) {
        let ruleUpdated = false;
        if (type === 'user' && rules[i].whitelistedUserIds?.includes(id)) {
            rules[i].whitelistedUserIds = rules[i].whitelistedUserIds!.filter(uid => uid !== id);
            ruleUpdated = true;
        }
        if (type === 'group' && rules[i].whitelistedGroupIds?.includes(id)) {
             rules[i].whitelistedGroupIds = rules[i].whitelistedGroupIds!.filter(gid => gid !== id);
             ruleUpdated = true;
        }

        if (ruleUpdated) {
            updated = true;
        }
    }

    if (updated) {
        saveGroupConfig(groupId, { ...config, rules });
        return true;
    }
    return false;
  });

  // Search VRChat groups by name or shortCode
  ipcMain.handle("automod:search-groups", async (_e, query: string) => {
    try {
      const result = await vrchatApiService.searchGroups(query);
      if (result.success && result.data) {
        return { success: true, groups: result.data };
      }
      return {
        success: false,
        error: result.error || "Failed to search groups",
      };
    } catch (error) {
      logger.error("Failed to search groups", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("automod:fetch-members", async (_, groupId) => {
    return await processFetchGroupMembers(groupId);
  });

  ipcMain.handle("automod:evaluate-member", async (_, { groupId, member }) => {
    return await processEvaluateMember(groupId, member);
  });


  // ... existing handlers ...
  
  ipcMain.handle("automod:add-to-whitelist", async (_e, { groupId, ruleId, target }) => {
    return addToWhitelist(groupId, ruleId, target);
  });

  // Scan Group Members
  ipcMain.handle("automod:scan-group-members", async (_e, groupId: string) => {
    try {
      const results = await processAllGroupMembers(groupId);
      return { success: true, results };
    } catch (error) {
      logger.error("Failed to scan group members", error);
      return { success: false, error: String(error) };
    }
  });

  // ===== INSTANCE GUARD HANDLERS =====

  ipcMain.handle("instance-guard:get-history", (_e, groupId: string) => {
    if (!groupId) return [];
    return instanceGuardHistory.filter(e => e.groupId === groupId);
  });

  ipcMain.handle("instance-guard:clear-history", () => {
    instanceGuardHistory.length = 0;
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

// Helper to persist actions (used by both scan and live checks)
  const executeAction = async (
    player: { userId: string; displayName: string },
    rule: AutoModRule,
    groupId: string,
    notifyOnly: boolean = false,
    isBackfill: boolean = false,
  ) => {
    // SECURITY: Validate that we have permission to moderate this group
    if (!groupAuthorizationService.isGroupAllowed(groupId)) {
      logger.warn(
        `[AutoMod] [SECURITY BLOCK] Attempted action on unauthorized group: ${groupId}. Skipping.`,
      );
      return;
    }

    const client = getVRChatClient();
    if (!client) return;

    logger.info(
      `[AutoMod] Executing ${rule.actionType} on ${player.displayName} (${player.userId}) for rule ${rule.name} (Backfill: ${isBackfill})`,
    );

    // Persist the violation (Always persist for audit)
    await persistAction({
      timestamp: new Date(),
      user: player.displayName,
      userId: player.userId,
      groupId: groupId,
      action: rule.actionType,
      reason: `Violated Rule: ${rule.name}`,
      module: "AutoMod",
      details: { ruleId: rule.id, config: rule.config, backfill: isBackfill },
      skipBroadcast: true
    });

    // NOTIFY RENDERER (TOAST)
    // Suppress notification if backfill
    if (!isBackfill) {
      windowService.broadcast("automod:violation", {
        displayName: player.displayName,
        userId: player.userId,
        action: rule.actionType,
        reason: rule.name,
        ruleId: rule.id,
        detectedGroupId: groupId,
        skipped: notifyOnly,
      });
    }

    // WEBHOOK
    const isActionable =
      rule.actionType === "REJECT" || rule.actionType === "AUTO_BLOCK";

    let title = `🛡️ AutoMod Violation: ${rule.actionType}`;
    let actionValue: string = rule.actionType;

    if (notifyOnly && isActionable) {
      title = `🛡️ AutoMod Alert: ${rule.actionType} (Action Skipped)`;
      actionValue = `${rule.actionType} (Prevented by Auto-Ban OFF)`;
    }

    // Suppress Webhook if backfill
    if (!isBackfill) {
      discordWebhookService.sendEvent(groupId, {
        title: title,
        description: `**User**: ${player.displayName} (${player.userId})\n**Reason**: ${rule.name}`,
        type: isActionable ? "ERROR" : "WARNING",
        fields: [
          { name: "Action Taken", value: actionValue, inline: true },
          {
            name: "Location",
            value:
              getCurrentGroupId() === groupId
                ? "Current Group Instance"
                : "Remote Request",
            inline: true,
          },
        ],
        targetUser: {
          displayName: player.displayName,
          id: player.userId,
        },
        footer: "Group Guard AutoMod",
      });
    }

    if (
      !notifyOnly &&
      (rule.actionType === "REJECT" || rule.actionType === "AUTO_BLOCK")
    ) {
      try {
        // Ban from Group (Kick)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).banGroupMember({
          path: { groupId },
          body: { userId: player.userId },
        });
        logger.info(
          `[AutoMod] Banned ${player.displayName} from group ${groupId}`,
        );
      } catch (error) {
        logger.error(`[AutoMod] Failed to ban ${player.displayName}`, error);
      }
    }
    // NOTIFY_ONLY is handled by just logging (and potentially frontend events via log database)
  };

  const checkPlayer = async (
    player: { userId: string; displayName: string },
    groupId: string,
    isBackfill: boolean = false,
  ) => {
    // Prevent duplicate checks
    const key = `${groupId}:${player.userId}`;
    if (processedRequests.has(key)) return;

    const config = getGroupConfig(groupId);
    const rules = config.rules.filter((r) => r.enabled);
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
      displayName: player.displayName,
    };

    try {
      // fetchUser is robust and cached
      const userDetails = await fetchUser(player.userId);
      if (userDetails) {
        fullUser = { ...fullUser, ...userDetails };
      }
    } catch (e) {
      logger.warn(
        `[AutoMod] Failed to fetch user details for ${player.displayName}`,
        e,
      );
    }

    // GHOST CHECK: Verify player is still in the instance (e.g. checking historical logs on startup)
    // We check AFTER the async fetch because the log parser might have processed a 'Leave' event in the meantime.
    const currentPlayers = logWatcherService.getPlayers();
    const isStillHere = currentPlayers.some((p) => p.userId === player.userId);

    if (!isStillHere) {
      logger.debug(
        `[AutoMod] Player ${player.displayName} left before check completed (or was a ghost entry). Skipping.`,
      );
      return;
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
      ageVerificationStatus: fullUser.ageVerificationStatus,
    }, {}, groupId);

    if (evaluation.action !== "ALLOW") {
      logger.info(
        `[AutoMod] Detected violation for ${player.displayName}: ${evaluation.reason}`,
      );

      // Execute Action
      // Construct a synthetic rule object to pass to executeAction
      const syntheticRule: AutoModRule = {
        id: evaluation.ruleId || Date.now(),
        name: evaluation.reason || evaluation.ruleName || "AutoMod Violation",
        enabled: true,
        type: "AUTO_DETECTED",
        config: "",
        actionType: evaluation.action as AutoModActionType,
        createdAt: new Date().toISOString(),
      };

      // Notify only depending on setting
      // Check Setting: Auto-Ban Members
      const config = getGroupConfig(groupId);
      const autoBanEnabled = config.enableAutoBan === true;
      const notifyOnly = !autoBanEnabled;

      logger.info(
        `[AutoMod] Action Triggered. AutoBan: ${autoBanEnabled}, NotifyOnly: ${notifyOnly}`,
      );

      await executeAction(
        player,
        syntheticRule,
        groupId,
        notifyOnly,
        isBackfill,
      );
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
        // Periodic checks are implicitly "backfill" if they are just re-checking?
        // No, periodic check is "Current State Check".
        // We typically want to notify if a NEW violation occurs on an existing player?
        // But checkPlayer de-duplicates via processedRequests.
        // So this logic is fine.
        await checkPlayer(
          { userId: p.userId, displayName: p.displayName },
          groupId,
          false,
        );
      }
    } catch (error) {
      logger.error("AutoMod Loop Error:", error);
    }
  };

  // Listen for realtime joins
  logWatcherService.on(
    "player-joined",
    async (event: {
      displayName: string;
      userId?: string;
      timestamp: string;
      isBackfill?: boolean;
    }) => {
      if (!event.userId) return;
      const groupId = getCurrentGroupId();
      if (!groupId) return;

      // SECURITY: Validate that we have permission to moderate this group
      if (!groupAuthorizationService.isGroupAllowed(groupId)) {
        return; // Silently skip - not our group
      }

      // Pass isBackfill flag to suppress notifications if needed
      await checkPlayer(
        { userId: event.userId, displayName: event.displayName },
        groupId,
        event.isBackfill,
      );
    },
  );

  // Start Loop (Backup)
  if (!autoModInterval) {
    // Run once immediately (delayed slightly to allow auth) then interval
    setTimeout(runAutoModCycle, 5000);
    autoModInterval = setInterval(runAutoModCycle, CHECK_INTERVAL);
  }
};
