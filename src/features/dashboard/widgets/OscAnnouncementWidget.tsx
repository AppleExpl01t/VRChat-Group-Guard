import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { useGroupStore } from '../../../stores/groupStore';
import { NeonButton } from '../../../components/ui/NeonButton';
import { AnimatePresence, motion } from 'framer-motion';
import type { GroupAnnouncementConfig } from '../../../types/electron';
import { MessageSquare, Settings, Clock } from 'lucide-react';

// Configuration Popup Modal
const ConfigModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    config: GroupAnnouncementConfig;
    onSave: (newConfig: Partial<GroupAnnouncementConfig>) => void;
}> = ({ isOpen, onClose, config, onSave }) => {
    const [localConfig, setLocalConfig] = useState(config);

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const handleSave = () => {
        onSave(localConfig);
        onClose();
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.7)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px'
                        }}
                    >
                        {/* Modal Content */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ 
                                width: '100%', 
                                maxWidth: '500px', 
                                maxHeight: '80vh',
                                overflow: 'hidden',
                                borderRadius: '12px'
                            }}
                        >
                            <GlassPanel style={{ 
                                padding: '0', 
                                border: '1px solid rgba(var(--primary-hue), 100%, 50%, 0.3)',
                                display: 'flex',
                                flexDirection: 'column',
                                maxHeight: '80vh'
                            }}>
                                {/* Header */}
                                <div style={{ 
                                    padding: '1rem 1.25rem', 
                                    background: 'rgba(0,0,0,0.3)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <h2 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <MessageSquare size={18} />
                                        Chatbox Announcer Settings
                                    </h2>
                                    <button 
                                        onClick={onClose}
                                        style={{ 
                                            background: 'rgba(255,255,255,0.1)', 
                                            border: 'none', 
                                            color: 'rgba(255,255,255,0.7)', 
                                            cursor: 'pointer', 
                                            padding: '6px',
                                            borderRadius: '6px',
                                            display: 'flex'
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>

                                {/* Scrollable Content */}
                                <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    
                                    {/* Auto-Greeter Section */}
                                    <div style={{ 
                                        background: 'rgba(74, 222, 128, 0.05)', 
                                        border: '1px solid rgba(74, 222, 128, 0.2)',
                                        borderRadius: '8px',
                                        padding: '1rem'
                                    }}>
                                        <label style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '10px', 
                                            cursor: 'pointer',
                                            marginBottom: '0.75rem'
                                        }}>
                                            <input 
                                                type="checkbox" 
                                                checked={localConfig.greetingEnabled} 
                                                onChange={(e) => setLocalConfig({ ...localConfig, greetingEnabled: e.target.checked })}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ fontWeight: 600, color: '#86efac' }}>Auto-Greeter</span>
                                        </label>

                                        {localConfig.greetingEnabled && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginBottom: '4px', display: 'block' }}>
                                                        Default Message
                                                    </label>
                                                    <textarea 
                                                        value={localConfig.greetingMessage}
                                                        onChange={(e) => setLocalConfig({ ...localConfig, greetingMessage: e.target.value })}
                                                        placeholder="Welcome [User] to [Group]!"
                                                        spellCheck={false}
                                                        style={{ 
                                                            width: '100%', 
                                                            background: 'rgba(0,0,0,0.3)', 
                                                            border: '1px solid rgba(255,255,255,0.1)', 
                                                            color: 'white', 
                                                            fontSize: '0.85rem', 
                                                            padding: '10px',
                                                            minHeight: '60px',
                                                            borderRadius: '6px',
                                                            resize: 'vertical',
                                                            fontFamily: 'inherit'
                                                        }}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginBottom: '4px', display: 'block' }}>
                                                        Members Only (Optional)
                                                    </label>
                                                    <textarea 
                                                        value={localConfig.greetingMessageMembers || ''}
                                                        onChange={(e) => setLocalConfig({ ...localConfig, greetingMessageMembers: e.target.value })}
                                                        placeholder="Welcome back [User]!"
                                                        spellCheck={false}
                                                        style={{ 
                                                            width: '100%', 
                                                            background: 'rgba(0,0,0,0.3)', 
                                                            border: '1px solid rgba(255,255,255,0.1)', 
                                                            color: 'white', 
                                                            fontSize: '0.85rem', 
                                                            padding: '10px',
                                                            minHeight: '60px',
                                                            borderRadius: '6px',
                                                            resize: 'vertical',
                                                            fontFamily: 'inherit'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Periodic Alerts Section */}
                                    <div style={{ 
                                        background: 'rgba(251, 191, 36, 0.05)', 
                                        border: '1px solid rgba(251, 191, 36, 0.2)',
                                        borderRadius: '8px',
                                        padding: '1rem'
                                    }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            marginBottom: localConfig.periodicEnabled ? '0.75rem' : 0
                                        }}>
                                            <label style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '10px', 
                                                cursor: 'pointer'
                                            }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={localConfig.periodicEnabled} 
                                                    onChange={(e) => setLocalConfig({ ...localConfig, periodicEnabled: e.target.checked })}
                                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                                <span style={{ fontWeight: 600, color: '#fde047' }}>Periodic Alerts</span>
                                            </label>

                                            {localConfig.periodicEnabled && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                                    Every
                                                    <input 
                                                        type="number" 
                                                        min="1"
                                                        max="120"
                                                        value={localConfig.periodicIntervalMinutes}
                                                        onChange={(e) => setLocalConfig({ ...localConfig, periodicIntervalMinutes: parseInt(e.target.value) || 1 })}
                                                        style={{ 
                                                            width: '45px', 
                                                            background: 'rgba(0,0,0,0.3)', 
                                                            border: '1px solid rgba(255,255,255,0.1)', 
                                                            color: 'white', 
                                                            textAlign: 'center', 
                                                            borderRadius: '4px', 
                                                            fontSize: '0.8rem',
                                                            padding: '4px'
                                                        }}
                                                    />
                                                    min
                                                </div>
                                            )}
                                        </div>

                                        {localConfig.periodicEnabled && (
                                            <textarea 
                                                value={localConfig.periodicMessage}
                                                onChange={(e) => setLocalConfig({ ...localConfig, periodicMessage: e.target.value })}
                                                placeholder="🛡️ This instance is protected by Group Guard."
                                                spellCheck={false}
                                                style={{ 
                                                    width: '100%', 
                                                    background: 'rgba(0,0,0,0.3)', 
                                                    border: '1px solid rgba(255,255,255,0.1)', 
                                                    color: 'white', 
                                                    fontSize: '0.85rem', 
                                                    padding: '10px',
                                                    minHeight: '60px',
                                                    borderRadius: '6px',
                                                    resize: 'vertical',
                                                    fontFamily: 'inherit'
                                                }}
                                            />
                                        )}
                                    </div>
                                    
                                    {/* Display Duration */}
                                    <div style={{ 
                                        background: 'rgba(255, 255, 255, 0.03)', 
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <label style={{ color: 'rgba(255,255,255, 0.9)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                            <Clock size={16} color="#dda0dd" />
                                            Display Duration
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                            Show for
                                            <input 
                                                type="number" 
                                                min="1"
                                                max="60"
                                                value={localConfig.displayDurationSeconds ?? 10}
                                                onChange={(e) => setLocalConfig({ ...localConfig, displayDurationSeconds: parseFloat(e.target.value) || 5 })}
                                                style={{ 
                                                    width: '50px', 
                                                    background: 'rgba(0,0,0,0.3)', 
                                                    border: '1px solid rgba(255,255,255,0.1)', 
                                                    color: 'white', 
                                                    textAlign: 'center', 
                                                    borderRadius: '4px', 
                                                    padding: '4px 8px'
                                                }}
                                            />
                                            seconds
                                        </div>
                                    </div>

                                    {/* Help Text */}
                                    <div style={{ 
                                        fontSize: '0.75rem', 
                                        color: 'var(--color-text-dim)',
                                        background: 'rgba(255,255,255,0.02)',
                                        padding: '0.75rem',
                                        borderRadius: '6px'
                                    }}>
                                        <strong>Variables:</strong> Use <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px' }}>[User]</code> for player name and <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px' }}>[Group]</code> for group name.
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ 
                                    padding: '1rem 1.25rem', 
                                    borderTop: '1px solid rgba(255,255,255,0.05)', 
                                    display: 'flex', 
                                    justifyContent: 'flex-end',
                                    gap: '10px',
                                    background: 'rgba(0,0,0,0.2)'
                                }}>
                                    <NeonButton onClick={onClose} variant="secondary" style={{ padding: '8px 16px' }}>
                                        Cancel
                                    </NeonButton>
                                    <NeonButton onClick={handleSave} style={{ padding: '8px 20px' }}>
                                        Save Changes
                                    </NeonButton>
                                </div>
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

// Main Compact Widget
export const OscAnnouncementWidget: React.FC = () => {
    const { selectedGroup } = useGroupStore();
    const [config, setConfig] = useState<GroupAnnouncementConfig | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [isMasterOscEnabled, setIsMasterOscEnabled] = useState(true);

    useEffect(() => {
        if (!selectedGroup) return;
        
        let cancelled = false;
        
        // Load Announcement Config
        window.electron.osc.getAnnouncementConfig(selectedGroup.id).then(cfg => {
            if (!cancelled) setConfig(cfg);
        }).catch(err => {
            console.error('Failed to load announcement config:', err);
        });

        // Check Master OSC Status
        window.electron.osc.getConfig().then(cfg => {
            if (!cancelled) setIsMasterOscEnabled(cfg.enabled);
        });

        return () => { cancelled = true; };
    }, [selectedGroup]);

    const handleSave = async (newConfig: Partial<GroupAnnouncementConfig>) => {
        if (!selectedGroup || !config) return;
        
        setConfig(prev => prev ? { ...prev, ...newConfig } : null);
        
        try {
            await window.electron.osc.setAnnouncementConfig(selectedGroup.id, newConfig);
        } catch (e) {
            console.error('Failed to save announcement config', e);
        }
    };

    const handleQuickToggle = async (key: 'greetingEnabled' | 'periodicEnabled') => {
        if (!config) return;
        const newValue = !config[key];
        handleSave({ [key]: newValue });
    };

    if (!selectedGroup || !config) return null;
    
    const isActive = config.greetingEnabled || config.periodicEnabled;
    const isError = isActive && !isMasterOscEnabled;

    return (
        <>
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 12px',
                background: isError ? 'rgba(239, 68, 68, 0.1)' : (isActive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.03)'),
                border: isError ? '1px solid #ef4444' : (isActive ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255,255,255,0.1)'),
                borderRadius: '8px',
                transition: 'all 0.2s ease'
            }}>
                {isError ? (
                    <div title="Master OSC is Disabled in Settings! Enable it for this to work." style={{ cursor: 'help' }}>⚠️</div>
                ) : (
                    <MessageSquare size={16} style={{ color: isActive ? '#86efac' : 'var(--color-text-dim)' }} />
                )}
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Quick Toggle: Greeter */}
                    <button
                        onClick={() => handleQuickToggle('greetingEnabled')}
                        title={config.greetingEnabled ? "Disable Auto-Greeter" : "Enable Auto-Greeter"}
                        style={{
                            background: config.greetingEnabled ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: config.greetingEnabled ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.1)',
                            color: config.greetingEnabled ? '#86efac' : 'var(--color-text-dim)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        👋 Greet
                    </button>

                    {/* Quick Toggle: Periodic */}
                    <button
                        onClick={() => handleQuickToggle('periodicEnabled')}
                        title={config.periodicEnabled ? "Disable Periodic Alerts" : "Enable Periodic Alerts"}
                        style={{
                            background: config.periodicEnabled ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: config.periodicEnabled ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
                            color: config.periodicEnabled ? '#fde047' : 'var(--color-text-dim)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        🔔 Alert
                    </button>
                </div>

                {/* Configure Button */}
                <button
                    onClick={() => setShowModal(true)}
                    title="Configure Chatbox Announcer"
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--color-text-dim)',
                        padding: '5px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                    }}
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Configuration Modal */}
            <ConfigModal 
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                config={config}
                onSave={handleSave}
            />
        </>
    );
};
