import log from "electron-log";
import { getVRChatClient } from "./AuthService";
import { fetchUser } from "./UserService";
import { databaseService } from "./DatabaseService";
import { autoModConfigService } from "./AutoModConfigService";
import { autoModRuleService, ScanResult } from "./AutoModRuleService";
import { groupAuthorizationService } from "./GroupAuthorizationService";

const logger = log.scope("AutoModScannerService");

interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  isRepresenting: boolean;
  roleIds: string[];
  mRoleIds: string[];
  joinedAt: string | Date;
  membershipStatus: string;
  visibility: string;
  isSubscribedToAnnouncements: boolean;
  createdAt?: string | Date;
  bannedAt?: string | Date;
  managerNotes?: string;
  lastPostReadAt?: string | Date;
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

// Helper: Persist Action (Duplicated/Shared from AutoModService - ideally this should be in a shared helper if complex, but simple enough here)
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
    } catch (error) {
        logger.error("[AutoModScanner] Failed to persist action:", error);
    }
};

export const autoModScannerService = {
    async processFetchGroupMembers(
        groupId: string,
    ): Promise<{ success: boolean; members: GroupMember[]; error?: string }> {
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

                if (members.length > 50000) break; // Safety limit
                if (hasMore) await new Promise((r) => setTimeout(r, 200));
            }

            return { success: true, members };
        } catch (e) {
            logger.error(`[AutoModScanner] Error fetching members for ${groupId}:`, e);
            return { success: false, members: [], error: String(e) };
        }
    },

    async processEvaluateMember(
        groupId: string,
        member: GroupMember,
    ): Promise<ScanResult> {
        const user = member.user;
        if (!user) {
            return {
                userId: member.userId || member.id || "unknown",
                displayName: "Unknown",
                action: "SAFE",
            };
        }

        const evaluation = await autoModRuleService.evaluateUser({
            id: user.id,
            displayName: user.displayName,
            tags: user.tags,
            bio: user.bio,
            status: user.status,
            statusDescription: user.statusDescription,
            pronouns: user.pronouns,
            ageVerificationStatus: user.ageVerificationStatus,
        }, {}, groupId);

        const config = autoModConfigService.getGroupConfig(groupId);
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
    },

    async processAllGroupMembers(
        groupId: string,
    ): Promise<ScanResult[]> {
        const client = getVRChatClient();
        if (!client) {
            throw new Error("Not authenticated");
        }

        const config = autoModConfigService.getGroupConfig(groupId);
        const rules = config.rules.filter((r) => r.enabled);
        if (rules.length === 0) return [];

        if (!groupAuthorizationService.isGroupAllowed(groupId)) {
            throw new Error("Unauthorized group");
        }

        const autoBanEnabled = config.enableAutoBan === true;
        const results: ScanResult[] = [];

        let offset = 0;
        const limit = 100;
        let hasMore = true;

        logger.info(`[AutoModScanner] Starting full member scan for group ${groupId}...`);

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
                    `[AutoModScanner] Scanning batch of ${members.length} members (Offset: ${offset})...`,
                );

                for (const member of members) {
                    let user = member.user;
                    if (!user) continue;

                    if (!user.bio && !user.tags) {
                        try {
                            const fullUser = await fetchUser(user.id);
                            if (fullUser) {
                                user = { ...user, ...fullUser };
                            }
                            await new Promise(r => setTimeout(r, 100));
                        } catch (e) {
                            logger.warn(`[AutoModScanner] Failed to fetch full details for ${user.displayName} during scan`, e);
                        }
                    }

                    const evaluation = await autoModRuleService.evaluateUser({
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
                                    `[AutoModScanner] [SCAN] Auto-Banned ${user.displayName}: ${evaluation.reason}`,
                                );
                                finalAction = "BANNED";

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
                                    `[AutoModScanner] [SCAN] Failed to auto-ban ${user.displayName}`,
                                    e,
                                );
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
                await new Promise((r) => setTimeout(r, 1000));
            } catch (e) {
                logger.error(`[AutoModScanner] Error scanning group members`, e);
                hasMore = false;
            }
        }

        logger.info(`[AutoModScanner] Scan complete. Found ${results.length} violations.`);
        return results;
    }
};
