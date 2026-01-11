import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { useGroupStore } from '../../../stores/groupStore';
import { useUserProfileStore } from '../../../stores/userProfileStore';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { NeonButton } from '../../../components/ui/NeonButton';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const BansListDialog: React.FC<Props> = ({ isOpen, onClose }) => {
    const { bans, selectedGroup, fetchGroupBans, isBansLoading } = useGroupStore();
    const { openProfile } = useUserProfileStore();
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen && selectedGroup) {
            fetchGroupBans(selectedGroup.id);
        }
    }, [isOpen, selectedGroup, fetchGroupBans]);

    const handleUnban = async (userId: string, displayName: string) => {
        if (!selectedGroup) return;
        if (!confirm(`Are you sure you want to UNBAN ${displayName}?`)) return;

        try {
            const res = await window.electron.unbanUser(selectedGroup.id, userId);
            if (res.success) {
                fetchGroupBans(selectedGroup.id);
            } else {
                alert(`Error unbanning user: ${res.error}`);
            }
        } catch (e) {
            console.error("Unban failed", e);
            alert("Failed to unban user. Check console.");
        }
    };

    const filteredBans = bans.filter(ban => 
        ban.user.displayName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Active Bans (${bans.length})`}
            width="700px"
        >
             <div style={{ marginBottom: '1rem' }}>
                <input 
                    type="text" 
                    placeholder="Search banned users..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white'
                    }}
                />
            </div>

            <div style={{ height: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {isBansLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading bans...</div>
                ) : filteredBans.length > 0 ? (
                    filteredBans.map(ban => (
                        <GlassPanel key={ban.id} style={{ padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '3px solid #ef4444' }}>
                            <div 
                                style={{ display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer' }}
                                onClick={() => openProfile(ban.user.id)}
                            >
                                <img 
                                    src={ban.user.userIcon || ban.user.currentAvatarThumbnailImageUrl} 
                                    alt={ban.user.displayName}
                                    style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', filter: 'grayscale(100%)' }} 
                                />
                                <div>
                                    <div style={{ fontWeight: 'bold', color: '#ef4444' }}>{ban.user.displayName}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>
                                        Banned: {new Date(ban.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                             <NeonButton variant="ghost" onClick={() => handleUnban(ban.user.id, ban.user.displayName)}>Unban</NeonButton>
                        </GlassPanel>
                    ))
                ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No active bans found.</div>
                )}
            </div>
        </Modal>
    );
};
