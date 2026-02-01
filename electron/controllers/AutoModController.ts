import { ipcMain } from "electron";
import log from "electron-log";
import { autoModConfigService } from "../services/AutoModConfigService";
import { autoModRuleService } from "../services/AutoModRuleService";
import { databaseService } from "../services/DatabaseService";
import { instanceGuardService } from "../services/InstanceGuardService";
import { windowService } from "../services/WindowService";
import { vrchatApiService } from "../services/VRChatApiService";
import { autoModService } from "../services/AutoModService";
import { autoModScannerService } from "../services/AutoModScannerService";
import { serviceEventBus } from "../services/ServiceEventBus";

const logger = log.scope("AutoModController");

export const setupAutoModHandlers = () => {
  logger.info("Initializing AutoMod handlers...");

  // Subscribe to group updates to triggering re-scan
  serviceEventBus.on("groups-updated", () => {
    logger.info("[AutoMod] Re-scanning pending requests.");
    setTimeout(() => {
      autoModService.triggerPendingRequestScan().catch((err) =>
        logger.error("AutoMod trigger failed", err),
      );
    }, 2000);
  });

  // Handlers
  ipcMain.handle("automod:get-rules", (_, groupId: string) => {
    if (!groupId) return [];
    return autoModConfigService.getGroupConfig(groupId).rules;
  });

  ipcMain.handle("automod:get-status", (_, groupId: string) => {
    if (!groupId) return { autoProcess: false, autoBan: false };
    const config = autoModConfigService.getGroupConfig(groupId);
    return {
      autoProcess: config.enableAutoProcess,
      autoBan: config.enableAutoBan,
    };
  });

  ipcMain.handle("automod:set-auto-process", (_e, { groupId, enabled }) => {
    const config = autoModConfigService.getGroupConfig(groupId);
    config.enableAutoProcess = enabled;
    autoModConfigService.saveGroupConfig(groupId, config);

    logger.info(
      `[AutoMod] Auto-Process enabled for group ${groupId}.`,
    );

    // Call into Service to clear cache
    autoModService.resetCache();

    if (enabled) {
      setTimeout(() => {
        autoModService.triggerPendingRequestScan().catch((err) =>
          logger.error("AutoMod trigger failed", err),
        );
      }, 1000);
    }

    return enabled;
  });

  ipcMain.handle("automod:set-auto-ban", (_e, { groupId, enabled }) => {
    const config = autoModConfigService.getGroupConfig(groupId);
    config.enableAutoBan = enabled;
    autoModConfigService.saveGroupConfig(groupId, config);

    autoModService.resetCache();

    return enabled;
  });

  ipcMain.handle("automod:save-rule", (_e, { groupId, rule }) => {
    const config = autoModConfigService.getGroupConfig(groupId);
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
    autoModConfigService.saveGroupConfig(groupId, { ...config, rules });
    return rule;
  });

  ipcMain.handle("automod:delete-rule", (_e, { groupId, ruleId }) => {
    const config = autoModConfigService.getGroupConfig(groupId);
    const rules = config.rules;
    const newRules = rules.filter((r) => r.id !== ruleId);
    autoModConfigService.saveGroupConfig(groupId, { ...config, rules: newRules });
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
      autoModService.resetCache();
      return true;
    } catch (error) {
      logger.error("Failed to clear AutoMod history", error);
      return false;
    }
  });

  ipcMain.handle("automod:check-user", async (_e, { user, groupId }) => {
    return autoModRuleService.evaluateUser(user, {}, groupId);
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
    const config = autoModConfigService.getGroupConfig(groupId);
    const rules = config.rules;
    const userMap = new Map<string, { id: string, name: string, rules: string[] }>();
    const groupMap = new Map<string, { id: string, name: string, rules: string[] }>();

    for (const rule of rules) {
      if (rule.whitelistedUserIds) {
        for (const userId of rule.whitelistedUserIds) {
          if (!userId) continue;
          if (!userMap.has(userId)) {
            let name = userId;
            try {
              const result = await vrchatApiService.getUser(userId);
              if (result.success && result.data) name = result.data.displayName;
            } catch { /* ignore */ }

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
              if (result.success && result.data) name = result.data.name;
            } catch { /* ignore */ }
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
    const config = autoModConfigService.getGroupConfig(groupId);
    const rules = config.rules;
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
      if (ruleUpdated) updated = true;
    }

    if (updated) {
      autoModConfigService.saveGroupConfig(groupId, { ...config, rules });
      return true;
    }
    return false;
  });

  ipcMain.handle("automod:search-groups", async (_e, query: string) => {
    try {
      const result = await vrchatApiService.searchGroups(query);
      if (result.success && result.data) {
        return { success: true, groups: result.data };
      }
      return { success: false, error: result.error || "Failed to search groups" };
    } catch (error) {
      logger.error("Failed to search groups", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("automod:fetch-members", async (_, groupId) => {
    return await autoModScannerService.processFetchGroupMembers(groupId);
  });

  ipcMain.handle("automod:evaluate-member", async (_, { groupId, member }) => {
    return await autoModScannerService.processEvaluateMember(groupId, member);
  });

  ipcMain.handle("automod:add-to-whitelist", async (_e, { groupId, ruleId, target }) => {
    return autoModRuleService.addToWhitelist(groupId, ruleId, target);
  });

  ipcMain.handle("automod:scan-group-members", async (_e, groupId: string) => {
    try {
      const results = await autoModScannerService.processAllGroupMembers(groupId);
      return { success: true, results };
    } catch (error) {
      logger.error("Failed to scan group members", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("automod:scan-users-batch", async (_, { users, groupId }) => {
    if (!users || !Array.isArray(users)) return { success: false, error: "Invalid users list" };
    
    // Convert generic user objects to GroupMember-like structure for the scanner service
    // The scanner service expects GroupMember but primarily uses the 'user' property inside it for valuation
    const results = [];
    
    for (const user of users) {
        // Mock a group member structure since we might be scanning non-members too
        const memberStub = {
            user: user,
            userId: user.id
        };
        
        // Use existing single-member evaluate logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await autoModScannerService.processEvaluateMember(groupId, memberStub as any);
        if (result.action !== "SAFE") {
            results.push(result);
        }
    }
    
    return { success: true, results };
  });

  // ===== INSTANCE GUARD HANDLERS =====
  ipcMain.handle("instance-guard:get-history", (_e, groupId: string) => {
    return instanceGuardService.getHistory(groupId);
  });

  ipcMain.handle("instance-guard:clear-history", () => {
    return instanceGuardService.clearHistory();
  });
};
