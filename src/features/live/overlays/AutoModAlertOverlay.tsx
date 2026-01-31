import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, Gavel, User } from 'lucide-react';
import { NeonButton } from '../../../components/ui/NeonButton';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { useAutoModAlertStore } from '../../../stores/autoModAlertStore';
import { useGroupStore } from '../../../stores/groupStore';
import { useConfirm } from '../../../context/ConfirmationContext';
import { useNotificationStore } from '../../../stores/notificationStore';
const notificationSound = '/sounds/notification.mp3';

// Helper for sound
// Helper for sound
const playNotificationSound = async () => {
    try {

        let soundSrc = notificationSound;
        let volume = 0.6;

        // Try to fetch settings
        if (window.electron?.settings) {
            try {
                const settings = await window.electron.settings.get();
                volume = settings.audio.volume;

                if (settings.audio.notificationSoundPath) {
                    const customData = await window.electron.settings.getAudioData(settings.audio.notificationSoundPath);
                    if (customData) {
                        soundSrc = customData;

                    }
                }
            } catch (err) {
                console.warn('[AutoModAlert] Failed to load audio settings, using default', err);
            }
        }

        const audio = new Audio(soundSrc);
        audio.volume = volume;
        await audio.play();
    } catch (e) {
        console.error("Audio play failed", e);
    }
};

export const AutoModAlertOverlay: React.FC = () => {
    const { alerts, removeAlert, addAlert, isEnabled, dismissAlert } = useAutoModAlertStore();
    const { selectedGroup } = useGroupStore();

    const { confirm } = useConfirm();
    const { addNotification } = useNotificationStore();

    // Listen for events
    useEffect(() => {
        if (!window.electron?.automod?.onViolation) return;

        const unsubscribe = window.electron.automod.onViolation((data: { displayName: string; userId: string; action: string; reason: string; skipped?: boolean; ruleId?: number; detectedGroupId?: string }) => {
            if (!isEnabled) return;

            addAlert({
                userId: data.userId,
                displayName: data.displayName,
                action: data.action as 'REJECT' | 'AUTO_BLOCK',
                reason: data.reason,
                skipped: data.skipped,
                ruleId: data.ruleId,
                detectedGroupId: data.detectedGroupId
            });
            // Sound handled by store update effect below? 
            // Better here to ensure only plays on new event
            playNotificationSound();
        });

        return () => unsubscribe();
    }, [isEnabled, addAlert]);

    const handleWhitelist = async (groupId: string | undefined, alertId: string, ruleId: number, target: { userId?: string; groupId?: string }) => {
        if (!groupId) {
            addNotification({
                type: 'error',
                title: 'Operation Failed',
                message: 'Missing group context for this alert.'
            });
            return;
        }
        try {
            const success = await window.electron.automod.addToWhitelist(groupId, ruleId, target);
            if (success) {
                removeAlert(alertId);
                addNotification({
                    type: 'success',
                    title: 'Whitelisted',
                    message: target.userId ? `User ${target.userId} whitelisted` : `Group ${target.groupId} whitelisted`
                });
            } else {
                addNotification({
                    type: 'error',
                    title: 'Whitelist Failed',
                    message: 'Could not update rule. Rule might not exist or be disabled.'
                });
            }
        } catch (e) {
            console.error("Failed to whitelist", e);
            addNotification({
                type: 'error',
                title: 'Error',
                message: 'Failed to whitelist. Check console.'
            });
        }
    };

    const handleBan = async (alertId: string, userId: string, displayName: string) => {
        if (!selectedGroup) return;

        const confirmed = await confirm({
            title: 'Confirm Ban',
            message: `Are you sure you want to BAN ${displayName} from the group?`,
            confirmLabel: 'Ban User',
            variant: 'danger'
        });

        if (!confirmed) return;

        try {
            await window.electron.banUser(selectedGroup.id, userId);
            // Assuming success, remove alert
            removeAlert(alertId);
            addNotification({
                type: 'success',
                title: 'User Banned',
                message: `${displayName} has been banned.`
            });
        } catch (e) {
            console.error("Failed to ban user", e);
            addNotification({
                type: 'error',
                title: 'Ban Failed',
                message: "Failed to ban user. Check console."
            });
        }
    };

    // Auto-scroll logic if list gets long? Using simple stack for now.

    if (alerts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none' // Allow clicking through empty space
        }}>
            <AnimatePresence>
                {alerts.map(alert => (
                    <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 50, scale: 0.9 }}
                        style={{ pointerEvents: 'auto', width: '320px' }}
                    >
                        <GlassPanel style={{
                            padding: '0',
                            borderLeft: '4px solid #ef4444',
                            background: 'rgba(20, 0, 0, 0.9)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: alert.action === 'REJECT' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: alert.action === 'REJECT' ? '#fca5a5' : '#fde047', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    <ShieldAlert size={18} />
                                    <span>{alert.action === 'REJECT' ? 'AutoMod Block' : 'AutoMod Warning'}</span>
                                </div>
                                <button
                                    onClick={() => dismissAlert(alert.id)}
                                    title="Dismiss (Save to History)"
                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px', transition: 'color 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '16px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontWeight: '800', fontSize: '1.2rem', color: 'white', marginBottom: '4px', letterSpacing: '0.02em' }}>
                                        {alert.displayName}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace' }}>
                                        <User size={12} />
                                        {alert.userId}
                                    </div>
                                </div>

                                <div style={{
                                    background: 'rgba(0,0,0,0.4)',
                                    padding: '12px', borderRadius: '8px',
                                    borderLeft: `3px solid ${alert.action === 'REJECT' ? '#ef4444' : '#eab308'}`,
                                    marginBottom: '16px'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</div>
                                    <div style={{ fontSize: '0.95rem', color: '#fca5a5', fontWeight: 500, lineHeight: '1.4' }}>
                                        {alert.reason}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: alert.ruleId ? '12px' : '0' }}>
                                    <NeonButton
                                        variant="danger"
                                        size="sm"
                                        style={{ flex: 2, fontSize: '0.8rem', justifyContent: 'center' }}
                                        onClick={() => handleBan(alert.id, alert.userId, alert.displayName)}
                                    >
                                        <Gavel size={16} style={{ marginRight: '8px' }} />
                                        BAN USER
                                    </NeonButton>
                                    <NeonButton
                                        variant="secondary"
                                        size="sm"
                                        style={{ flex: 1, fontSize: '0.8rem', justifyContent: 'center' }}
                                        onClick={() => {
                                            window.open(`https://vrchat.com/home/user/${alert.userId}`, '_blank');
                                        }}
                                    >
                                        <User size={16} />
                                    </NeonButton>
                                </div>

                                {/* Whitelist Actions */}
                                {alert.ruleId && (
                                    <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                        <NeonButton
                                            variant="primary"
                                            size="sm"
                                            style={{ flex: 1, fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', borderColor: 'rgba(59, 130, 246, 0.3)', justifyContent: 'center' }}
                                            onClick={() => handleWhitelist(alert.detectedGroupId, alert.id, alert.ruleId!, { userId: alert.userId })}
                                        >
                                            Whitelist User
                                        </NeonButton>

                                        {alert.detectedGroupId && (
                                            <NeonButton
                                                variant="primary"
                                                size="sm"
                                                style={{ flex: 1, fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe', borderColor: 'rgba(168, 85, 247, 0.3)', justifyContent: 'center' }}
                                                onClick={() => handleWhitelist(alert.detectedGroupId, alert.id, alert.ruleId!, { groupId: alert.detectedGroupId })}
                                            >
                                                Whitelist Group
                                            </NeonButton>
                                        )}
                                    </div>
                                )}
                            </div>
                        </GlassPanel>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
