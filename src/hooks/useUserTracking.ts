import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { getBackendUrl } from '../config';
import { CURRENT_TOS_VERSION } from '../features/compliance/TosText';

const HEARTBEAT_INTERVAL = 60 * 1000; // 60 seconds

export const useUserTracking = () => {
    const { isAuthenticated, user } = useAuthStore();

    useEffect(() => {
        if (!isAuthenticated || !user) return;

        const sendHeartbeat = async () => {
            try {
                const hwid = await window.electron.getHWID();
                const backendUrl = getBackendUrl();
                
                await fetch(`${backendUrl}/track/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        vrc_userid: user.id,
                        vrc_username: user.displayName, // user.username is login name (email/user), displayName is visible name
                        hwid: hwid,
                        tos_accepted_version: CURRENT_TOS_VERSION
                    })
                });
                // Silent success - no need to log every minute
            } catch (error) {
                // Silent fail - analytics should not disrupt UX
                console.warn("Heartbeat failed:", error);
            }
        };

        // Send immediately on mount/auth
        sendHeartbeat();

        // Loop
        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => clearInterval(intervalId);
    }, [isAuthenticated, user]);
};
