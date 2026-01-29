import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoModAlertStore } from '../../stores/autoModAlertStore';
import { Clock, Trash2, CheckCircle, ShieldAlert, ChevronDown, UserX, ShieldCheck, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen }) => {
    const { history, clearHistory, removeAlert } = useAutoModAlertStore();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Confirmation Modal State
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<{
        type: 'WHITELIST' | 'BAN';
        item: typeof history[0];
    } | null>(null);

    // if (!isOpen) return null; // Removed to allow AnimatePresence to handle exit

    const handleWhitelistClick = (e: React.MouseEvent, item: typeof history[0]) => {
        e.stopPropagation();
        if (item.ruleId && item.userId && item.detectedGroupId) {
            setPendingAction({ type: 'WHITELIST', item });
            setConfirmOpen(true);
        }
    };

    const handleBanClick = (e: React.MouseEvent, item: typeof history[0]) => {
        e.stopPropagation();
        if (item.detectedGroupId && item.userId) {
            setPendingAction({ type: 'BAN', item });
            setConfirmOpen(true);
        }
    };

    const executeConfirmation = async () => {
        if (!pendingAction) return;
        const { type, item } = pendingAction;

        try {
            if (type === 'WHITELIST') {
                if (item.ruleId && item.userId && item.detectedGroupId) {
                    await window.electron.automod.addToWhitelist(item.detectedGroupId, item.ruleId, { userId: item.userId });
                    await window.electron.automod.addToWhitelist(item.detectedGroupId, item.ruleId, { userId: item.userId });
                }
            } else if (type === 'BAN') {
                if (item.detectedGroupId && item.userId) {
                    await window.electron.banUser(item.detectedGroupId, item.userId);
                    await window.electron.banUser(item.detectedGroupId, item.userId);
                }
            }
            // Remove notification on success
            removeAlert(item.id);
        } catch (err) {
            console.error(`Failed to execute ${type}:`, err);
        } finally {
            setConfirmOpen(false);
            setPendingAction(null);
        }
    };

    const handleDismiss = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        removeAlert(id);
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="glass-panel"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            right: '0',
                            marginTop: '10px',
                            width: '380px',
                            zIndex: 50,
                            // Merged GlassPanel styles to fix stacking context/blur issue
                            padding: '0',
                            height: '500px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: 'var(--shadow-floating)',
                            border: '1px solid var(--border-color)'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '16px',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'var(--color-surface-card)'
                        }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-main)' }}>
                                <Clock size={16} color="var(--color-primary)" />
                                Notification History
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {history.length > 0 && (
                                    <button
                                        onClick={clearHistory}
                                        style={{
                                            background: 'none', border: 'none',
                                            color: '#fca5a5', cursor: 'pointer',
                                            fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px',
                                            opacity: 0.7
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                                    >
                                        <Trash2 size={12} />
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                            {history.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                                    <CheckCircle size={48} style={{ marginBottom: '16px' }} />
                                    <div>No notifications</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {history.map(item => {
                                        const isExpanded = expandedId === item.id;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => toggleExpand(item.id)}
                                                style={{
                                                    padding: '12px',
                                                    borderRadius: '8px',
                                                    background: isExpanded ? 'var(--color-surface-elevated)' : 'var(--color-surface-card)',
                                                    border: '1px solid var(--border-color)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
                                                        {item.displayName}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                                                        <ChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                                                    </div>
                                                </div>

                                                <div style={{
                                                    fontSize: '0.8rem', color: item.action === 'REJECT' ? '#fca5a5' : '#fde047',
                                                    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px'
                                                }}>
                                                    <ShieldAlert size={12} />
                                                    {item.action === 'REJECT' ? 'Blocked' : 'Generic'} • {item.reason}
                                                </div>

                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>
                                                    {item.userId}
                                                </div>

                                                {/* Actions Area */}
                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.div
                                                            key="details"
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            style={{ overflow: 'hidden' }}
                                                        >
                                                            <div style={{
                                                                marginTop: '12px',
                                                                paddingTop: '12px',
                                                                borderTop: '1px solid var(--border-color)',
                                                                display: 'flex',
                                                                gap: '8px'
                                                            }}>

                                                                {item.ruleId && (
                                                                    <button
                                                                        onClick={(e) => handleWhitelistClick(e, item)}
                                                                        className="action-btn"
                                                                        style={{
                                                                            flex: 1,
                                                                            padding: '6px',
                                                                            borderRadius: '4px',
                                                                            border: 'none',
                                                                            background: 'rgba(34, 197, 94, 0.2)',
                                                                            color: '#4ade80',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 'bold',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                                                        }}
                                                                    >
                                                                        <ShieldCheck size={14} />
                                                                        Whitelist
                                                                    </button>
                                                                )}

                                                                {item.detectedGroupId && (
                                                                    <button
                                                                        onClick={(e) => handleBanClick(e, item)}
                                                                        className="action-btn"
                                                                        style={{
                                                                            flex: 1,
                                                                            padding: '6px',
                                                                            borderRadius: '4px',
                                                                            border: 'none',
                                                                            background: 'rgba(239, 68, 68, 0.2)',
                                                                            color: '#f87171',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 'bold',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                                                        }}
                                                                    >
                                                                        <UserX size={14} />
                                                                        Ban
                                                                    </button>
                                                                )}

                                                                <button
                                                                    onClick={(e) => handleDismiss(e, item.id)}
                                                                    style={{
                                                                        padding: '6px 10px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--border-color)',
                                                                        background: 'transparent',
                                                                        color: 'var(--color-text-dim)',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.75rem',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}
                                                                    title="Dismiss"
                                                                >
                                                                    <X size={14} />
                                                                </button>

                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmationModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={executeConfirmation}
                title={pendingAction?.type === 'WHITELIST' ? 'Confirm Whitelist' : 'Confirm Ban'}
                message={
                    pendingAction?.type === 'WHITELIST'
                        ? `This will add ${pendingAction.item.displayName} to the whitelist. They will bypass this AutoMod rule in the future.`
                        : `This will BAN ${pendingAction?.item.displayName} from the group. They will be removed immediately.`
                }
                confirmLabel={pendingAction?.type === 'WHITELIST' ? 'Safelist User' : 'Ban User'}
                variant={pendingAction?.type === 'BAN' ? 'danger' : 'default'}
            />
        </>
    );
};
