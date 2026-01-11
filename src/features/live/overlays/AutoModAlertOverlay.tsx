import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, Gavel, User } from 'lucide-react';
import { NeonButton } from '../../../components/ui/NeonButton';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { useAutoModAlertStore } from '../../../stores/autoModAlertStore';
import { useGroupStore } from '../../../stores/groupStore';

// Helper for sound
const playNotificationSound = () => {
    try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.volume = 0.6;
        audio.play().catch(e => console.error("Sound play failed", e));
    } catch (e) {
        console.error("Audio init failed", e);
    }
};

export const AutoModAlertOverlay: React.FC = () => {
    const { alerts, removeAlert, addAlert, isEnabled } = useAutoModAlertStore();
    const { selectedGroup } = useGroupStore();
    
    // Listen for events
    useEffect(() => {
        if (!window.electron?.automod?.onViolation) return;
        
        const unsubscribe = window.electron.automod.onViolation((data: { displayName: string; userId: string; action: string; reason: string; skipped?: boolean }) => {
            if (!isEnabled) return;
            
            addAlert({
                userId: data.userId,
                displayName: data.displayName,
                action: data.action as 'REJECT' | 'AUTO_BLOCK',
                reason: data.reason,
                skipped: data.skipped
            });
            // Sound handled by store update effect below? 
            // Better here to ensure it only plays on new event
            playNotificationSound();
        });
        
        return () => unsubscribe();
    }, [isEnabled, addAlert]);

    const handleBan = async (alertId: string, userId: string, displayName: string) => {
        if (!selectedGroup) return;
        if (!confirm(`Are you sure you want to BAN ${displayName} from the group?`)) return;

        try {
            await window.electron.banUser(selectedGroup.id, userId);
            // Assuming success, remove alert
            removeAlert(alertId);
        } catch (e) {
            console.error("Failed to ban user", e);
            alert("Failed to ban user. Check console.");
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
                                padding: '10px 15px', 
                                borderBottom: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'rgba(239, 68, 68, 0.1)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                    <ShieldAlert size={16} />
                                    AUTOMOD ALERT
                                </div>
                                <button 
                                    onClick={() => removeAlert(alert.id)}
                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'white', marginBottom: '2px' }}>
                                            {alert.displayName}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <User size={10} />
                                            {alert.userId}
                                        </div>
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.7rem', fontWeight: 'bold', 
                                        padding: '2px 6px', borderRadius: '4px',
                                        background: alert.skipped ? 'rgba(156, 163, 175, 0.2)' : (alert.action === 'REJECT' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)'),
                                        color: alert.skipped ? '#d1d5db' : (alert.action === 'REJECT' ? '#fca5a5' : '#fde047')
                                    }}>
                                        {alert.skipped ? `${alert.action} (SKIPPED)` : alert.action}
                                    </div>
                                </div>
                                
                                <div style={{ 
                                    background: 'rgba(0,0,0,0.3)', 
                                    padding: '8px', borderRadius: '6px', 
                                    fontSize: '0.8rem', color: '#fca5a5',
                                    marginBottom: '12px',
                                    display: 'flex', gap: '6px'
                                }}>
                                    <span style={{ opacity: 0.7 }}>Reason:</span>
                                    <span style={{ fontWeight: 600 }}>{alert.reason}</span>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <NeonButton 
                                        variant="danger" 
                                        size="sm"
                                        style={{ flex: 1, fontSize: '0.75rem' }}
                                        onClick={() => handleBan(alert.id, alert.userId, alert.displayName)}
                                    >
                                        <Gavel size={14} style={{ marginRight: '6px' }} />
                                        BAN FROM GROUP
                                    </NeonButton>
                                    <NeonButton 
                                        variant="secondary" 
                                        size="sm"
                                        style={{ flex: 1, fontSize: '0.75rem' }}
                                        onClick={() => {
                                            // TODO: Trigger View Profile Modal
                                            // This requires access to a global modal store or passing a handler
                                            // For now, we'll just open the URL externally or notify
                                            window.open(`https://vrchat.com/home/user/${alert.userId}`, '_blank');
                                        }}
                                    >
                                        <User size={14} style={{ marginRight: '6px' }} />
                                        PROFILE
                                    </NeonButton>
                                </div>
                            </div>
                        </GlassPanel>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
