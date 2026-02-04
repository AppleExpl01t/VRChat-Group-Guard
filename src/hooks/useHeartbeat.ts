import { useEffect, useRef } from 'react';
import { getBackendUrl } from '../config';

const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const BACKEND_URL = getBackendUrl();

/**
 * Hook that sends a heartbeat to the backend every 30 seconds.
 * This allows tracking of active GroupGuard installations.
 * Only the installation UUID is sent - no personal data.
 */
export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        // KILL SWITCH: Check if cloud features are enabled
        const settings = await window.electron.settings.get();
        if (settings.system?.enableCloudFeatures === false) {
          // Cloud features disabled - do not send heartbeat
          return;
        }

        // Get installation ID from Electron
        const installationId = await window.electron?.installationId?.get();
        
        if (!installationId) {
          console.warn('[Heartbeat] No installation ID available');
          return;
        }

        // Get app version if available
        const appVersion = window.electron?.getVersion?.() || 'unknown';

        await fetch(`${BACKEND_URL}/track/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-installation-id': installationId,
          },
          body: JSON.stringify({
            installationId,
            appVersion,
          }),
        });

        // Silent success - no need to log every heartbeat
      } catch (error) {
        // Silent failure - heartbeat is non-critical
        // Only log in development
        if (import.meta.env.DEV) {
          console.debug('[Heartbeat] Failed:', error);
        }
      }
    };

    // Send initial heartbeat on mount
    sendHeartbeat();

    // Set up interval for subsequent heartbeats
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}

export default useHeartbeat;
