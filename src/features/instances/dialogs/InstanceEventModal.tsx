import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { AnimatePresence, motion } from 'framer-motion';
import { NeonButton } from '../../../components/ui/NeonButton';
import { ExternalLink, User, Globe, Clock, Users, Shield } from 'lucide-react';
import type { InstanceLogEntry } from '../components/InstanceLog';

interface InstanceEventModalProps {
    isOpen: boolean;
    onClose: () => void;
    entry: InstanceLogEntry | null;
}

export const InstanceEventModal: React.FC<InstanceEventModalProps> = ({ isOpen, onClose, entry }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [ownerDetails, setOwnerDetails] = useState<any>(null);
    const [loadingOwner, setLoadingOwner] = useState(false);

    // Fetch owner details when modal opens
    useEffect(() => {
        if (isOpen && entry?.ownerId) {
            setLoadingOwner(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).electron.getUser(entry.ownerId)
                .then((response: { success: boolean; user?: unknown }) => {
                    if (response?.success && response?.user) {
                        setOwnerDetails(response.user);
                    }
                })
                .catch((e: Error) => console.error('Failed to fetch owner details:', e))
                .finally(() => setLoadingOwner(false));
        } else {
            setOwnerDetails(null);
        }
    }, [isOpen, entry?.ownerId]);

    if (!isOpen || !entry) return null;

    const actionType = entry.action;
    const isCloseEvent = actionType === 'AUTO_CLOSED' || actionType === 'CLOSED' || actionType === 'INSTANCE_CLOSED';
    const actionColor = isCloseEvent ? '#ef4444' : '#4ade80';

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}
                >
                    <motion.div
                        key="modal-content"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            maxHeight: '85vh',
                            zIndex: 10001,
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <GlassPanel style={{
                            padding: '0',
                            border: `1px solid ${actionColor}40`,
                            boxShadow: `0 0 40px ${actionColor}20`,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            maxHeight: '100%'
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '1rem 1.25rem',
                                background: 'rgba(0,0,0,0.3)',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexShrink: 0
                            }}>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isCloseEvent ? '🚫' : '🌍'} Instance Event
                                </h2>
                                <button onClick={onClose} style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.7)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex'
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {/* World Info Section */}
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        {/* World Thumbnail */}
                                        <div style={{
                                            width: '100px',
                                            height: '75px',
                                            borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.1)',
                                            backgroundImage: entry.worldThumbnailUrl ? `url(${entry.worldThumbnailUrl})` : 'none',
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            flexShrink: 0,
                                            border: '1px solid rgba(255,255,255,0.1)'
                                        }} />

                                        {/* World Details */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>
                                                {entry.worldName || 'Unknown World'}
                                            </h3>
                                            {entry.worldAuthorName && (
                                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                                                    by {entry.worldAuthorName}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {entry.wasAgeGated ? (
                                                    <span style={{
                                                        background: 'rgba(74, 222, 128, 0.2)',
                                                        color: '#4ade80',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        18+ Age-Gated
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        background: 'rgba(239, 68, 68, 0.2)',
                                                        color: '#ef4444',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        NOT 18+
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Instance Stats */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <Users size={16} style={{ marginBottom: '4px', opacity: 0.7 }} />
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                                                {entry.userCount ?? '?'}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>Users</div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <Globe size={16} style={{ marginBottom: '4px', opacity: 0.7 }} />
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                                                {entry.worldCapacity ?? '?'}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>Capacity</div>
                                        </div>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <Clock size={16} style={{ marginBottom: '4px', opacity: 0.7 }} />
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>Time</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Owner/Starter Section */}
                                <div style={{
                                    padding: '1rem 1.5rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    background: 'rgba(0,0,0,0.2)'
                                }}>
                                    <div style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold',
                                        color: 'var(--color-text-dim)',
                                        marginBottom: '8px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <User size={12} />
                                        Instance Started By
                                    </div>

                                    {loadingOwner ? (
                                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                                            Loading...
                                        </div>
                                    ) : ownerDetails ? (
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            {/* Owner Avatar */}
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.1)',
                                                backgroundImage: ownerDetails.currentAvatarThumbnailImageUrl
                                                    ? `url(${ownerDetails.currentAvatarThumbnailImageUrl})`
                                                    : 'none',
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                                flexShrink: 0
                                            }} />

                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, color: 'white', marginBottom: '2px' }}>
                                                    {ownerDetails.displayName}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {ownerDetails.ageVerificationStatus === '18+' && (
                                                        <span style={{
                                                            background: '#ef4444',
                                                            color: 'white',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            18+
                                                        </span>
                                                    )}
                                                    {ownerDetails.tags?.some((t: string) => t.includes('supporter')) && (
                                                        <span style={{
                                                            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                                                            color: 'white',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            VRC+
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <NeonButton
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => window.open(`https://vrchat.com/home/user/${entry.ownerId}`, '_blank')}
                                                style={{ padding: '6px 10px', height: 'auto' }}
                                            >
                                                <ExternalLink size={14} />
                                            </NeonButton>
                                        </div>
                                    ) : entry.ownerName ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'white', fontWeight: 500 }}>{entry.ownerName}</span>
                                            {entry.ownerId && (
                                                <NeonButton
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => window.open(`https://vrchat.com/home/user/${entry.ownerId}`, '_blank')}
                                                    style={{ padding: '6px 10px', height: 'auto' }}
                                                >
                                                    <ExternalLink size={14} />
                                                </NeonButton>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                                            Unknown
                                        </div>
                                    )}
                                </div>

                                {/* Event Action Info */}
                                <div style={{
                                    padding: '1rem 1.5rem',
                                    background: isCloseEvent ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '8px'
                                    }}>
                                        <Shield size={16} style={{ color: actionColor }} />
                                        <span style={{
                                            fontWeight: 'bold',
                                            color: actionColor,
                                            fontSize: '0.85rem',
                                            textTransform: 'uppercase'
                                        }}>
                                            {entry.action === 'OPENED' ? 'Instance Opened' :
                                                entry.action === 'AUTO_CLOSED' ? 'Auto-Closed by Guard' :
                                                    entry.action === 'CLOSED' ? 'Manually Closed' :
                                                        'Instance Closed'}
                                        </span>
                                    </div>
                                    {entry.reason && (
                                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>
                                            <strong>Reason:</strong> {entry.reason}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </div>
                                </div>

                                {/* Instance IDs (collapsible details) */}
                                <div style={{
                                    padding: '1rem 1.5rem',
                                    background: 'rgba(0,0,0,0.2)',
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-dim)'
                                }}>
                                    <div style={{ marginBottom: '4px' }}>
                                        <strong>World ID:</strong> {entry.worldId}
                                    </div>
                                    <div>
                                        <strong>Instance ID:</strong> {entry.instanceId}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div style={{
                                padding: '1rem 1.5rem',
                                background: 'rgba(0,0,0,0.3)',
                                display: 'flex',
                                gap: '0.5rem',
                                flexShrink: 0
                            }}>
                                <NeonButton
                                    variant="secondary"
                                    onClick={() => window.open(`https://vrchat.com/home/world/${entry.worldId}`, '_blank')}
                                    style={{ flex: 1 }}
                                >
                                    <Globe size={14} style={{ marginRight: '6px' }} />
                                    View World
                                </NeonButton>
                                <NeonButton
                                    variant="ghost"
                                    onClick={onClose}
                                    style={{ flex: 1 }}
                                >
                                    Close
                                </NeonButton>
                            </div>
                        </GlassPanel>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
