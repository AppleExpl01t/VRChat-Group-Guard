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
    type: 'AGE_CHECK' | 'TRUST_CHECK' | 'KEYWORD_BLOCK' | 'WHITELIST_CHECK' | 'BAN_EVASION_CHECK';
    config: string;
    actionType: 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY';
    createdAt?: string;
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

export interface OscConfig {
    enabled: boolean;
    senderIp: string;
    senderPort: number;
    receiverPort: number;
}

export interface GroupAnnouncementConfig {
    greetingEnabled: boolean;
    greetingMessage: string;
    greetingMessageMembers?: string;
    periodicEnabled: boolean;
    periodicMessage: string;
    periodicIntervalMinutes: number;
    displayDurationSeconds?: number;
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
  getGroupMembers: (groupId: string, offset?: number, n?: number) => Promise<{ success: boolean; members?: GroupMember[]; error?: string }>;
  searchGroupMembers: (groupId: string, query: string, n?: number) => Promise<{ success: boolean; members?: GroupMember[]; error?: string }>;
  getGroupRequests: (groupId: string) => Promise<{ success: boolean; requests?: GroupRequest[]; error?: string }>;
  respondToGroupRequest: (groupId: string, userId: string, action: 'accept' | 'deny') => Promise<{ success: boolean; error?: string }>;
  getGroupBans: (groupId: string) => Promise<{ success: boolean; bans?: GroupBan[]; error?: string }>;
  getGroupInstances: (groupId: string) => Promise<{ success: boolean; instances?: VRChatInstance[]; error?: string }>;
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
  };

  // Database API for local logging
  database: {
      getSessions: (groupId?: string) => Promise<unknown[]>;
      getSessionEvents: (filename: string) => Promise<unknown[]>;
      clearSessions: () => Promise<boolean>;
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
      getStatus: () => Promise<{ configured: boolean; path: string; defaultPath: string }>;
      selectFolder: () => Promise<string | null>;
      setPath: (path: string) => Promise<boolean>;
  };

  // UI Layout Store (for dashboard layout persistence)
  uiLayout: {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: unknown) => Promise<void>;
      delete: (key: string) => Promise<void>;
      has: (key: string) => Promise<boolean>;
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
    massInviteFriends: (options: { filterAutoMod?: boolean; delayMs?: number; message?: string }) => Promise<{ success: boolean; invited?: number; skipped?: number; failed?: number; total?: number; error?: string }>;
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
      onUpdateAvailable: (callback: () => void) => () => void;
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
      getRules: () => Promise<AutoModRule[]>;
      saveRule: (rule: AutoModRule) => Promise<AutoModRule>;
      deleteRule: (ruleId: number) => Promise<boolean>;
      checkUser: (user: AutoModUserInput) => Promise<{ action: 'ALLOW' | 'REJECT' | 'AUTO_BLOCK' | 'NOTIFY_ONLY'; reason?: string; ruleName?: string }>;
      onViolation: (callback: (data: { displayName: string; userId: string; action: string; reason: string }) => void) => () => void;
      testNotification: () => Promise<boolean>;
      getLiveAutoBan: () => Promise<boolean>;
      setLiveAutoBan: (enabled: boolean) => Promise<boolean>;
  };

  // OSC API
  osc: {
      getConfig: () => Promise<OscConfig>;
      setConfig: (config: Partial<OscConfig>) => Promise<OscConfig>;
      send: (address: string, args: unknown[]) => Promise<boolean>;
      getAnnouncementConfig: (groupId: string) => Promise<GroupAnnouncementConfig>;
      setAnnouncementConfig: (groupId: string, config: Partial<GroupAnnouncementConfig>) => Promise<GroupAnnouncementConfig>;
  };

  // Discord RPC API
  discordRpc: {
      getConfig: () => Promise<DiscordRpcConfig>;
      setConfig: (config: DiscordRpcConfig) => Promise<{ success: boolean }>;
      getStatus: () => Promise<{ connected: boolean; enabled: boolean }>;
      reconnect: () => Promise<{ success: boolean; error?: string }>;
      reconnect: () => Promise<{ success: boolean; error?: string }>;
      disconnect: () => Promise<{ success: boolean }>;
  };

  // Analytics API
  stats: {
      getActivity: (groupId: string, days?: number) => Promise<{ traffic: unknown[], automod: unknown[] }>;
      getHeatmap: (groupId: string) => Promise<unknown[]>;
  };

  // Discord Webhook API
  webhook: {
      getUrl: (groupId: string) => Promise<string>;
      setUrl: (groupId: string, url: string) => Promise<boolean>;
      test: (groupId: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
