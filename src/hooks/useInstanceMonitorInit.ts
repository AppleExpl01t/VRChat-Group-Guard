
import { useEffect, useRef } from 'react';
import { useInstanceMonitorStore, type LivePlayerInfo } from '../stores/instanceMonitorStore';
import { useGroupStore } from '../stores/groupStore';

export function useInstanceMonitorInit(isAuthenticated: boolean) {
  const { addPlayer, removePlayer, setWorldId, setInstanceInfo, setWorldName, setInstanceImage, clearInstance, clearLiveScan, setCurrentGroupId } = useInstanceMonitorStore();
  const { isRoamingMode } = useGroupStore();

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

    // Start watching logs
    window.electron.logWatcher.start();
    
    // Fetch initial group state
    window.electron.instance.getCurrentGroup().then(groupId => {
        setCurrentGroupId(groupId);
    });

    // Setup event listeners
    const cleanupJoined = window.electron.logWatcher.onPlayerJoined((event) => {
      const player: LivePlayerInfo = {
        displayName: event.displayName,
        userId: event.userId,
        joinTime: new Date(event.timestamp).getTime()
      };
      addPlayer(player);
    });

    const cleanupLeft = window.electron.logWatcher.onPlayerLeft((event) => {
      removePlayer(event.displayName);
    });

    const cleanupLocation = window.electron.logWatcher.onLocation(async (event) => {
      // New location detected, clear previous instance data
      clearInstance();
      setWorldId(event.worldId);
      
      // Extended event type for instance info
      interface LocationEventExtended {
        worldId: string;
        timestamp: string;
        instanceId?: string;
        location?: string;
      }
      const extEvent = event as LocationEventExtended;
      if (extEvent.instanceId && extEvent.location) {
          setInstanceInfo(extEvent.instanceId, extEvent.location);
      }
      
      // Fetch world details if we can (to fix "Unknown World")
      try {
        const result = await window.electron.getWorld(event.worldId);
        if (result.success && result.world) {
            setWorldName(result.world.name);
            // Assuming world object has imageUrl or thumbnailImageUrl
            const worldData = result.world as { id: string; name: string; imageUrl?: string; thumbnailImageUrl?: string };
            const img = worldData.imageUrl || worldData.thumbnailImageUrl;
            if (img) setInstanceImage(img);
        }
      } catch (e) {
        console.error('Failed to fetch world name', e);
      }
    });

    const cleanupWorldName = window.electron.logWatcher.onWorldName((event) => {
      setWorldName(event.name);
    });

    const cleanupGroup = window.electron.instance.onGroupChanged((groupId) => {
        setCurrentGroupId(groupId);
    });

    return () => {
      cleanupJoined();
      cleanupLeft();
      cleanupLocation();
      cleanupWorldName();
      cleanupGroup();
      window.electron.logWatcher.stop();
    };

  }, [isAuthenticated, addPlayer, removePlayer, setWorldId, setWorldName, clearInstance, setInstanceInfo, setInstanceImage, setCurrentGroupId]);
}
