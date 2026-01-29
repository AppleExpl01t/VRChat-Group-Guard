// User type from VRChat API
export interface VRChatUser {
  id: string;
  username: string;
  displayName: string;
  userIcon: string;
  bio?: string;
  currentAvatarImageUrl?: string;
  currentAvatarThumbnailImageUrl?: string;
  status?: string;
  statusDescription?: string;
  state?: string;
  tags?: string[];
  developerType?: string;
  last_login?: string;
  last_platform?: string;
  allowAvatarCopying?: boolean;
  isFriend?: boolean;
  friendKey?: string;
  last_activity?: string;
  bioLinks?: string[];
  date_joined?: string;
  location?: string;
  profilePicOverride?: string;
  friendKey?: string;
  isFriend?: boolean;
  statusHistory?: string[];
  ageVerified?: boolean;
  ageVerificationStatus?: string;
  pronouns?: string;
  // Add additional fields as needed
}

// Group type from VRChat API  
export interface VRChatGroup {
  id: string;
  name: string;
  shortCode: string;
  discriminator?: string;
  description?: string;
  iconUrl?: string;
  iconId?: string;
  bannerUrl?: string;
  bannerId?: string;
  privacy?: string;
  ownerId: string;
  rules?: string;
  links?: string[];
  languages?: string[];
  memberCount: number;
  memberCountSyncedAt?: string;
  isVerified?: boolean;
  joinState?: string;
  tags?: string[];
  galleries?: unknown[];
  createdAt?: string;
  onlineMemberCount?: number;
  membershipStatus?: string;
  myMember?: unknown;
}

export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: VRChatUser;
  requires2FA?: boolean;
  twoFactorMethods?: string[];
  error?: string;
}

export interface AutoLoginResult {
  success: boolean;
  user?: VRChatUser;
  requires2FA?: boolean;
  noCredentials?: boolean;
  error?: string;
}

export interface SessionResult {
  isLoggedIn: boolean;
  user?: VRChatUser;
}

export interface LogoutOptions {
  clearSaved?: boolean;
}

export interface GroupsResult {
  success: boolean;
  groups?: VRChatGroup[];
  error?: string;
}

export interface DiscordRpcConfig {
  enabled: boolean;
  showGroupName: boolean;
  showMemberCount: boolean;
  showElapsedTime: boolean;
  customDetails: string;
  customState: string;
}

export interface AuditLogsResult {
  success: boolean;
  logs?: unknown[];
  error?: string;
}

export interface GroupMember {
  id: string; // "gmem_..."
  groupId: string;
  userId: string;
  isRepresenting: boolean;
  roleIds: string[];
  mangerNotes?: string;
  membershipStatus: string; // "member" | "admin" | "owner"
  visibility: string;
  joinedAt?: string;
  bannedAt?: string;
  user: VRChatUser;
}

export interface GroupRequest {
  id: string;
  user: VRChatUser;
  groupId: string;
  userId: string;
  createdAt: string;
}

export interface GroupBan {
  id: string;
  user: VRChatUser;
  groupId: string;
  userId: string;
  createdAt: string; // or bannedAt
}

export interface VRChatInstance {
  id?: string; // Sometimes missing in group instances - use location or instanceId
  instanceId?: string;
  name?: string; // Instance number like "86267"
  displayName?: string; // Group display name
  location?: string; // Full location string: worldId:instanceId
  worldId?: string;

  // User counts
  n_users?: number;
  userCount?: number;
  memberCount?: number;
  capacity?: number;

  // Instance properties
  ownerId?: string;
  type?: string; // "group", "public", etc.
  groupAccessType?: string; // "public", "plus", "members" for group instances
  ageGate?: boolean; // 18+ age verification required
  region?: string;
  shortName?: string;

  // World data (nested from API)
  world?: {
    id?: string;
    name?: string;
    authorId?: string;
    authorName?: string;
    description?: string;
    capacity?: number;
    imageUrl?: string;
    thumbnailImageUrl?: string;
  };

  // Group data (nested from API)
  group?: {
    id?: string;
    name?: string;
    shortCode?: string;
    discriminator?: string;
  };
}

// Pipeline WebSocket Event Types
export type PipelineEventType =
  // Notification Events
  | 'notification'
  | 'notification-v2'
  | 'notification-v2-update'
  | 'notification-v2-delete'
  | 'see-notification'
  | 'hide-notification'
  | 'response-notification'
  | 'clear-notification'
  // Friend Events
  | 'friend-add'
  | 'friend-delete'
  | 'friend-online'
  | 'friend-active'
  | 'friend-offline'
  | 'friend-update'
  | 'friend-location'
  // User Events
  | 'user-update'
  | 'user-location'
  | 'user-badge-assigned'
  | 'user-badge-unassigned'
  | 'content-refresh'
  // Group Events
  | 'group-joined'
  | 'group-left'
  | 'group-member-updated'
  | 'group-role-updated';

export interface PipelineEvent {
  type: PipelineEventType;
  content: Record<string, unknown>;
  timestamp: string;
}

export interface AutoModRule {
  id: number;
  name: string;
  enabled: boolean;
  type: 'AGE_CHECK' | 'TRUST_CHECK' | 'KEYWORD_BLOCK' | 'WHITELIST_CHECK' | 'BAN_EVASION_CHECK' | 'AGE_VERIFICATION' | 'BLACKLISTED_GROUPS' | 'INSTANCE_18_GUARD' | 'INSTANCE_PERMISSION_GUARD' | 'CLOSE_ALL_INSTANCES';
  config: string;
  actionType: 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY';
  createdAt?: string;
  whitelistedUserIds?: string[];
  whitelistedGroupIds?: string[];
}

// Instance Guard event type
export interface InstanceGuardEvent {
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

// Type for Live Entity (used in instance monitoring)
export interface LiveEntity {
  id: string;
  displayName: string;
  rank: string;
  isGroupMember: boolean;
  status: 'active' | 'kicked' | 'joining';
  avatarUrl?: string;
  lastUpdated: number;
}

// Type for Rally Target
export interface RallyTarget {
  id?: string;
  displayName?: string;
  thumbnailUrl?: string;
}

// Type for Scanned User (users encountered during instance scans)
export interface ScannedUser {
  id: string;
  displayName: string;
  rank: string | null;
  thumbnailUrl: string | null;
  groupId: string | null;
  lastSeenAt: string;
  timesEncountered: number;
}

// Type for AutoMod user check input
export interface AutoModUserInput {
  id: string;
  displayName: string;
  tags?: string[];
  dateJoined?: string;
  trustLevel?: string;
  bio?: string;
  status?: string;
  statusDescription?: string;
  pronouns?: string;
}


// Friendship Manager Types
export interface GameLogEntry {
  timestamp: string;
  worldName: string;
  worldId: string;
  instanceId: string;
  location: string;
  duration?: number;
  leaveTimestamp?: string;
  userCountAtJoin?: number;
  notes?: string;
}

export interface FriendLocation {
  userId: string;
  displayName: string;
  status: string; // 'active', 'busy', 'join me', 'offline'
  location: string;
  worldName?: string;
  lastUpdated: string;
  userIcon?: string;
  profilePicOverride?: string;
  currentAvatarThumbnailImageUrl?: string;
}

export interface SocialFeedEntry {
  id: string;
  type: 'online' | 'offline' | 'location' | 'status' | 'add' | 'remove' | 'notification' | 'avatar';
  userId: string;
  displayName: string;
  timestamp: string;
  details?: string;
  data?: Record<string, unknown>;
}

export interface PlayerLogEntry {
  id: string;
  timestamp: string;
  type: 'join' | 'leave';
  displayName: string;
  userId?: string;
  worldName?: string;
  worldId?: string;
  instanceId?: string;
  location?: string;
}

export interface RelationshipEvent {
  id: string;
  timestamp: string;
  type: 'add' | 'remove' | 'name_change';
  userId: string;
  displayName: string;
  previousName?: string;
  avatarUrl?: string;
}

export interface OscConfig {
  enabled: boolean;
  senderIp: string;
  senderPort: number;
  receiverPort: number;
  suppressChatboxSounds: boolean;
}

export interface WatchedEntity {
  id: string; // usr_..., grp_...
  type: 'user' | 'group' | 'avatar' | 'world';
  displayName: string;
  tags: string[]; // IDs of tags or raw strings
  notes: string;
  priority: number; // -100 to 100
  critical: boolean; // Flag for high alert
  silent: boolean; // Flag for no notification
  createdAt?: number;
  updatedAt?: number;
}

export interface ModerationTag {
  id: string; // slug-style id
  label: string;
  description: string;
  color?: string; // Hex color
}

export interface GroupAnnouncementConfig {
  greetingEnabled: boolean;
  greetingMessage: string;
  greetingMessageMembers?: string;
  greetingMessageRep?: string;
  periodicEnabled: boolean;
  periodicMessage: string;
  periodicIntervalMinutes: number;
  displayDurationSeconds?: number;
}

export interface AppSettings {
  audio: {
    notificationSoundPath: string | null;
    volume: number;
  };
}

export interface ElectronAPI {
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  getVersion: () => string;

  // Auth API
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  verify2fa: (data: { code: string }) => Promise<LoginResult>;
  checkSession: () => Promise<SessionResult>;
  autoLogin: () => Promise<AutoLoginResult>;
  hasSavedCredentials: () => Promise<boolean>;
  loadSavedCredentials: () => Promise<{ username: string; password: string; authCookie?: string } | null>;
  logout: (options?: LogoutOptions) => Promise<{ success: boolean }>;
  clearCredentials: () => Promise<{ success: boolean }>;

  // Groups API
  getMyGroups: () => Promise<GroupsResult>;
  getGroupDetails: (groupId: string) => Promise<{ success: boolean; group?: VRChatGroup; error?: string }>;
  getGroupPublicDetails: (groupId: string) => Promise<{ success: boolean; group?: VRChatGroup; error?: string }>;
  getGroupMembers: (groupId: string, offset?: number, n?: number) => Promise<{ success: boolean; members?: GroupMember[]; error?: string }>;
  searchGroupMembers: (groupId: string, query: string, n?: number) => Promise<{ success: boolean; members?: GroupMember[]; error?: string }>;
  getGroupRequests: (groupId: string) => Promise<{ success: boolean; requests?: GroupRequest[]; error?: string }>;
  respondToGroupRequest: (groupId: string, userId: string, action: 'accept' | 'deny') => Promise<{ success: boolean; error?: string }>;
  getGroupBans: (groupId: string) => Promise<{ success: boolean; bans?: GroupBan[]; error?: string }>;
  getGroupInstances: (groupId: string) => Promise<{ success: boolean; instances?: VRChatInstance[]; error?: string }>;
  onGroupsUpdated: (callback: (data: { groups: any[] }) => void) => () => void;
  onGroupsCacheReady: (callback: (data: { groupIds: string[] }) => void) => () => void;
  onGroupVerified: (callback: (data: { group: any }) => void) => () => void;
  banUser: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  unbanUser: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;

  // Role Management
  getGroupRoles: (groupId: string) => Promise<{ success: boolean; roles?: unknown[]; error?: string }>;
  addMemberRole: (groupId: string, userId: string, roleId: string) => Promise<{ success: boolean; error?: string }>;
  removeMemberRole: (groupId: string, userId: string, roleId: string) => Promise<{ success: boolean; error?: string }>;

  // Audit API
  getGroupAuditLogs: (groupId: string) => Promise<AuditLogsResult>;

  // Worlds API
  getWorld: (worldId: string) => Promise<{ success: boolean; world?: { id: string; name: string; capacity?: number; imageUrl?: string; authorName?: string }; error?: string }>;

  // User API
  getUser: (userId: string) => Promise<{ success: boolean; user?: VRChatUser; error?: string }>;
  clearUserCache: (userId?: string) => Promise<{ success: boolean }>;

  // Pipeline (WebSocket) API for real-time events
  pipeline: {
    connect: () => Promise<{ success: boolean; connected: boolean }>;
    disconnect: () => Promise<{ success: boolean }>;
    status: () => Promise<{ connected: boolean; connecting: boolean; reconnectAttempts: number }>;
    reconnect: () => Promise<{ success: boolean }>;

    // Event listeners - return unsubscribe function
    onEvent: (callback: (event: PipelineEvent) => void) => () => void;
    onConnected: (callback: (data: { connected: boolean }) => void) => () => void;
    onDisconnected: (callback: (data: { code: number; reason: string; willReconnect: boolean }) => void) => () => void;
    onError: (callback: (data: { message: string }) => void) => () => void;
  };

  // Log Watcher API for live log events
  logWatcher: {
    start: () => Promise<{ success: boolean }>;
    stop: () => Promise<{ success: boolean }>;
    onPlayerJoined: (callback: (event: { displayName: string; userId?: string; timestamp: string }) => void) => () => void;
    onPlayerLeft: (callback: (event: { displayName: string; userId?: string; timestamp: string }) => void) => () => void;
    onLocation: (callback: (event: { worldId: string; timestamp: string }) => void) => () => void;
    onWorldName: (callback: (event: { name: string; timestamp: string }) => void) => () => void;
    onGameClosed: (callback: () => void) => () => void;
    onVoteKick: (callback: (event: { target: string; initiator: string; timestamp: string }) => void) => () => void;
    onVideoPlay: (callback: (event: { url: string; requestedBy: string; timestamp: string }) => void) => () => void;
  };

  // Database API for local logging
  database: {
    getSessions: (groupId?: string) => Promise<unknown[]>;
    getSessionEvents: (filename: string) => Promise<unknown[]>;
    clearSessions: () => Promise<boolean>;
    updateSessionWorldName: (sessionId: string, worldName: string) => Promise<boolean>;
    rallyFromSession: (filename: string) => Promise<{
      success: boolean;
      invited?: number;
      failed?: number;
      total?: number;
      error?: string;
      errors?: string[];
    }>;
    onRallyProgress: (callback: (data: { sent: number; failed: number; total: number; done?: boolean }) => void) => () => void;
  };

  // Storage API
  storage: {
    getStatus: () => Promise<{ configured: boolean; path: string; defaultPath: string; lastPath?: string | null }>;
    selectFolder: () => Promise<string | null>;
    setPath: (path: string) => Promise<boolean>;
    reconfigure: () => Promise<boolean>;
  };

  // Instance Presence API
  instance: {
    // Instance
    scanSector: (groupId?: string) => Promise<LiveEntity[]>;
    recruitUser: (groupId: string, userId: string, message?: string) => Promise<{ success: boolean; error?: string; cached?: boolean }>;
    unbanUser: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
    kickUser: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
    getRallyTargets: (groupId: string) => Promise<{ success: boolean; targets?: { id: string; displayName: string; thumbnailUrl: string }[]; error?: string }>;
    inviteToCurrent: (userId: string, message?: string) => Promise<{ success: boolean; error?: string; cached?: boolean }>;
    rallyFromSession: (filename: string, message?: string) => Promise<{ success: boolean; invited?: number; failed?: number; total?: number; error?: string; errors?: string[] }>;
    massInviteFriends: (options: { filterAutoMod?: boolean; delayMs?: number; message?: string }) => Promise<{ success: boolean; invited?: number; skipped?: number; failed?: number; total?: number; error?: string; errors?: string[] }>;
    getInviteSlotsState: () => Promise<{ success: boolean; slots?: { index: number; message: string | null; lastUpdate: number; cooldownRemaining: number }[]; error?: string }>;
    closeInstance: (worldId?: string, instanceId?: string) => Promise<{ success: boolean; error?: string }>;
    inviteSelf: (worldId: string, instanceId: string) => Promise<{ success: boolean; error?: string }>;
    getInstanceInfo: () => Promise<{ success: boolean; worldId?: string; instanceId?: string; name?: string; imageUrl?: string; error?: string }>;
    onEntityUpdate: (callback: (entity: LiveEntity) => void) => () => void;
    onMassInviteProgress: (callback: (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => void) => () => void;

    getCurrentGroup: () => Promise<string | null>;
    onGroupChanged: (callback: (groupId: string | null) => void) => () => void;
  };



  // Updater API
  updater: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdateAvailable: (callback: (info: any) => void) => () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDownloadProgress: (callback: (progressObj: any) => void) => () => void;
    onUpdateDownloaded: (callback: () => void) => () => void;
    quitAndInstall: () => void;
    checkStatus: () => Promise<boolean>;
  };

  // Window Controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // AutoMod API
  automod: {
    getRules: (groupId: string) => Promise<AutoModRule[]>;
    saveRule: (rule: AutoModRule, groupId: string) => Promise<AutoModRule>;
    deleteRule: (ruleId: number, groupId: string) => Promise<boolean>;
    checkUser: (user: AutoModUserInput, groupId: string) => Promise<{ action: 'ALLOW' | 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY'; reason?: string; ruleName?: string }>;
    onViolation: (callback: (data: { displayName: string; userId: string; action: string; reason: string; ruleId?: number; detectedGroupId?: string }) => void) => () => void;
    testNotification: (groupId: string) => Promise<boolean>;
    addToWhitelist: (groupId: string, ruleId: number, target: { userId?: string; groupId?: string }) => Promise<boolean>;
    getWhitelistedEntities: (groupId: string) => Promise<{ users: { id: string; name: string; rules: string[] }[]; groups: { id: string; name: string; rules: string[] }[] }>;
    removeFromWhitelist: (groupId: string, id: string, type: 'user' | 'group') => Promise<boolean>;
    getStatus: (groupId: string) => Promise<{ autoProcess: boolean; autoBan: boolean }>;
    setAutoProcess: (enabled: boolean, groupId: string) => Promise<boolean>;
    setAutoBan: (enabled: boolean, groupId: string) => Promise<boolean>;
    getHistory: (groupId?: string) => Promise<unknown[]>;
    clearHistory: () => Promise<boolean>;
    searchGroups: (query: string) => Promise<{ success: boolean; groups?: VRChatGroup[]; error?: string }>;
    scanGroupMembers: (groupId: string) => Promise<{ success: boolean; results?: ScanResult[]; error?: string }>;
    fetchMembers: (groupId: string) => Promise<{ success: boolean; members: { user: VRChatUser }[]; error?: string }>;
    evaluateMember: (args: { groupId: string; member: { user: VRChatUser } }) => Promise<ScanResult>;
  };

  // Instance Guard API
  instanceGuard?: {
    getHistory: (groupId: string) => Promise<InstanceGuardEvent[]>;
    clearHistory: () => Promise<boolean>;
    onEvent: (callback: (data: InstanceGuardEvent) => void) => () => void;
  };

  // OSC API
  osc: {
    getConfig: () => Promise<OscConfig>;
    setConfig: (config: Partial<OscConfig>) => Promise<OscConfig>;
    send: (address: string, args: unknown[]) => Promise<boolean>;
    getAnnouncementConfig: (groupId: string) => Promise<GroupAnnouncementConfig>;
    setAnnouncementConfig: (groupId: string, config: Partial<GroupAnnouncementConfig>) => Promise<GroupAnnouncementConfig>;
  };

  // Report API
  report: {
    getTemplates: () => Promise<{ id: string; name: string; content: string; type: string }[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generate: (templateId: string, context: any) => Promise<string>;
  };

  // Discord RPC API
  discordRpc: {
    getConfig: () => Promise<DiscordRpcConfig>;
    setConfig: (config: DiscordRpcConfig) => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ connected: boolean; enabled: boolean }>;
    reconnect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean }>;
  };

  // Discord Webhook API
  webhook: {
    getUrl: (groupId: string) => Promise<string>;
    setUrl: (groupId: string, url: string) => Promise<boolean>;
    test: (groupId: string) => Promise<boolean>;
    testMock: (groupId: string) => Promise<boolean>;
  };

  // Watchlist API
  watchlist: {
    getEntities: () => Promise<WatchedEntity[]>;
    getEntity: (id: string) => Promise<WatchedEntity | undefined>;
    saveEntity: (entity: Partial<WatchedEntity>) => Promise<WatchedEntity>;
    deleteEntity: (id: string) => Promise<boolean>;
    getTags: () => Promise<ModerationTag[]>;
    saveTag: (tag: ModerationTag) => Promise<void>;
    deleteTag: (id: string) => Promise<void>;
    import: (json: string) => Promise<boolean>;
    export: () => Promise<string>;
    searchScannedUsers: (query: string) => Promise<ScannedUser[]>;
    onUpdate: (callback: (data: { entities: WatchedEntity[]; tags: ModerationTag[] }) => void) => () => void;
  };

  // Staff API (shares data with AutoMod whitelist)
  staff: {
    getMembers: (groupId: string) => Promise<{ id: string; name: string; rules: string[] }[]>;
    addMember: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
    removeMember: (groupId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
    getSettings: (groupId: string) => Promise<{
      skipAutoModScans: boolean;
      preventKicks: boolean;
      preventBans: boolean;
      allowAllInstances: boolean;
    }>;
    setSettings: (groupId: string, settings: {
      skipAutoModScans?: boolean;
      preventKicks?: boolean;
      preventBans?: boolean;
      allowAllInstances?: boolean;
    }) => Promise<{ success: boolean; error?: string }>;
  };

  // Settings API
  settings: {
    get: () => Promise<AppSettings>;
    update: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    selectAudio: () => Promise<{ path: string; name: string; data: string } | null>;
    getAudioData: (path: string) => Promise<string | null>;
  };

  // User Profile API (comprehensive profile data)
  userProfile: {
    getFullProfile: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    getCompleteData: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    getMutualCounts: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    getMutualFriends: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    getMutualGroups: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    getUserFeedback: (userId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    setUserNote: (userId: string, note: string) => Promise<{ success: boolean; error?: string }>;
  };

  // Debug API (developer tools)
  debug: {
    selectFriendJson: () => Promise<{ success: boolean; path?: string; count?: number; preview?: string[]; error?: string }>;
    bulkFriendFromJson: (jsonPath: string, delayMs?: number) => Promise<{ success: boolean; sent?: number; failed?: number; skipped?: number; total?: number; error?: string; errors?: string[] }>;
    onBulkFriendProgress: (callback: (data: { sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }) => void) => () => void;
  };

  // Friendship Manager API
  friendship: {
    getStatus: () => Promise<{ initialized: boolean }>;
    getGameLog: (limit?: number) => Promise<GameLogEntry[]>;
    getPlayerLog: (options?: { limit?: number; search?: string; type?: 'join' | 'leave' | 'all' }) => Promise<PlayerLogEntry[]>;
    getFriendLocations: () => Promise<FriendLocation[]>;
    getSocialFeed: (limit?: number) => Promise<SocialFeedEntry[]>;
    getRelationshipEvents: (limit?: number) => Promise<RelationshipEvent[]>;
    refreshFriends: () => Promise<{ success: boolean; count?: number; error?: string }>;
    refreshRelationships: () => Promise<{ success: boolean; error?: string }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate: (callback: (data: any) => void) => () => void;
    getPlayerStats: (userId: string) => Promise<{
      success: boolean;
      stats?: {
        firstSeen: string;
        lastSeen: string;
        encounterCount: number;
        timeSpent: number;
        commonWorlds: { name: string; count: number; id: string }[];
      };
      error?: string;
    }>;
    getWorldStats: (worldId: string) => Promise<{
      success: boolean;
      stats?: {
        visitCount: number;
        timeSpent: number;
        lastVisited: string;
        lastInstanceId?: string;
      };
      error?: string;
    }>;
    getFriendsList: () => Promise<FriendListItem[]>;
    getMutualsBatch: (userIds: string[]) => Promise<Record<string, { friends: number; groups: number }>>;
  };
}

export interface FriendListItem extends FriendLocation {
  encounterCount: number;
  timeSpent: number;
  lastSeen: string;
  dateKnown: string;
  friendScore: number;
  // New fields for enhanced display
  mutualFriends?: number;
  mutualGroups?: number;
  pronouns?: string;
  isVRCPlus?: boolean;
  isAgeVerified?: boolean;
  platform?: string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export interface ScanResult {
  userId: string;
  displayName: string;
  userIcon?: string;
  action: 'BANNED' | 'VIOLATION' | 'SAFE';
  reason?: string;
  ruleName?: string;
  ruleId?: number;
}
