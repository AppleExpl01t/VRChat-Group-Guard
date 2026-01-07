import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { NeonButton } from '../../../components/ui/NeonButton';
import { useGroupStore } from '../../../stores/groupStore';
import { ShieldAlert, UserPlus, Gavel, Loader2, User, Copy, ExternalLink } from 'lucide-react';

interface UserProfileDialogProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
    onInvite: (userId: string, name: string) => void;
    onKick: (userId: string, name: string) => void;
    onBan: (userId: string, name: string) => void;
}

interface UserProfileData {
    id: string;
    displayName: string;
    description: string;
    tags: string[];
    thumbnailUrl: string;
    currentAvatarImageUrl: string;
    status: string;
    statusDescription: string;
    last_login: string;
    developerType: string;
    isFriend: boolean;
    trustLevel?: string;
}

export const UserProfileDialog: React.FC<UserProfileDialogProps> = ({ isOpen, onClose, userId, onInvite, onKick, onBan }) => {
    const { selectedGroup } = useGroupStore();
    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch profile when dialog opens
    useEffect(() => {
        if (isOpen && userId) {
            fetchProfile(userId);
        } else {
            setProfile(null);
            setError(null);
        }
    }, [isOpen, userId]);

    const fetchProfile = async (id: string) => {
        setIsLoading(true);
        setError(null);
        try {
            // Use the general getUser API
             if (window.electron?.getUser) {
                const res = await window.electron.getUser(id);
                if (res.success && res.user) {
                     // Adapter to match UserProfileData interface
                    const u = res.user;
                    setProfile({
                        id: u.id,
                        displayName: u.displayName,
                        description: u.bio || '',
                        tags: u.tags || [],
                        thumbnailUrl: u.userIcon || u.profilePicOverride || u.currentAvatarThumbnailImageUrl || '',
                        currentAvatarImageUrl: u.currentAvatarImageUrl || '',
                        status: u.status || 'offline',
                        statusDescription: u.statusDescription || '',
                        last_login: u.last_login || '',
                        developerType: u.developerType || 'none',
                        isFriend: u.isFriend || false
                    });
                } else {
                    setError(res.error || 'Failed to fetch profile');
                }
             } else {
                 // Fallback if no specific endpoint
                 setError("Profile fetch not implemented in this version (API missing)");
             }

        } catch (err) {
            setError('Failed to load profile');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyId = () => {
        if (userId) {
            navigator.clipboard.writeText(userId);
        }
    };

    const handleOpenVRC = () => {
        if (userId) {
            window.open(`https://vrchat.com/home/user/${userId}`, '_blank');
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
            <div style={{ minWidth: '500px', maxWidth: '800px', minHeight: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Header / Loading State */}
                {isLoading ? (
                    <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--color-text-dim)' }}>
                        <Loader2 className="animate-spin" size={32} />
                        <span>Fetching VRChat Data...</span>
                    </div>
                ) : error ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#fca5a5' }}>
                        <ShieldAlert size={32} style={{ marginBottom: '1rem' }} />
                        <div>{error}</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>User ID: {userId}</div>
                    </div>
                ) : profile ? (
                    <>
                        {/* Profile Header */}
                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            {/* Avatar / Thumbnail */}
                            <div style={{ 
                                width: '120px', height: '120px', borderRadius: '12px', 
                                overflow: 'hidden', border: '2px solid var(--color-primary)',
                                background: 'rgba(0,0,0,0.3)', flexShrink: 0
                            }}>
                                <img 
                                    src={profile.currentAvatarImageUrl || profile.thumbnailUrl} 
                                    alt={profile.displayName}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{profile.displayName}</h2>
                                    <span style={{ 
                                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                                        background: profile.status === 'active' ? 'var(--color-success)' : 'rgba(255,255,255,0.1)',
                                        color: profile.status === 'active' ? 'black' : 'white'
                                    }}>
                                        {profile.status.toUpperCase()}
                                    </span>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                    {profile.developerType !== 'none' && (
                                        <span style={{ color: '#fcd34d' }}>Verified Creator</span>
                                    )}
                                    {/* Trust Level would go here if we parsed tags or had it explicitly */}
                                </div>

                                <div style={{ 
                                    background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', 
                                    fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px',
                                    marginTop: 'auto'
                                }}>
                                    <span style={{ opacity: 0.7 }}>ID:</span>
                                    <span style={{ userSelect: 'all' }}>{profile.id}</span>
                                    <button onClick={handleCopyId} title="Copy ID" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}>
                                        <Copy size={14} />
                                    </button>
                                    <button onClick={handleOpenVRC} title="Open on VRChat.com" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>
                                        <ExternalLink size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Bio / Description */}
                        {profile.description && (
                            <GlassPanel style={{ padding: '1rem', fontSize: '0.9rem', lineHeight: '1.5', color: 'rgba(255,255,255,0.9)', maxHeight: '100px', overflowY: 'auto' }}>
                                {profile.description}
                            </GlassPanel>
                        )}

                        {/* Actions Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 'auto' }}>
                            {selectedGroup ? (
                                <>
                                    <NeonButton variant="secondary" onClick={() => onInvite(profile.id, profile.displayName)}>
                                        <UserPlus size={18} />
                                        INVITE TO GROUP
                                    </NeonButton>
                                    
                                    <NeonButton variant="danger" onClick={() => onBan(profile.id, profile.displayName)}>
                                        <Gavel size={18} />
                                        BAN MANAGER
                                    </NeonButton>

                                    <NeonButton variant="danger" style={{ gridColumn: 'span 2' }} onClick={() => onKick(profile.id, profile.displayName)}>
                                        <ShieldAlert size={18} />
                                        KICK FROM INSTANCE
                                    </NeonButton>
                                </>
                            ) : (
                                <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '1rem', color: 'var(--color-text-dim)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                    Select a group to perform moderation actions.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    // Fallback if no profile data but no error (initial load or ID only)
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                         <User size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                         <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>User Profile</div>
                         <div style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', display: 'inline-block' }}>
                             {userId || 'No ID Provided'}
                         </div>
                         <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                            <NeonButton variant="secondary" onClick={handleOpenVRC}>
                                <ExternalLink size={16} /> Open on VRChat.com
                            </NeonButton>
                         </div>
                    </div>
                )}

            </div>
        </Modal>
    );
};
