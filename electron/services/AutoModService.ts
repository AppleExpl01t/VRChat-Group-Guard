import log from "electron-log";
import { getVRChatClient } from "./AuthService";
import { databaseService } from "./DatabaseService";
import { groupAuthorizationService } from "./GroupAuthorizationService";
import { fetchUser } from "./UserService";
import { windowService } from "./WindowService";
import { discordWebhookService } from "./DiscordWebhookService";
import { watchlistService } from "./WatchlistService";
import { autoModConfigService } from "./AutoModConfigService";
import { autoModRuleService } from "./AutoModRuleService";
import { instanceGuardService } from "./InstanceGuardService";
import { permissionGuardService } from "./PermissionGuardService";

const logger = log.scope("AutoModService");

// The core AutoMod logic
let autoModInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL = 60 * 1000; // Check every minute

// Track processed requests to prevent duplicates within a session
const processedRequests = new Set<string>();
const PROCESSED_CACHE_MAX_SIZE = 1000;

const pruneProcessedCache = () => {
  if (processedRequests.size > PROCESSED_CACHE_MAX_SIZE) {
    const entries = Array.from(processedRequests);
    entries
      .slice(0, PROCESSED_CACHE_MAX_SIZE / 2)
      .forEach((e) => processedRequests.delete(e));
  }
};

// Helper: Persist Action
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

// ============================================
// AUTO-PROCESS JOIN REQUESTS
// ============================================

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
  if (!groupAuthorizationService.isGroupAllowed(groupId)) {
    return { processed: false, action: "skip", reason: "Unauthorized group" };
  }

  const client = getVRChatClient();
  if (!client) {
    logger.warn("[AutoMod] Cannot process request - not authenticated");
    return { processed: false, action: "skip", reason: "Not authenticated" };
  }

  const cacheKey = `gatekeeper:${groupId}:${userId}`;
  if (processedRequests.has(cacheKey)) {
    logger.debug(`[AutoMod] Request ${userId} already processed, skipping`);
    return { processed: false, action: "skip", reason: "Already processed" };
  }
  
  const config = autoModConfigService.getGroupConfig(groupId);
  const rules = config.rules.filter((r) => r.enabled);
  if (rules.length === 0) {
    logger.debug("[AutoMod] No enabled rules, skipping auto-processing");
    return { processed: false, action: "skip", reason: "No enabled rules" };
  }

  try {
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
        } catch (error) { 
            logger.warn(`[AutoMod] Failed to fetch full user details for ${userId}:`, error);
        }
    }

    const watched = watchlistService.getEntity(userId);
    if (watched) {
      if (
        watched.critical ||
        watched.priority <= -10 ||
        watched.tags.includes("malicious") ||
        watched.tags.includes("nuisance")
      ) {
         logger.warn(`[Gatekeeper] Blocking watched user: ${displayName}`);
      }
    }

    let evaluation = await autoModRuleService.evaluateUser({
      id: userId,
      displayName: displayName,
      tags: fullUser?.tags,
      bio: fullUser?.bio,
      status: fullUser?.status,
      statusDescription: fullUser?.statusDescription,
      pronouns: fullUser?.pronouns,
      ageVerificationStatus: fullUser?.ageVerificationStatus,
    }, { allowMissingData: false }, groupId);
    
    // OVERRIDE with Watchlist
    if (watched) {
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
    
    processedRequests.add(cacheKey);
    pruneProcessedCache();

    if (evaluation.action === "ALLOW") {
       // Check if Auto-Processing is enabled
       const autoProcessEnabled = config.enableAutoProcess;

       if (!autoProcessEnabled) {
           return { processed: true, action: "skip", reason: "Auto-Process Disabled" };
       }

       try {
           await client.respondGroupJoinRequest({
               path: { groupId, userId },
               body: { action: "accept" }
           });
           
           logger.info(`[AutoMod] ✓ Auto-accepted ${displayName} into group ${groupId}`);

           await persistAction({
               timestamp: new Date(),
               user: displayName,
               userId: userId,
               groupId: groupId,
               action: "AUTO_ACCEPT",
               reason: "Passed all AutoMod rules",
               module: "Gatekeeper",
               skipBroadcast: true 
           });

           return { processed: true, action: "accept" };

       } catch (error) {
           logger.error(`[AutoMod] Failed to accept ${displayName}:`, error);
           return { processed: false, action: "skip", reason: "API error on accept" };
       }
    } else {
      // User failed a rule
      windowService.broadcast("automod:violation", {
          displayName: displayName,
          userId: userId,
          action: evaluation.action,
          reason: evaluation.reason || "Violated AutoMod Rule",
          ruleName: evaluation.ruleName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ruleId: (evaluation as any).ruleId, 
          detectedGroupId: groupId 
      });

      const autoProcessEnabled = config.enableAutoProcess === true;
      if (!autoProcessEnabled) {
          logger.info(`[AutoMod] Auto-Process disabled. Skipping reject for ${displayName}.`);
          
          discordWebhookService.sendEvent(groupId, {
              title: "AutoMod Alert: REJECT (Action Skipped)",
              description: `**User**: ${displayName} (${userId})\n**Reason**: ${evaluation.reason || "No reason provided"}`,
              type: "ERROR",
              fields: [
                  { name: "Action Taken", value: "REJECT (Prevented by Auto-Process OFF)", inline: true },
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

          return { processed: true, action: "skip", reason: "Auto-Process Disabled" };
      }

      try {
        await client.respondGroupJoinRequest({
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
        return { processed: false, action: "skip", reason: "API error on reject" };
      }
    }
  } catch (error) {
    logger.error(`[AutoMod] Error processing join request for ${displayName}:`, error);
    return { processed: false, action: "skip", reason: "Processing error" };
  }
};

export const processAllPendingRequests = async (): Promise<{
  totalProcessed: number;
  accepted: number;
  rejected: number;
  skipped: number;
}> => {
  const client = getVRChatClient();
  if (!client) {
    return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
  }

  const authorizedGroups = groupAuthorizationService.getAllowedGroupIds();
  if (authorizedGroups.length === 0) {
    return { totalProcessed: 0, accepted: 0, rejected: 0, skipped: 0 };
  }

  let totalProcessed = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;

  for (const groupId of authorizedGroups) {
    try {
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

      if (requests.length === 0) continue;

      for (const req of requests) {
        const userId = req.userId || req.user?.id;
        const displayName = req.user?.displayName || "Unknown";

        if (!userId) {
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
        } else {
          skipped++;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logger.error(
        `[AutoMod] Error fetching requests for group ${groupId}:`,
        e,
      );
    }
  }

  return { totalProcessed, accepted, rejected, skipped };
};

export const processGroupJoinNotification = async (notification: {
  type?: string;
  senderUserId?: string;
  senderUsername?: string;
  details?: {
    groupId?: string;
    groupName?: string;
  };
}): Promise<void> => {
  if (
    notification.type !== "groupannouncement" &&
    notification.type !== "group.queueReady"
  ) {
    return;
  }

  const groupId = notification.details?.groupId;
  const userId = notification.senderUserId;
  const displayName = notification.senderUsername || "Unknown";

  if (!groupId || !userId) return;

  if (!groupAuthorizationService.isGroupAllowed(groupId)) return;

  logger.info(
    `[AutoMod] Processing real-time join notification: ${displayName} for group ${groupId}`,
  );
  await processJoinRequest(groupId, userId, displayName);
};


export const startAutoModService = () => {
  if (autoModInterval) {
    clearInterval(autoModInterval);
    autoModInterval = null;
  }

  logger.info(`[AutoMod] Starting AutoMod service with ${CHECK_INTERVAL / 1000}s interval...`);

  processAllPendingRequests().catch((err) =>
    logger.error("[AutoMod] Initial request processing failed", err)
  );

  autoModInterval = setInterval(() => {
    logger.debug("[AutoMod] Running periodic join request check...");
    processAllPendingRequests().catch((err) =>
      logger.error("[AutoMod] Periodic request processing failed", err)
    );

    instanceGuardService.processInstanceGuard().catch((err) =>
      logger.error("[AutoMod] Instance Guard processing failed", err)
    );

    permissionGuardService.checkPermissions().catch((err) =>
      logger.error("[AutoMod] Permission Guard processing failed", err)
    );
  }, CHECK_INTERVAL);
};

export const stopAutoModService = () => {
  if (autoModInterval) {
    clearInterval(autoModInterval);
    autoModInterval = null;
  }
};

// Exported Service Object for external controllers to control the service state
export const autoModService = {
  resetCache: () => {
    processedRequests.clear();
    logger.info("[AutoMod] Request cache cleared");
  },
  triggerPendingRequestScan: async () => {
    return processAllPendingRequests();
  }
};
