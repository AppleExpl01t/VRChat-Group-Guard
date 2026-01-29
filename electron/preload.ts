import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
    log: (level: string, message: string) => ipcRenderer.send('log', level, message),
    getVersion: () => process.versions.electron,

    // Auth API
    login: (credentials: { username: string; password: string; rememberMe?: boolean }) =>
        ipcRenderer.invoke('auth:login', credentials),
    verify2fa: (data: { code: string }) => ipcRenderer.invoke('auth:verify2fa', data),
    checkSession: () => ipcRenderer.invoke('auth:check-session'),
    autoLogin: () => ipcRenderer.invoke('auth:auto-login'),
    hasSavedCredentials: () => ipcRenderer.invoke('credentials:has-saved'),
    loadSavedCredentials: () => ipcRenderer.invoke('credentials:load'),
    logout: (options?: { clearSaved?: boolean }) => ipcRenderer.invoke('auth:logout', options || {}),
    clearCredentials: () => ipcRenderer.invoke('credentials:clear'),

    // Groups API
    getMyGroups: () => ipcRenderer.invoke('groups:get-my-groups'),
    getGroupDetails: (groupId: string) => ipcRenderer.invoke('groups:get-details', { groupId }),
    getGroupPublicDetails: (groupId: string) => ipcRenderer.invoke('groups:get-public-details', { groupId }),
    getGroupMembers: (groupId: string, offset = 0, n = 100) => ipcRenderer.invoke('groups:get-members', { groupId, offset, n }),
    searchGroupMembers: (groupId: string, query: string, n = 20) => ipcRenderer.invoke('groups:search-members', { groupId, query, n }),
    getGroupRequests: (groupId: string) => ipcRenderer.invoke('groups:get-requests', { groupId }),
    respondToGroupRequest: (groupId: string, userId: string, action: 'accept' | 'deny') => ipcRenderer.invoke('groups:respond-request', { groupId, userId, action }),
    getGroupBans: (groupId: string) => ipcRenderer.invoke('groups:get-bans', { groupId }),
    getGroupInstances: (groupId: string) => ipcRenderer.invoke('groups:get-instances', { groupId }),
    onGroupsUpdated: (callback: (data: { groups: any[] }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { groups: any[] }) => callback(data);
        ipcRenderer.on('groups:updated', handler);
        return () => ipcRenderer.removeListener('groups:updated', handler);
    },
    onGroupsCacheReady: (callback: (data: { groupIds: string[] }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { groupIds: string[] }) => callback(data);
        ipcRenderer.on('groups:cache-ready', handler);
        return () => ipcRenderer.removeListener('groups:cache-ready', handler);
    },
    onGroupVerified: (callback: (data: { group: any }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { group: any }) => callback(data);
        ipcRenderer.on('groups:verified', handler);
        return () => ipcRenderer.removeListener('groups:verified', handler);
    },

    banUser: (groupId: string, userId: string) => ipcRenderer.invoke('groups:ban-user', { groupId, userId }),
    unbanUser: (groupId: string, userId: string) => ipcRenderer.invoke('groups:unban-user', { groupId, userId }),

    // Role Management
    getGroupRoles: (groupId: string) => ipcRenderer.invoke('groups:get-roles', { groupId }),
    addMemberRole: (groupId: string, userId: string, roleId: string) => ipcRenderer.invoke('groups:add-member-role', { groupId, userId, roleId }),
    removeMemberRole: (groupId: string, userId: string, roleId: string) => ipcRenderer.invoke('groups:remove-member-role', { groupId, userId, roleId }),

    // Audit API
    getGroupAuditLogs: (groupId: string) => ipcRenderer.invoke('groups:get-audit-logs', { groupId }),

    // Worlds API
    getWorld: (worldId: string) => ipcRenderer.invoke('worlds:get-details', { worldId }),

    // Users API
    getUser: (userId: string) => ipcRenderer.invoke('users:get', { userId }),
    clearUserCache: (userId?: string) => ipcRenderer.invoke('users:clear-cache', { userId }),

    // Pipeline (WebSocket) API
    pipeline: {
        connect: () => ipcRenderer.invoke('pipeline:connect'),
        disconnect: () => ipcRenderer.invoke('pipeline:disconnect'),
        status: () => ipcRenderer.invoke('pipeline:status'),
        reconnect: () => ipcRenderer.invoke('pipeline:reconnect'),

        // Event listeners for real-time updates
        onEvent: (callback: (event: unknown) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
            ipcRenderer.on('pipeline:event', handler);
            return () => ipcRenderer.removeListener('pipeline:event', handler);
        },
        onConnected: (callback: (data: { connected: boolean }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { connected: boolean }) => callback(data);
            ipcRenderer.on('pipeline:connected', handler);
            return () => ipcRenderer.removeListener('pipeline:connected', handler);
        },
        onDisconnected: (callback: (data: { code: number; reason: string; willReconnect: boolean }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { code: number; reason: string; willReconnect: boolean }) => callback(data);
            ipcRenderer.on('pipeline:disconnected', handler);
            return () => ipcRenderer.removeListener('pipeline:disconnected', handler);
        },
        onError: (callback: (data: { message: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
            ipcRenderer.on('pipeline:error', handler);
            return () => ipcRenderer.removeListener('pipeline:error', handler);
        },
    },

    // Log Watcher API
    logWatcher: {
        start: () => ipcRenderer.invoke('log-watcher:start'),
        stop: () => ipcRenderer.invoke('log-watcher:stop'),
        onPlayerJoined: (callback: (event: { displayName: string; userId?: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { displayName: string; userId?: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:player-joined', handler);
            return () => ipcRenderer.removeListener('log:player-joined', handler);
        },
        onPlayerLeft: (callback: (event: { displayName: string; userId?: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { displayName: string; userId?: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:player-left', handler);
            return () => ipcRenderer.removeListener('log:player-left', handler);
        },
        onLocation: (callback: (event: { worldId: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { worldId: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:location', handler);
            return () => ipcRenderer.removeListener('log:location', handler);
        },
        onWorldName: (callback: (event: { name: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { name: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:world-name', handler);
            return () => ipcRenderer.removeListener('log:world-name', handler);
        },
        onGameClosed: (callback: () => void) => {
            const handler = () => callback();
            ipcRenderer.on('log:game-closed', handler);
            return () => ipcRenderer.removeListener('log:game-closed', handler);
        },
        onVoteKick: (callback: (event: { target: string; initiator: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { target: string; initiator: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:vote-kick', handler);
            return () => ipcRenderer.removeListener('log:vote-kick', handler);
        },
        onVideoPlay: (callback: (event: { url: string; requestedBy: string; timestamp: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { url: string; requestedBy: string; timestamp: string }) => callback(data);
            ipcRenderer.on('log:video-play', handler);
            return () => ipcRenderer.removeListener('log:video-play', handler);
        },
    },

    database: {
        getSessions: (groupId?: string) => ipcRenderer.invoke('database:get-sessions', groupId),
        getSessionEvents: (filename: string) => ipcRenderer.invoke('database:get-session-events', filename),
        clearSessions: () => ipcRenderer.invoke('database:clear-sessions'),
        updateSessionWorldName: (sessionId: string, worldName: string) => ipcRenderer.invoke('database:update-session-world-name', sessionId, worldName),
        rallyFromSession: (filename: string) => ipcRenderer.invoke('instance:rally-from-session', { filename }),
        onRallyProgress: (callback: (data: { sent: number; failed: number; total: number; done?: boolean }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { sent: number; failed: number; total: number; done?: boolean }) => callback(data);
            ipcRenderer.on('rally:progress', handler);
            return () => ipcRenderer.removeListener('rally:progress', handler);
        },
    },

    // Window Controls
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),

    // Storage API
    storage: {
        getStatus: () => ipcRenderer.invoke('storage:get-status'),
        selectFolder: () => ipcRenderer.invoke('storage:select-folder'),
        setPath: (path: string) => ipcRenderer.invoke('storage:set-path', path),
        reset: () => ipcRenderer.invoke('storage:reconfigure'), // Alias reset to reconfigure for compatibility
        reconfigure: () => ipcRenderer.invoke('storage:reconfigure'),
    },

    // Instance Presence API
    instance: {
        getCurrentGroup: () => ipcRenderer.invoke('instance:get-current-group'),
        onGroupChanged: (callback: (groupId: string | null) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, groupId: string | null) => callback(groupId);
            ipcRenderer.on('instance:group-changed', handler);
            return () => ipcRenderer.removeListener('instance:group-changed', handler);
        },
        // NEW LIVE OPS API
        scanSector: (groupId?: string) => ipcRenderer.invoke('instance:scan-sector', { groupId }),
        recruitUser: (groupId: string, userId: string, message?: string) => ipcRenderer.invoke('instance:recruit-user', { groupId, userId, message }),
        unbanUser: (groupId: string, userId: string) => ipcRenderer.invoke('instance:unban-user', { groupId, userId }),
        kickUser: (groupId: string, userId: string) => ipcRenderer.invoke('instance:kick-user', { groupId, userId }),

        getRallyTargets: (groupId: string) => ipcRenderer.invoke('instance:get-rally-targets', { groupId }),
        inviteToCurrent: (userId: string, message?: string) => ipcRenderer.invoke('instance:invite-to-current', { userId, message }),
        rallyFromSession: (filename: string, message?: string) => ipcRenderer.invoke('instance:rally-from-session', { filename, message }),
        inviteSelf: (worldId: string, instanceId: string) => ipcRenderer.invoke('instance:invite-self', { worldId, instanceId }),
        closeInstance: (worldId?: string, instanceId?: string) => ipcRenderer.invoke('instance:close-instance', { worldId, instanceId }),
        getInstanceInfo: () => ipcRenderer.invoke('instance:get-instance-info'),
        onEntityUpdate: (callback: (entity: { id: string; displayName: string; rank: string; isGroupMember: boolean; status: string; avatarUrl?: string; lastUpdated: number }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, entity: { id: string; displayName: string; rank: string; isGroupMember: boolean; status: string; avatarUrl?: string; lastUpdated: number }) => callback(entity);
            ipcRenderer.on('instance:entity-update', handler);
            return () => ipcRenderer.removeListener('instance:entity-update', handler);
        },
        massInviteFriends: (options: { filterAutoMod?: boolean; delayMs?: number }) => ipcRenderer.invoke('instance:mass-invite-friends', options || {}),
        onMassInviteProgress: (callback: (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => callback(data);
            ipcRenderer.on('mass-invite:progress', handler);
            return () => ipcRenderer.removeListener('mass-invite:progress', handler);
        }
    },

    // Updater API
    updater: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUpdateAvailable: (callback: (info: any) => void) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handler = (_event: any, info: any) => callback(info);
            ipcRenderer.on('updater:update-available', handler);
            return () => ipcRenderer.removeListener('updater:update-available', handler);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDownloadProgress: (callback: (progressObj: any) => void) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handler = (_event: any, progressObj: any) => callback(progressObj);
            ipcRenderer.on('updater:download-progress', handler);
            return () => ipcRenderer.removeListener('updater:download-progress', handler);
        },
        onUpdateDownloaded: (callback: () => void) => {
            const handler = () => callback();
            ipcRenderer.on('updater:update-downloaded', handler);
            return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
        },
        quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
        checkStatus: () => ipcRenderer.invoke('updater:check-status')
    },

    // AutoMod API
    automod: {
        getRules: (groupId: string) => ipcRenderer.invoke('automod:get-rules', groupId),
        saveRule: (rule: unknown, groupId: string) => ipcRenderer.invoke('automod:save-rule', { rule, groupId }),
        deleteRule: (ruleId: number, groupId: string) => ipcRenderer.invoke('automod:delete-rule', { ruleId, groupId }),
        checkUser: (user: unknown, groupId: string) => ipcRenderer.invoke('automod:check-user', { user, groupId }),
        getHistory: (groupId?: string) => ipcRenderer.invoke('automod:get-history', { groupId }),
        clearHistory: () => ipcRenderer.invoke('automod:clear-history'),
        addToWhitelist: (groupId: string, ruleId: number, target: { userId?: string; groupId?: string }) => ipcRenderer.invoke('automod:add-to-whitelist', { groupId, ruleId, target }),
        onViolation: (callback: (data: { displayName: string; userId: string; action: string; reason: string; ruleId?: number; detectedGroupId?: string }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { displayName: string; userId: string; action: string; reason: string; ruleId?: number; detectedGroupId?: string }) => callback(data);
            ipcRenderer.on('automod:violation', handler);
            return () => ipcRenderer.removeListener('automod:violation', handler);
        },
        testNotification: (groupId: string) => ipcRenderer.invoke('automod:test-notification', { groupId }),
        getWhitelistedEntities: (groupId: string) => ipcRenderer.invoke('automod:getWhitelistedEntities', groupId),
        removeFromWhitelist: (groupId: string, id: string, type: 'user' | 'group') => ipcRenderer.invoke('automod:removeFromWhitelist', { groupId, id, type }),
        getStatus: (groupId: string) => ipcRenderer.invoke('automod:get-status', groupId),
        setAutoProcess: (enabled: boolean, groupId: string) => ipcRenderer.invoke('automod:set-auto-process', { enabled, groupId }),
        setAutoBan: (enabled: boolean, groupId: string) => ipcRenderer.invoke('automod:set-auto-ban', { enabled, groupId }),
        searchGroups: (query: string) => ipcRenderer.invoke('automod:search-groups', query),
        fetchMembers: (groupId: string) => ipcRenderer.invoke('automod:fetch-members', groupId),
        evaluateMember: (args: { groupId: string; member: unknown }) => ipcRenderer.invoke('automod:evaluate-member', args),
        scanGroupMembers: (groupId: string) => ipcRenderer.invoke('automod:scan-group-members', groupId),
    },

    // Instance Guard API
    instanceGuard: {
        getHistory: (groupId: string) => ipcRenderer.invoke('instance-guard:get-history', groupId),
        clearHistory: () => ipcRenderer.invoke('instance-guard:clear-history'),
        onEvent: (callback: (data: unknown) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
            ipcRenderer.on('instance-guard:event', handler);
            return () => ipcRenderer.removeListener('instance-guard:event', handler);
        },
    },

    // OSC API
    osc: {
        getConfig: () => ipcRenderer.invoke('osc:get-config'),
        setConfig: (config: { enabled?: boolean; senderIp?: string; senderPort?: number; receiverPort?: number }) => ipcRenderer.invoke('osc:set-config', config),
        send: (address: string, args: unknown[]) => ipcRenderer.invoke('osc:send', { address, args }),

        getAnnouncementConfig: (groupId: string) => ipcRenderer.invoke('osc:get-announcement-config', groupId),
        setAnnouncementConfig: (groupId: string, config: unknown) => ipcRenderer.invoke('osc:set-announcement-config', { groupId, config })
    },

    // Discord RPC API
    discordRpc: {
        getConfig: () => ipcRenderer.invoke('discord-rpc:get-config'),
        setConfig: (config: { enabled: boolean; showGroupName: boolean; showMemberCount: boolean; showElapsedTime: boolean; customDetails: string; customState: string }) =>
            ipcRenderer.invoke('discord-rpc:set-config', config),
        getStatus: () => ipcRenderer.invoke('discord-rpc:get-status'),
        reconnect: () => ipcRenderer.invoke('discord-rpc:reconnect'),
        disconnect: () => ipcRenderer.invoke('discord-rpc:disconnect'),
    },


    // Discord Webhook API
    webhook: {
        getUrl: (groupId: string) => ipcRenderer.invoke('webhook:get-url', { groupId }),
        setUrl: (groupId: string, url: string) => ipcRenderer.invoke('webhook:set-url', { groupId, url }),
        test: (groupId: string) => ipcRenderer.invoke('webhook:test', { groupId }),
        testMock: (groupId: string) => ipcRenderer.invoke('webhook:test-mock', { groupId }),
    },

    // Watchlist API
    watchlist: {
        getEntities: () => ipcRenderer.invoke('watchlist:get-entities'),
        getEntity: (id: string) => ipcRenderer.invoke('watchlist:get-entity', id),
        saveEntity: (entity: unknown) => ipcRenderer.invoke('watchlist:save-entity', entity),
        deleteEntity: (id: string) => ipcRenderer.invoke('watchlist:delete-entity', id),
        getTags: () => ipcRenderer.invoke('watchlist:get-tags'),
        saveTag: (tag: unknown) => ipcRenderer.invoke('watchlist:save-tag', tag),
        deleteTag: (id: string) => ipcRenderer.invoke('watchlist:delete-tag', id),
        import: (json: string) => ipcRenderer.invoke('watchlist:import', json),
        export: () => ipcRenderer.invoke('watchlist:export'),
        searchScannedUsers: (query: string) => ipcRenderer.invoke('watchlist:search-scanned-users', query),
        onUpdate: (callback: (data: { entities: unknown[]; tags: unknown[] }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { entities: unknown[]; tags: unknown[] }) => callback(data);
            ipcRenderer.on('watchlist:update', handler);
            return () => ipcRenderer.removeListener('watchlist:update', handler);
        }
    },

    // Staff API (shares data with AutoMod whitelist)
    staff: {
        getMembers: (groupId: string) => ipcRenderer.invoke('staff:get-members', groupId),
        addMember: (groupId: string, userId: string) => ipcRenderer.invoke('staff:add-member', { groupId, userId }),
        removeMember: (groupId: string, userId: string) => ipcRenderer.invoke('staff:remove-member', { groupId, userId }),
        getSettings: (groupId: string) => ipcRenderer.invoke('staff:get-settings', groupId),
        setSettings: (groupId: string, settings: unknown) => ipcRenderer.invoke('staff:set-settings', { groupId, settings }),
    },

    // Report API
    report: {
        getTemplates: () => ipcRenderer.invoke('report:get-templates'),
        saveTemplate: (template: unknown) => ipcRenderer.invoke('report:save-template', template),
        deleteTemplate: (id: string) => ipcRenderer.invoke('report:delete-template', id),
        generate: (templateId: string, context: unknown) => ipcRenderer.invoke('report:generate', { templateId, context }),
    },

    // User Profile API (VRCX-style comprehensive profile fetching)
    userProfile: {
        getFullProfile: (userId: string) => ipcRenderer.invoke('userProfile:getFullProfile', userId),
        getCompleteData: (userId: string) => ipcRenderer.invoke('userProfile:getCompleteData', userId),
        getMutualCounts: (userId: string) => ipcRenderer.invoke('userProfile:getMutualCounts', userId),
        getMutualFriends: (userId: string) => ipcRenderer.invoke('userProfile:getMutualFriends', userId),
        getMutualGroups: (userId: string) => ipcRenderer.invoke('userProfile:getMutualGroups', userId),
        setUserNote: (userId: string, note: string) => ipcRenderer.invoke('userProfile:setUserNote', userId, note),
    },

    // Settings API
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        update: (settings: unknown) => ipcRenderer.invoke('settings:update', settings),
        selectAudio: () => ipcRenderer.invoke('settings:select-audio'),
        getAudioData: (path: string) => ipcRenderer.invoke('settings:get-audio', path),
    },

    // Debug API (for developer tools)
    debug: {
        selectFriendJson: () => ipcRenderer.invoke('debug:select-friend-json'),
        bulkFriendFromJson: (jsonPath: string, delayMs?: number) => ipcRenderer.invoke('debug:bulk-friend-from-json', { jsonPath, delayMs }),
        onBulkFriendProgress: (callback: (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => callback(data);
            ipcRenderer.on('bulk-friend:progress', handler);
            return () => ipcRenderer.removeListener('bulk-friend:progress', handler);
        }
    },

    // Friendship Manager API (Phase 2)
    friendship: {
        getStatus: () => ipcRenderer.invoke('friendship:get-status'),
        getGameLog: (limit?: number) => ipcRenderer.invoke('friendship:get-game-log', limit),
        getPlayerLog: (options?: { limit?: number; search?: string; type?: 'join' | 'leave' | 'all' }) =>
            ipcRenderer.invoke('friendship:get-player-log', options),
        getFriendLocations: () => ipcRenderer.invoke('friendship:get-friend-locations'),
        getSocialFeed: (limit?: number) => ipcRenderer.invoke('friendship:get-social-feed', limit),
        getRelationshipEvents: (limit?: number) => ipcRenderer.invoke('friendship:get-relationship-events', limit),
        refreshFriends: () => ipcRenderer.invoke('friendship:refresh-friends'),
        refreshRelationships: () => ipcRenderer.invoke('friendship:refresh-relationships'),
        onUpdate: (callback: (data: unknown) => void) => {
            const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
            ipcRenderer.on('friendship:update', handler);
            return () => ipcRenderer.removeListener('friendship:update', handler);
        },
        getPlayerStats: (userId: string) => ipcRenderer.invoke('friendship:get-player-stats', userId),
        getWorldStats: (worldId: string) => ipcRenderer.invoke('friendship:get-world-stats', worldId),
        getFriendsList: () => ipcRenderer.invoke('friendship:get-friends-list'),
        getMutualsBatch: (userIds: string[]) => ipcRenderer.invoke('friendship:get-mutuals-batch', userIds),
    },

    // Generic IPC Renderer for event listening
    ipcRenderer: {
        on: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
            ipcRenderer.on(channel, callback);
            return () => ipcRenderer.removeListener(channel, callback);
        }
    }
});
