import { create } from 'zustand';
import { getErrorMessage } from '../utils/errorUtils';
import type { GroupRequest, GroupBan, GroupMember, VRChatInstance, PipelineEvent } from '../types/electron';

// Simple debounce utility to prevent rapid API calls from pipeline events
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

// Debounced fetch functions - created once outside the store
// These prevent rapid-fire API calls when multiple pipeline events arrive
let debouncedFetchMembers: ((groupId: string) => void) | null = null;
let debouncedFetchGroups: (() => void) | null = null;

interface Group {
  id: string;
  name: string;
  shortCode: string;
  bannerUrl?: string;
  iconUrl?: string;
  ownerId: string;
  memberCount: number;
  onlineMemberCount?: number;
  activeInstanceCount?: number;
}

// Refresh intervals in milliseconds
export const REFRESH_INTERVALS = {
  instances: 10000,   // 10 seconds
  requests: 30000,    // 30 seconds
  bans: 60000,        // 1 minute
  members: 120000,    // 2 minutes
} as const;

interface GroupState {
  myGroups: Group[];
  selectedGroup: Group | null;
  isLoading: boolean;
  error: string | null;
  isRoamingMode: boolean;

  // Data for selected group (cached between tab switches)
  requests: GroupRequest[];
  bans: GroupBan[];
  members: GroupMember[];
  instances: VRChatInstance[];
  
  // Loading states
  isRequestsLoading: boolean;
  isBansLoading: boolean;
  isMembersLoading: boolean;
  isInstancesLoading: boolean;

  // Timestamps for last successful fetch
  lastFetchedAt: {
    requests: number;
    bans: number;
    members: number;
    instances: number;
  };

  // Pipeline real-time event indicators
  hasRealtimeUpdate: boolean;
  lastPipelineEvent: PipelineEvent | null;

  fetchMyGroups: () => Promise<void>;
  selectGroup: (group: Group | null) => void;
  
  fetchGroupRequests: (groupId: string) => Promise<void>;
  fetchGroupBans: (groupId: string) => Promise<void>;
  fetchGroupMembers: (groupId: string, offset?: number) => Promise<void>;
  fetchGroupInstances: (groupId: string) => Promise<void>;
  respondToRequest: (groupId: string, userId: string, action: 'accept' | 'deny') => Promise<{ success: boolean; error?: string }>;
  
  // Get timestamp helper
  getLastFetchedAt: (type: keyof typeof REFRESH_INTERVALS) => number;
  
  // Pipeline event handlers
  handlePipelineEvent: (event: PipelineEvent) => void;
  clearRealtimeUpdate: () => void;
  
  enterRoamingMode: () => void;
  exitRoamingMode: () => void;
  
  loadMoreMembers: (groupId: string) => Promise<void>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  myGroups: [],
  selectedGroup: null,
  isRoamingMode: false,
  isLoading: false,
  error: null,
  
  requests: [],
  bans: [],
  members: [],
  instances: [],
  
  isRequestsLoading: false,
  isBansLoading: false,
  isMembersLoading: false,
  isInstancesLoading: false,

  lastFetchedAt: {
    requests: 0,
    bans: 0,
    members: 0,
    instances: 0,
  },

  hasRealtimeUpdate: false,
  lastPipelineEvent: null,

  getLastFetchedAt: (type) => get().lastFetchedAt[type],

  fetchMyGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electron.getMyGroups();
      if (result.success && result.groups) {
        set({ myGroups: result.groups as Group[], isLoading: false });
      } else {
        set({ error: result.error || 'Failed to fetch groups', isLoading: false });
      }
    } catch (err: unknown) {
      set({ error: getErrorMessage(err) || 'Failed to fetch groups', isLoading: false });
    }
  },

  selectGroup: (group) => {
    // Keep cached data when switching back to same group
    const currentGroup = get().selectedGroup;
    set({ isRoamingMode: false }); // Always exit roaming mode when selecting a group (or null)
    
    if (currentGroup?.id === group?.id) {
         return;
    }
    
    // Clear data only when switching to a different group
    set({ 
      selectedGroup: group, 
      requests: [], 
      bans: [], 
      members: [], 
      instances: [],
      lastFetchedAt: { requests: 0, bans: 0, members: 0, instances: 0 },
      hasRealtimeUpdate: false,
      lastPipelineEvent: null
    });
  },

  // ... (unchanged methods)



  fetchGroupRequests: async (groupId: string) => {
    set({ isRequestsLoading: true });
    try {
      const result = await window.electron.getGroupRequests(groupId);
      if (result.success && result.requests) {
        set({ 
          requests: result.requests,
          lastFetchedAt: { ...get().lastFetchedAt, requests: Date.now() }
        });
      }
    } catch (error) {
       console.error('Failed to fetch requests', error);
    } finally {
        set({ isRequestsLoading: false });
    }
  },

  fetchGroupBans: async (groupId: string) => {
    set({ isBansLoading: true });
    try {
      const result = await window.electron.getGroupBans(groupId);
      if (result.success && result.bans) {
        set({ 
          bans: result.bans,
          lastFetchedAt: { ...get().lastFetchedAt, bans: Date.now() }
        });
      }
    } catch (error) {
       console.error('Failed to fetch bans', error);
    } finally {
        set({ isBansLoading: false });
    }
  },

  fetchGroupMembers: async (groupId: string, offset = 0) => {
    set({ isMembersLoading: true });
    try {
      const result = await window.electron.getGroupMembers(groupId, offset, 100);
      if (result.success && result.members) {
        set((state) => ({ 
            members: offset === 0 ? result.members! : [...state.members, ...result.members!],
            lastFetchedAt: { ...state.lastFetchedAt, members: Date.now() }
        }));
      }
    } catch (error) {
       console.error('Failed to fetch members', error);
    } finally {
        set({ isMembersLoading: false });
    }
  },

  fetchGroupInstances: async (groupId: string) => {
    set({ isInstancesLoading: true });
    try {
      const result = await window.electron.getGroupInstances(groupId);
      if (result.success && result.instances) {
        set({ 
          instances: result.instances,
          lastFetchedAt: { ...get().lastFetchedAt, instances: Date.now() }
        });
      }
    } catch (error) {
       console.error('Failed to fetch instances', error);
    } finally {
        set({ isInstancesLoading: false });
    }
  },

  respondToRequest: async (groupId: string, userId: string, action: 'accept' | 'deny') => {
      try {
          const result = await window.electron.respondToGroupRequest(groupId, userId, action);
          if (result.success) {
              set(state => ({
                  requests: state.requests.filter(req => req.user.id !== userId)
              }));
              // Optionally fetch members if accepted, but pipeline usually handles it
              if (action === 'accept') {
                   // Optimistic update or waiting for pipeline
              }
          } else {
              console.error(`Failed to ${action} request:`, result.error);
          }
          return result;
      } catch (error) {
          console.error(`Failed to ${action} request:`, error);
          return { success: false, error: getErrorMessage(error) };
      }
  },

  // ========================================
  // PIPELINE EVENT HANDLING
  // ========================================

  handlePipelineEvent: (event: PipelineEvent) => {
    const state = get();
    const selectedGroupId = state.selectedGroup?.id;
    
    // Initialize debounced functions lazily (need access to store methods)
    if (!debouncedFetchMembers) {
      debouncedFetchMembers = debounce((groupId: string) => {
        get().fetchGroupMembers(groupId);
      }, 1000); // 1 second debounce
    }
    if (!debouncedFetchGroups) {
      debouncedFetchGroups = debounce(() => {
        get().fetchMyGroups();
      }, 1000); // 1 second debounce
    }
    
    // Extract groupId from event content if present
    const eventGroupId = (event.content as { groupId?: string; member?: { groupId?: string }; role?: { groupId?: string } })
      .groupId || 
      (event.content as { member?: { groupId?: string } }).member?.groupId ||
      (event.content as { role?: { groupId?: string } }).role?.groupId;

    switch (event.type) {
      case 'group-member-updated':
        // If this is for our selected group, trigger a debounced members refresh
        if (eventGroupId && eventGroupId === selectedGroupId) {
          set({ hasRealtimeUpdate: true, lastPipelineEvent: event });
          // Debounced to prevent rapid API calls when multiple events arrive
          debouncedFetchMembers(selectedGroupId);
        }
        break;

      case 'group-role-updated':
        // Role changes can affect permissions - refresh members (debounced)
        if (eventGroupId && eventGroupId === selectedGroupId) {
          set({ hasRealtimeUpdate: true, lastPipelineEvent: event });
          debouncedFetchMembers(selectedGroupId);
        }
        break;

      case 'group-joined':
        // User (logged-in user) joined a group - refresh group list (debounced)
        set({ hasRealtimeUpdate: true, lastPipelineEvent: event });
        debouncedFetchGroups();
        break;

      case 'group-left':
        // User (logged-in user) left a group - refresh group list (debounced)
        set({ hasRealtimeUpdate: true, lastPipelineEvent: event });
        debouncedFetchGroups();
        // If we left the currently selected group, deselect it
        if (eventGroupId && eventGroupId === selectedGroupId) {
          set({ selectedGroup: null });
        }
        break;

      default:
        // Other events don't affect group state
        break;
    }
  },

  clearRealtimeUpdate: () => {
    set({ hasRealtimeUpdate: false });
  },

  enterRoamingMode: () => {
    set({ 
        selectedGroup: null, 
        isRoamingMode: true,
        requests: [], 
        bans: [], 
        members: [], 
        instances: [],
        lastFetchedAt: { requests: 0, bans: 0, members: 0, instances: 0 },
        hasRealtimeUpdate: false,
        lastPipelineEvent: null
    });
  },

  exitRoamingMode: () => {
    set({ isRoamingMode: false });
  },

  loadMoreMembers: async (groupId: string) => {
      const state = get();
      if (state.isMembersLoading) return;
      
      const currentCount = state.members.length;
      // Safety: Don't load more if we probably have all of them (sanity check)
      // but VRChat member counts can be desync'd, so relying on return count is better.
      
      set({ isMembersLoading: true });
      try {
        const result = await window.electron.getGroupMembers(groupId, currentCount, 100);
        if (result.success && result.members) {
           if (result.members.length === 0) {
               // End of list reached
           } else {
               set((prev) => ({
                   members: [...prev.members, ...result.members!],
                   lastFetchedAt: { ...prev.lastFetchedAt, members: Date.now() }
               }));
           }
        }
      } catch (error) {
         console.error('Failed to load more members', error);
      } finally {
          set({ isMembersLoading: false });
      }
  }
}));

// ========================================
// PIPELINE SUBSCRIPTION HELPER
// ========================================

/**
 * Initialize pipeline event subscription for the group store.
 * Call this from a React effect or at app startup.
 * Returns cleanup function.
 */
export function initGroupStorePipelineSubscription(): () => void {
  const store = useGroupStore.getState();
  
  // Subscribe to group-related events
  const unsubMember = subscribeToPipelineEvent('group-member-updated', store.handlePipelineEvent);
  const unsubRole = subscribeToPipelineEvent('group-role-updated', store.handlePipelineEvent);
  const unsubJoined = subscribeToPipelineEvent('group-joined', store.handlePipelineEvent);
  const unsubLeft = subscribeToPipelineEvent('group-left', store.handlePipelineEvent);

  return () => {
    unsubMember();
    unsubRole();
    unsubJoined();
    unsubLeft();
  };
}

// Helper to subscribe to pipeline events (uses pipelineStore)
function subscribeToPipelineEvent(
  type: string, 
  callback: (event: PipelineEvent) => void
): () => void {
  // Import dynamically to avoid circular deps
  // In practice, this should be handled by usePipelineStore.subscribe
  // For now, we'll use a simple event pattern
  
  // This is a placeholder - the actual subscription will be done
  // in the app initialization using usePipelineStore
  void type;
  void callback;
  return () => {
    // Cleanup
  };
}
