import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { type Notification, useNotificationStore } from '../../stores/notificationStore';
import { GlassPanel } from './GlassPanel';
import { Download } from 'lucide-react';

interface ToastProps {
    notification: Notification;
}

const icons: Record<string, React.ReactNode> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    automod: '🛡️',
    update: <Download size={24} />
};

const colors: Record<string, string> = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    info: 'var(--color-info)',
    automod: '#f472b6', // Pink/Magenta for AutoMod
    update: 'var(--color-primary)' // Primary color for updates
};

export const Toast: React.FC<ToastProps> = ({ notification }) => {
    const removeNotification = useNotificationStore(state => state.removeNotification);
    const { id, type, title, message, duration = 5000, persistent, action } = notification;

    useEffect(() => {
        // Don't auto-remove if persistent
        if (persistent) return;

        const timer = setTimeout(() => {
            removeNotification(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, removeNotification, persistent]);

    const isUpdateType = type === 'update';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            style={{ 
                marginBottom: '1rem', 
                position: 'relative', 
                minWidth: isUpdateType ? '340px' : '300px',
                maxWidth: '400px',
                pointerEvents: 'auto' // Re-enable clicks
            }}
        >
            <GlassPanel style={{ 
                padding: '1rem',
                borderLeft: `4px solid ${colors[type] || 'white'}`,
                background: isUpdateType 
                    ? 'rgba(0, 0, 0, 0.92)' 
                    : 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                boxShadow: isUpdateType 
                    ? `0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px hsla(var(--primary-hue), 70%, 50%, 0.2)` 
                    : `0 8px 32px rgba(0, 0, 0, 0.5)`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                    <div style={{ 
                        fontSize: '1.5rem', 
                        color: isUpdateType ? 'var(--color-primary)' : 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {icons[type] || '📝'}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'white', marginBottom: '4px' }}>
                            {title}
                        </div>
                        {message && (
                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', lineHeight: '1.4' }}>
                                {message}
                            </div>
                        )}
                    </div>
                    {!persistent && (
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeNotification(id);
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                padding: '0',
                                fontSize: '1rem'
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Action Button (for update notifications) */}
                {action && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            action.onClick();
                        }}
                        style={{
                            width: '100%',
                            padding: '0.6rem 1rem',
                            background: `linear-gradient(135deg, hsl(var(--primary-hue), 80%, 50%) 0%, hsl(var(--primary-hue), 90%, 40%) 100%)`,
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease',
                            boxShadow: `0 4px 12px hsla(var(--primary-hue), 70%, 50%, 0.3)`
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = `0 6px 16px hsla(var(--primary-hue), 70%, 50%, 0.4)`;
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = `0 4px 12px hsla(var(--primary-hue), 70%, 50%, 0.3)`;
                        }}
                    >
                        <Download size={16} />
                        {action.label}
                    </button>
                )}
            </GlassPanel>

            {/* Progress Bar (Optional, can add later if requested) */}
        </motion.div>
    );
};

