import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { NeonButton } from '../../../components/ui/NeonButton';

export interface InstanceLogEntry {
    id: string;
    timestamp: number;
    action: 'OPENED' | 'CLOSED' | 'AUTO_CLOSED' | 'INSTANCE_CLOSED';
    worldId: string;
    worldName: string;
    instanceId: string;
    groupId: string;
    reason?: string;
    closedBy?: string;
    wasAgeGated?: boolean;
    userCount?: number;
    // Owner/starter info
    ownerId?: string;
    ownerName?: string;
    // World info for modal display
    worldThumbnailUrl?: string;
    worldAuthorName?: string;
    worldCapacity?: number;
}

interface InstanceLogProps {
    logs: InstanceLogEntry[];
    onRefresh?: () => void;
    onSelectEntry?: (entry: InstanceLogEntry) => void;
}

const getActionIcon = (action: string, wasAgeGated?: boolean) => {
    switch (action) {
        case 'OPENED':
            return wasAgeGated ? '🔓' : '🌍';
        case 'CLOSED':
            return '🔒';
        case 'AUTO_CLOSED':
        case 'INSTANCE_CLOSED':
            return '🚫';
        default:
            return '📋';
    }
};

const getActionColor = (action: string) => {
    switch (action) {
        case 'OPENED':
            return 'var(--color-success)';
        case 'CLOSED':
            return 'var(--color-primary)';
        case 'AUTO_CLOSED':
        case 'INSTANCE_CLOSED':
            return 'var(--color-danger)';
        default:
            return 'var(--color-text-dim)';
    }
};

const getActionLabel = (action: string) => {
    switch (action) {
        case 'OPENED':
            return 'OPENED';
        case 'CLOSED':
            return 'CLOSED';
        case 'AUTO_CLOSED':
        case 'INSTANCE_CLOSED':
            return 'AUTO-CLOSED';
        default:
            return action;
    }
};

export const InstanceLog: React.FC<InstanceLogProps> = ({ logs, onRefresh, onSelectEntry }) => {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Instance Activity Log</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                        {logs.length} events
                    </span>
                    {onRefresh && (
                        <NeonButton
                            variant="ghost"
                            size="sm"
                            onClick={onRefresh}
                            style={{ padding: '4px 8px', height: 'auto' }}
                        >
                            <RefreshCw size={14} />
                        </NeonButton>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {logs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <AnimatePresence initial={false}>
                            {logs.map((log, index) => (
                                <motion.div
                                    key={log.id || `${log.timestamp}-${index}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    onClick={() => onSelectEntry?.(log)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '1rem',
                                        padding: '0.75rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        cursor: onSelectEntry ? 'pointer' : 'default',
                                        transition: 'all 0.15s ease',
                                    }}
                                    whileHover={onSelectEntry ? {
                                        background: 'rgba(255,255,255,0.06)',
                                        borderColor: 'rgba(255,255,255,0.1)'
                                    } : undefined}
                                >
                                    <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                                        {getActionIcon(log.action, log.wasAgeGated)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{
                                                fontWeight: 600,
                                                color: 'white',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '200px'
                                            }}>
                                                {log.worldName || 'Unknown World'}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 'bold',
                                                color: getActionColor(log.action),
                                                background: `${getActionColor(log.action)}20`,
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {getActionLabel(log.action)}
                                            </span>
                                            {log.wasAgeGated && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    color: '#ffc045',
                                                    background: 'rgba(255, 180, 50, 0.2)',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    18+
                                                </span>
                                            )}
                                            {log.userCount !== undefined && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: 'var(--color-text-dim)'
                                                }}>
                                                    {log.userCount} users
                                                </span>
                                            )}
                                        </div>
                                        {/* Show who opened the instance */}
                                        {log.ownerName && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-dim)',
                                                marginTop: '0.25rem'
                                            }}>
                                                Started by <span style={{ color: 'var(--color-primary)' }}>{log.ownerName}</span>
                                            </div>
                                        )}
                                        {log.reason && (
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--color-text-dim)',
                                                marginTop: '0.25rem'
                                            }}>
                                                {log.reason}
                                            </div>
                                        )}
                                        {log.closedBy && log.closedBy !== 'System' && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-dim)',
                                                marginTop: '0.25rem',
                                                fontStyle: 'italic'
                                            }}>
                                                Closed by {log.closedBy}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-dim)',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <span style={{ fontSize: '2.5rem' }}>🛡️</span>
                        <span style={{ fontSize: '1rem' }}>No instance events recorded</span>
                        <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Events will appear here when instances are opened or closed</span>
                    </div>
                )}
            </div>
        </div>
    );
};
