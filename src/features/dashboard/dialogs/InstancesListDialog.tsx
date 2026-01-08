import React, { useEffect, useState } from 'react';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { NeonButton } from '../../../components/ui/NeonButton';
import { Modal } from '../../../components/ui/Modal';
import { useGroupStore } from '../../../stores/groupStore';
import type { VRChatInstance } from '../../../types/electron';

interface InstancesListDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const InstancesListDialog: React.FC<InstancesListDialogProps> = ({ isOpen, onClose }) => {
    const { instances, isInstancesLoading, selectedGroup, fetchGroupInstances } = useGroupStore();
    const [confirmClose, setConfirmClose] = useState<VRChatInstance | null>(null);

    useEffect(() => {
        if (isOpen && selectedGroup) {
            fetchGroupInstances(selectedGroup.id);
        }
    }, [isOpen, selectedGroup, fetchGroupInstances]);

    const handleRefresh = () => {
        if (selectedGroup) {
            fetchGroupInstances(selectedGroup.id);
        }
    };

    const handleJoin = async (instance: VRChatInstance) => {
        const location = instance.location || instance.id || '';
        // Parse worldId and instanceId from location
        // Location format: wrld_xxx:12345~... or just worldId:instanceId
        
        let worldId = instance.worldId || instance.world?.id;
        let instanceId = instance.instanceId;

        // Fallback parsing if fields missing
        if ((!worldId || !instanceId) && location) {
            const parts = location.split(':');
            if (parts.length >= 2) {
                worldId = parts[0];
                instanceId = parts.slice(1).join(':'); // everything after first colon
            }
        }

        if (worldId && instanceId) {
            const res = await window.electron.instance.inviteSelf(worldId, instanceId);
            if (!res.success) {
                console.error('Failed to join:', res.error);
            }
        }
    };

    const handleCloseInstance = (instance: VRChatInstance) => {
        setConfirmClose(instance);
    };

    const confirmCloseInstance = async () => {
        if (confirmClose) {
            const location = confirmClose.location || confirmClose.id || '';
            let worldId = confirmClose.worldId || confirmClose.world?.id;
            let instanceId = confirmClose.instanceId;
            
             if ((!worldId || !instanceId) && location) {
                const parts = location.split(':');
                if (parts.length >= 2) {
                    worldId = parts[0];
                    instanceId = parts.slice(1).join(':');
                }
            }

            if (worldId && instanceId) {
                const res = await window.electron.instance.closeInstance(worldId, instanceId);
                 if (!res.success) {
                    console.error('Failed to close:', res.error);
                } else {
                    // Refresh list on success
                    handleRefresh();
                }
            }
            setConfirmClose(null);
        }
    };

    const getRegion = (location?: string) => {
        if (!location) return 'US';
        const match = location.match(/~region\(([^)]+)\)/);
        return match ? match[1].toUpperCase() : 'US';
    };

    const getUserCount = (instance: VRChatInstance) => {
        return instance.n_users || instance.userCount || instance.memberCount || 0;
    };

    const getCapacity = (instance: VRChatInstance) => {
        return instance.capacity || instance.world?.capacity || 40;
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Active Instances (${instances.length})`} width="600px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Header with refresh */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <NeonButton size="sm" onClick={handleRefresh} disabled={isInstancesLoading}>
                            {isInstancesLoading ? 'Loading...' : 'Refresh'}
                        </NeonButton>
                    </div>
                    
                    {/* Instances List */}
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '1rem',
                        maxHeight: '50vh',
                        overflowY: 'auto',
                        paddingRight: '4px'
                    }}>
                        {isInstancesLoading && instances.length === 0 ? (
                             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-dim)' }}>
                                 Loading instances...
                             </div>
                        ) : instances.length > 0 ? (
                            instances.map((instance, i) => (
                                <GlassPanel 
                                    key={instance.id || instance.location || i} 
                                    style={{ padding: '1rem' }}
                                >
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        {/* World Thumbnail */}
                                        <div style={{
                                            width: '120px',
                                            height: '80px',
                                            borderRadius: 'var(--border-radius)',
                                            background: '#1a1a2e',
                                            backgroundImage: instance.world?.thumbnailImageUrl 
                                                ? `url(${instance.world.thumbnailImageUrl})` 
                                                : instance.world?.imageUrl 
                                                    ? `url(${instance.world.imageUrl})`
                                                    : 'none',
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            flexShrink: 0,
                                            border: '1px solid var(--border-color)',
                                        }} />
                                        
                                        {/* Instance Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* World Name */}
                                            <h4 style={{ 
                                                margin: '0 0 0.25rem 0',
                                                fontSize: '1rem',
                                                fontWeight: 600,
                                                color: 'var(--color-text-main)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}>
                                                {instance.world?.name || instance.displayName || 'Unknown World'}
                                            </h4>
                                            
                                            {/* Author */}
                                            <div style={{ 
                                                fontSize: '0.8rem', 
                                                color: 'var(--color-text-dim)',
                                                marginBottom: '0.5rem'
                                            }}>
                                                by {instance.world?.authorName || 'Unknown'}
                                            </div>
                                            
                                            {/* Stats Row */}
                                            <div style={{ 
                                                display: 'flex', 
                                                gap: '1rem', 
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-dim)'
                                            }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                }}>
                                                    👥 {getUserCount(instance)} / {getCapacity(instance)}
                                                </span>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                }}>
                                                    🌍 {getRegion(instance.location)}
                                                </span>
                                                {/* Instance Type */}
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: 'rgba(100, 150, 255, 0.15)',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    color: '#8ab4ff',
                                                    textTransform: 'capitalize',
                                                }}>
                                                    {instance.groupAccessType || instance.type || 'Public'}
                                                </span>
                                                {/* Age Gate Badge */}
                                                {instance.ageGate && (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        background: 'rgba(255, 180, 50, 0.2)',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        color: '#ffc045',
                                                        fontWeight: 600,
                                                    }}>
                                                        🔞 18+
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div style={{ 
                                        display: 'flex', 
                                        gap: '0.75rem', 
                                        marginTop: '1rem',
                                        paddingTop: '1rem',
                                        borderTop: '1px solid var(--border-color)'
                                    }}>
                                        <NeonButton 
                                            size="sm" 
                                            onClick={() => handleJoin(instance)}
                                            style={{ flex: 1 }}
                                        >
                                            Join Instance
                                        </NeonButton>
                                        <NeonButton 
                                            size="sm" 
                                            variant="secondary"
                                            onClick={() => handleCloseInstance(instance)}
                                            style={{ flex: 1 }}
                                        >
                                            Close Instance
                                        </NeonButton>
                                    </div>
                                </GlassPanel>
                            ))
                        ) : (
                            <div style={{ 
                                padding: '3rem', 
                                textAlign: 'center', 
                                color: 'var(--color-text-dim)',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: 'var(--border-radius)',
                                border: '1px dashed var(--border-color)'
                            }}>
                                <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No Active Instances</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                    There are no active group instances at this time.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Close Instance Confirmation Dialog */}
            <Modal 
                isOpen={!!confirmClose} 
                onClose={() => setConfirmClose(null)} 
                title="Close Instance"
                width="400px"
            >
                <div style={{ textAlign: 'center' }}>
                    <p style={{ 
                        color: 'var(--color-text-main)', 
                        marginBottom: '0.5rem',
                        fontSize: '1rem'
                    }}>
                        Are you sure you want to close this instance?
                    </p>
                    <p style={{ 
                        color: 'var(--color-primary)', 
                        fontWeight: 600,
                        marginBottom: '0.5rem'
                    }}>
                        {confirmClose?.world?.name || 'Unknown World'}
                    </p>
                    <p style={{ 
                        color: 'var(--color-text-dim)', 
                        fontSize: '0.85rem',
                        marginBottom: '1.5rem'
                    }}>
                        This will disconnect all {getUserCount(confirmClose || {} as VRChatInstance)} users.
                    </p>
                    
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <NeonButton 
                            variant="secondary" 
                            onClick={() => setConfirmClose(null)}
                        >
                            Cancel
                        </NeonButton>
                        <NeonButton 
                            variant="danger" 
                            onClick={confirmCloseInstance}
                        >
                            Close Instance
                        </NeonButton>
                    </div>
                </div>
            </Modal>
        </>
    );
};
