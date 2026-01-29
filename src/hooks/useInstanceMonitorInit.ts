import { useEffect, useRef } from "react";
import {
  useInstanceMonitorStore,
  type LivePlayerInfo,
} from "../stores/instanceMonitorStore";
import { useGroupStore } from "../stores/groupStore";

export function useInstanceMonitorInit(isAuthenticated: boolean) {
  const addPlayer = useInstanceMonitorStore(state => state.addPlayer);
  const removePlayer = useInstanceMonitorStore(state => state.removePlayer);
  const setWorldId = useInstanceMonitorStore(state => state.setWorldId);
  const setInstanceInfo = useInstanceMonitorStore(state => state.setInstanceInfo);
  const setWorldName = useInstanceMonitorStore(state => state.setWorldName);
  const setInstanceImage = useInstanceMonitorStore(state => state.setInstanceImage);
  const clearInstance = useInstanceMonitorStore(state => state.clearInstance);
  const clearLiveScan = useInstanceMonitorStore(state => state.clearLiveScan);
  const setCurrentGroupId = useInstanceMonitorStore(state => state.setCurrentGroupId);

  const { isRoamingMode, exitRoamingMode } = useGroupStore();

  // Clear live scan history when exiting roaming mode
  const prevRoamingRef = useRef(isRoamingMode);
  useEffect(() => {
    if (prevRoamingRef.current && !isRoamingMode) {
      clearLiveScan();
    }
    prevRoamingRef.current = isRoamingMode;
  }, [isRoamingMode, clearLiveScan]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch initial group state
    window.electron.instance
      .getCurrentGroup()
      .then((groupId) => {
        setCurrentGroupId(groupId);
      })
      .catch((err) => {
        console.error("Failed to get current group:", err);
      });

    // Setup event listeners
    const cleanupJoined = window.electron.logWatcher.onPlayerJoined((event) => {
      const player: LivePlayerInfo = {
        displayName: event.displayName,
        userId: event.userId,
        joinTime: new Date(event.timestamp).getTime(),
      };
      addPlayer(player);
    });

    const cleanupLeft = window.electron.logWatcher.onPlayerLeft((event) => {
      removePlayer(event.displayName);
    });

    const cleanupLocation = window.electron.logWatcher.onLocation(
      async (event) => {
        // NOTE: We don't call clearInstance() here - setInstanceInfo will only clear
        // when the instance ID actually changes. This preserves cache when rejoining
        // the same instance.
        // Extended event type for instance info
        interface LocationEventExtended {
          worldId: string;
          timestamp: string;
          instanceId?: string;
          location?: string;
        }
        const extEvent = event as LocationEventExtended;

        // 1. Set Instance Info FIRST (This might clear currentWorldId in the store)
        if (extEvent.instanceId && extEvent.location) {
          setInstanceInfo(extEvent.instanceId, extEvent.location);
        }

        // 2. Set World ID SECOND (To ensure it persists)
        setWorldId(event.worldId);

        // Fetch world details if we can (to fix "Unknown World")
        try {
          const result = await window.electron.getWorld(event.worldId);
          if (result.success && result.world) {
            setWorldName(result.world.name);
            // Assuming world object has imageUrl or thumbnailImageUrl
            const worldData = result.world as {
              id: string;
              name: string;
              imageUrl?: string;
              thumbnailImageUrl?: string;
            };
            const img = worldData.imageUrl || worldData.thumbnailImageUrl;
            if (img) setInstanceImage(img);
          }
        } catch (e) {
          console.error("Failed to fetch world name", e);
        }
      },
    );

    const cleanupWorldName = window.electron.logWatcher.onWorldName((event) => {
      setWorldName(event.name);
    });

    const cleanupGroup = window.electron.instance.onGroupChanged((groupId) => {
      setCurrentGroupId(groupId);
    });

    const cleanupGameClosed = window.electron.logWatcher.onGameClosed(() => {
      clearInstance();
      clearLiveScan();
      setCurrentGroupId(null);
      exitRoamingMode();
    });

    // Start watching logs AFTER listeners are set up
    window.electron.logWatcher.start();

    return () => {
      cleanupJoined();
      cleanupLeft();
      cleanupLocation();
      cleanupWorldName();
      cleanupGroup();
      cleanupGameClosed();
      window.electron.logWatcher.stop();
    };
  }, [
    isAuthenticated,
    addPlayer,
    removePlayer,
    setWorldId,
    setWorldName,
    clearInstance,
    setInstanceInfo,
    setInstanceImage,
    setCurrentGroupId,
    clearLiveScan,
    exitRoamingMode,
  ]);
}
