import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useAutoModAlertStore } from '../stores/autoModAlertStore';

const notificationSound = '/sounds/notification.mp3?v=' + Date.now();

export const useAutoModNotifications = () => {
    const addNotification = useNotificationStore(state => state.addNotification);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Preload audio

        audioRef.current = new Audio(notificationSound);
        audioRef.current.volume = 0.5; // Reasonable default volume

        if (!window.electron?.automod?.onViolation) return;

        const unsubscribe = window.electron.automod.onViolation((data) => {
            // Play Sound
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => console.error("Failed to play notification sound:", e));
            }

            // Show Toast
            addNotification({
                type: 'automod',
                title: 'AutoMod Triggered',
                message: `${data.displayName} was ${data.action} due to ${data.reason}`,
                duration: 8000 // Slightly longer for automod alerts
            });

            // Add to Notification Panel History
            useAutoModAlertStore.getState().addAlert({
                userId: data.userId,
                displayName: data.displayName,
                action: data.action as 'REJECT' | 'AUTO_BLOCK',
                reason: data.reason,
            });
        });

        return () => {
            unsubscribe();
        };
    }, [addNotification]);
};
