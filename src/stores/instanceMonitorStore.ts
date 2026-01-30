
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LivePlayerInfo {
  displayName: string;
  userId?: string; // May be undefined if not parsed from log
  joinTime: number;
}

export interface LiveEntity {
  id: string;
  displayName: string;
  rank: string;
  isGroupMember: boolean;
  status: 'active' | 'kicked' | 'joining' | 'left';
  avatarUrl?: string;
  lastUpdated?: number;
  friendStatus?: 'friend' | 'outgoing' | 'incoming' | 'none';
  friendScore?: number;
  metrics?: {
    encounters: number;
    timeSpent: number;
  };
  isAgeVerified?: boolean;
}

export interface InstanceMonitorState {
  currentWorldId: string | null;
  currentWorldName: string | null;
  currentInstanceId: string | null;
  currentLocation: string | null; // worldId:instanceId
  currentGroupId: string | null;
  instanceImageUrl: string | null;
  players: Record<string, LivePlayerInfo>; // Keyed by displayName
  liveScanResults: LiveEntity[]; // Persisted scan results with history
  history: { timestamp: number; count: number }[]; // Player count history

  // Actions
  handlePlayerJoined: (player: LivePlayerInfo) => void;
  handlePlayerLeft: (displayName: string) => void;
  updateEntity: (entity: LiveEntity) => void;

  addPlayer: (player: LivePlayerInfo) => void;
  removePlayer: (displayName: string) => void;
  setWorldId: (id: string) => void;
  setWorldName: (name: string) => void;
  setInstanceInfo: (id: string, location: string) => void;
  setInstanceImage: (url: string) => void;
  clearInstance: () => void;
  updateLiveScan: (newEntities: LiveEntity[]) => void;
  clearLiveScan: () => void;
  setCurrentGroupId: (groupId: string | null) => void;
  setEntityStatus: (id: string, status: LiveEntity['status']) => void;
}


export const useInstanceMonitorStore = create<InstanceMonitorState>()(
  persist(
    (set, get) => ({
      currentWorldId: null,
      currentWorldName: null,
      currentInstanceId: null,
      currentLocation: null,
      currentGroupId: null,
      instanceImageUrl: null,
      players: {},
      liveScanResults: [],
      history: [],

      // Event-Driven Actions
      handlePlayerJoined: (player: LivePlayerInfo) =>
        set((state) => {
          const existingIndex = state.liveScanResults.findIndex(e => e.displayName === player.displayName);
          let newResults = [...state.liveScanResults];

          if (existingIndex >= 0) {
            newResults[existingIndex] = {
              ...newResults[existingIndex],
              id: player.userId || newResults[existingIndex].id,
              status: 'active',
              lastUpdated: Date.now()
            };
          } else {
            newResults.push({
              id: player.userId || `log:${player.displayName}`,
              displayName: player.displayName,
              rank: 'Loading...',
              isGroupMember: false,
              status: 'active',
              lastUpdated: Date.now()
            });
          }

          const activeCount = newResults.filter(e => e.status === 'active').length;
          let newHistory = [...state.history];
          const lastHistory = newHistory[newHistory.length - 1];

          if (!lastHistory || (Date.now() - lastHistory.timestamp > 1000)) {
            newHistory.push({ timestamp: Date.now(), count: activeCount });
          } else {
            newHistory[newHistory.length - 1] = { timestamp: Date.now(), count: activeCount };
          }

          // Limit history size to prevent localStorage overflow (approx 4 hours of data at 1s resolution = 14400 points)
          // Actually graph only shows 60 points usually, but let's keep 1000.
          if (newHistory.length > 2000) {
            newHistory = newHistory.slice(-2000);
          }

          return {
            players: { ...state.players, [player.displayName]: player },
            liveScanResults: newResults,
            history: newHistory
          };
        }),

      handlePlayerLeft: (displayName: string) =>
        set((state) => {
          const newResults = state.liveScanResults.map(e =>
            e.displayName === displayName ? { ...e, status: 'left' as const, lastUpdated: Date.now() } : e
          );
          const newPlayers = { ...state.players };
          delete newPlayers[displayName];
          return { players: newPlayers, liveScanResults: newResults };
        }),

      updateEntity: (entity: LiveEntity) =>
        set((state) => {
          const index = state.liveScanResults.findIndex(e => e.id === entity.id || e.displayName === entity.displayName);
          if (index === -1) return state;

          const newResults = [...state.liveScanResults];
          newResults[index] = { ...newResults[index], ...entity, status: entity.status || newResults[index].status };

          const activeCount = newResults.filter(e => e.status === 'active').length;
          let newHistory = [...state.history];
          const lastHistory = newHistory[newHistory.length - 1];

          if (!lastHistory || (Date.now() - lastHistory.timestamp > 1000)) {
            newHistory.push({ timestamp: Date.now(), count: activeCount });
          } else {
            newHistory[newHistory.length - 1] = { timestamp: Date.now(), count: activeCount };
          }

          if (newHistory.length > 2000) newHistory = newHistory.slice(-2000);

          return { liveScanResults: newResults, history: newHistory };
        }),

      addPlayer: (player) => get().handlePlayerJoined(player),
      removePlayer: (displayName) => get().handlePlayerLeft(displayName),
      setWorldId: (id) => set({ currentWorldId: id }),
      setWorldName: (name) => set({ currentWorldName: name }),
      setInstanceInfo: (id, location) => set((state) => {
        if (state.currentInstanceId !== id) {
          // New Instance: Clear ephemeral state but maybe keep history if we want continuous timeline? 
          // Usually graph resets on new instance.
          return {
            currentInstanceId: id,
            currentLocation: location,
            currentWorldId: null,
            currentWorldName: null,
            players: {},
            liveScanResults: [],
            history: []
          };
        }
        if (state.currentLocation === location) return state;
        return { currentLocation: location };
      }),
      setCurrentGroupId: (groupId) => set({ currentGroupId: groupId }),
      setInstanceImage: (url) => set({ instanceImageUrl: url }),
      clearInstance: () => set({ players: {}, currentWorldId: null, currentWorldName: null, currentInstanceId: null, currentLocation: null, liveScanResults: [] }),
      updateLiveScan: (newEntities) => set((state) => {
        const nextMap = new Map<string, LiveEntity>();
        state.liveScanResults.forEach(e => nextMap.set(e.id, e));
        newEntities.forEach(r => nextMap.set(r.id, { ...(nextMap.get(r.id) || {}), ...r, status: 'active' }));
        return { liveScanResults: Array.from(nextMap.values()) };
      }),
      clearLiveScan: () => set({ liveScanResults: [] }),
      setEntityStatus: (id, status) => set((state) => ({
        liveScanResults: state.liveScanResults.map(e => e.id === id ? { ...e, status } : e)
      }))
    }),
    {
      name: 'instance-monitor-storage', // unique name
      partialize: (state) => ({
        // Only persist graph history and maybe location context
        history: state.history,
        currentInstanceId: state.currentInstanceId,
        currentWorldName: state.currentWorldName,
        liveScanResults: state.liveScanResults
      }),
    }
  )
);
