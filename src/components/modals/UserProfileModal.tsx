import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { User, Shield, Globe, Users, Clock, BadgeCheck, Crown, Copy, Check, Loader2, History, MapPin, Edit3, Tag } from 'lucide-react';
import styles from '../../features/dashboard/dialogs/UserProfileDialog.module.css';
import { PlayerFlags } from '../ui/PlayerFlags';

interface UserProfileModalProps {
    userId: string;
    onClose: () => void;
    openWorldProfile?: (id: string, name?: string) => void;
    openGroupProfile?: (id: string, name?: string) => void;
}

interface LocalStats {
    firstSeen: string;
    lastSeen: string;
    encounterCount: number;
    timeSpent: number;
    commonWorlds: { name: string; count: number; id: string }[];
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
    userId,
    onClose,
    openWorldProfile,
    openGroupProfile
}) => {
    const [loading, setLoading] = useState(true);
    const [profileData, setProfileData] = useState<any>(null);
    const [stats, setStats] = useState<LocalStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Notes
    const [note, setNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);
    const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const loadData = async () => {
            if (!userId) return;
            setLoading(true);
            setError(null);
            try {
                // 1. Fetch Complete LiveOps Data
                const profileResult = await window.electron.userProfile.getCompleteData(userId);
                if (profileResult.success && profileResult.data) {
                    setProfileData(profileResult.data);
                } else {
                    // Fallback to basic getUser if complete data fails
                    const basicResult = await window.electron.getUser(userId);
                    if (basicResult.success) {
                        setProfileData({ profile: basicResult.user });
                    } else {
                        setError(profileResult.error || 'Failed to load user');
                    }
                }

                // 2. Fetch Local Friendship Stats
                const statsResult = await window.electron.friendship.getPlayerStats(userId);
                if (statsResult.success && statsResult.stats) {
                    const enhancedStats = { ...statsResult.stats };

                    // Try to resolve "Unknown World" names
                    for (let i = 0; i < enhancedStats.commonWorlds.length; i++) {
                        const world = enhancedStats.commonWorlds[i];
                        if (world.name === 'Unknown World' || !world.name) {
                            try {
                                const worldResult = await window.electron.getWorld(world.id);
                                if (worldResult.success && worldResult.world) {
                                    enhancedStats.commonWorlds[i].name = worldResult.world.name;
                                }
                            } catch (err) {
                                console.warn(`Failed to resolve world name for ${world.id}`, err);
                            }
                        }
                    }
                    setStats(enhancedStats);
                }
            } catch (e) {
                console.error('Failed to load user data:', e);
                setError('Failed to load profile');
            } finally {
                setLoading(false);
            }
        };

        loadData();

        // Listen for real-time stats updates
        const removeListener = window.electron.friendship.onStatsUpdate((data) => {
            if (data.userIds.includes(userId)) {
                setStats(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        timeSpent: prev.timeSpent + (data.addedMinutes * 60 * 1000),
                        // Optionally update lastSeen
                        lastSeen: new Date().toISOString()
                    };
                });
            }
        });

        return () => {
            removeListener();
        };
    }, [userId]);

    // Update note state when profile loads
    useEffect(() => {
        if (profileData?.profile) {
            setNote(profileData.profile.note || '');
        }
    }, [profileData]);

    const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setNote(newValue);
        setNoteSaved(false);

        if (typingTimeout) clearTimeout(typingTimeout);

        const timeout = setTimeout(async () => {
            setIsSavingNote(true);
            try {
                await window.electron.userProfile.setUserNote(userId, newValue);
                setNoteSaved(true);
                setTimeout(() => setNoteSaved(false), 2000);
            } catch (err) {
                console.error("Failed to save note", err);
            } finally {
                setIsSavingNote(false);
            }
        }, 1000);

        setTypingTimeout(timeout);
    };

    const handleCopy = async (text: string, fieldName: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const getTrustColor = (trustLevel: string) => {
        const r = (trustLevel || '').toLowerCase();
        if (r.includes('trusted') || r.includes('veteran')) return '#8b2cdb'; // Purple
        if (r.includes('known')) return '#ff7b42';   // Orange
        if (r.includes('user')) return '#2bcf5c';    // Green
        if (r.includes('new')) return '#1778ff';     // Blue
        if (r.includes('visitor')) return '#cccccc'; // Gray
        if (r.includes('legend')) return '#ffd700';  // Gold
        return '#666666';
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatDuration = (ms: number) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    };

    if (!userId) return null;

    const profile = profileData?.profile;

    return (
        <Modal
            isOpen={!!userId}
            onClose={onClose}
            title={profile?.displayName || 'User Profile'}
            width="900px"
        >
            {loading ? (
                <div className={styles.loadingState}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span>Loading profile...</span>
                </div>
            ) : error ? (
                <div className={styles.errorState}>
                    {error}
                </div>
            ) : profile ? (
                <div className={styles.dialogContent}>
                    {/* Profile Grid */}
                    <div className={styles.profileGrid}>
                        {/* Identity Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <User size={16} />
                                Identity
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.profileHeader}>
                                    <img
                                        src={profile.profilePicOverride || profile.currentAvatarThumbnailImageUrl || profile.userIcon}
                                        alt={profile.displayName}
                                        className={styles.avatar}
                                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://assets.vrchat.com/www/images/default-avatar.png'; }}
                                    />
                                    <div className={styles.profileInfo}>
                                        <h3 className={styles.displayName}>{profile.displayName}</h3>
                                        <div className={styles.idRow}>
                                            <code className={styles.userId}>{profile.id}</code>
                                            <button
                                                className={styles.copyBtn}
                                                onClick={() => handleCopy(profile.id, 'id')}
                                            >
                                                {copiedField === 'id' ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                        {profile.pronouns && (
                                            <span className={styles.pronouns}>{profile.pronouns}</span>
                                        )}
                                    </div>
                                </div>

                                {profile.bio && (
                                    <div className={styles.bioSection}>
                                        <label>Bio</label>
                                        <p className={styles.bio}>{profile.bio}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Player Flags Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Tag size={16} />
                                Flag Selection
                            </div>
                            <div className={styles.cardContent}>
                                <PlayerFlags userId={userId} />
                            </div>
                        </div>

                        {/* Personal Note Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Edit3 size={16} />
                                Personal Note
                                <div className={`${styles.saveStatus} ${noteSaved ? styles.saved : ''}`} style={{ marginLeft: 'auto', marginRight: '4px' }}>
                                    {isSavingNote ? (
                                        <>
                                            <Loader2 size={12} className={styles.spin} />
                                            <span>Saving...</span>
                                        </>
                                    ) : noteSaved ? (
                                        <>
                                            <Check size={12} />
                                            <span>Saved</span>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                            <div className={styles.cardContent}>
                                <textarea
                                    className={styles.noteInput}
                                    value={note}
                                    onChange={handleNoteChange}
                                    placeholder="Add a private note about this player..."
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        {/* Trust & Verification Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Shield size={16} />
                                Trust & Verification
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.trustBadge} style={{ borderColor: getTrustColor(profile.$trustLevel) }}>
                                    <span style={{ color: getTrustColor(profile.$trustLevel) }}>
                                        {profile.$trustLevel || 'Unknown'}
                                    </span>
                                </div>

                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>Age Verification</label>
                                        <span className={profile.ageVerificationStatus === '18+' ? styles.verified : ''}>
                                            {profile.ageVerificationStatus || 'hidden'}
                                        </span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>VRC+</label>
                                        <span className={profile.$isVRCPlus ? styles.vrcPlus : ''}>
                                            {profile.$isVRCPlus ? '★ Supporter' : 'No'}
                                        </span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Troll Flag</label>
                                        <span className={profile.$isTroll ? styles.warning : ''}>
                                            {profile.$isTroll ? '⚠ Yes' : 'No'}
                                        </span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Friend</label>
                                        <span>{profile.isFriend ? '✓ Yes' : 'No'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Presence Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Globe size={16} />
                                Presence
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.statusRow}>
                                    <span className={`${styles.statusDot} ${styles[profile.status?.toLowerCase()] || ''}`} />
                                    <span className={styles.statusText}>
                                        {profile.status} {profile.statusDescription && `— ${profile.statusDescription}`}
                                    </span>
                                </div>

                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>State</label>
                                        <span>{profile.state || 'Unknown'}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Platform</label>
                                        <span>{profile.platform || profile.last_platform || 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Account Info Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Clock size={16} />
                                Account
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>Joined</label>
                                        <span>{formatDate(profile.date_joined)}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Last Login</label>
                                        <span>{formatDate(profile.last_login)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Relationship Stats Card (OUR CUSTOM DATA) */}
                        {stats && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <History size={16} />
                                    Relationship Stats
                                </div>
                                <div className={styles.cardContent}>
                                    <div className={styles.fieldGrid}>
                                        <div className={styles.field}>
                                            <label>First Seen</label>
                                            <span>{formatDate(stats.firstSeen)}</span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Last Seen</label>
                                            <span>{formatDate(stats.lastSeen)}</span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Time Together</label>
                                            <span>{formatDuration(stats.timeSpent)}</span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Encounters</label>
                                            <span>{stats.encounterCount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mutuals Card */}
                        {profileData.mutualCounts && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <Users size={16} />
                                    Mutuals
                                </div>
                                <div className={styles.cardContent}>
                                    <div className={styles.mutualStats}>
                                        <div className={styles.mutualStat}>
                                            <div className={styles.mutualIconWrapper} style={{ color: 'var(--color-primary)' }}>
                                                <User size={20} />
                                            </div>
                                            <div className={styles.mutualData}>
                                                <span className={styles.mutualCount}>{profileData.mutualCounts.friends}</span>
                                                <span className={styles.mutualLabel}>Mutual Friends</span>
                                            </div>
                                        </div>
                                        <div className={styles.mutualStat}>
                                            <div className={styles.mutualIconWrapper} style={{ color: 'var(--color-accent)' }}>
                                                <Users size={20} />
                                            </div>
                                            <div className={styles.mutualData}>
                                                <span className={styles.mutualCount}>{profileData.mutualCounts.groups}</span>
                                                <span className={styles.mutualLabel}>Mutual Groups</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tags Card (Always visible, limited height) */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <BadgeCheck size={16} />
                                Tags ({profile.tags?.length || 0})
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.tagsContainer}>
                                    {profile.tags?.slice(0, 15).map((tag: string) => (
                                        <span key={tag} className={styles.tag}>{tag}</span>
                                    ))}
                                    {(profile.tags?.length || 0) > 15 && (
                                        <span className={styles.tagMore}>+{profile.tags!.length - 15} more</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Common Worlds (OUR CUSTOM DATA - Full Width) */}
                    {stats && stats.commonWorlds.length > 0 && (
                        <div className={styles.groupsSection}>
                            <div className={styles.cardHeader}>
                                <MapPin size={16} />
                                Common Worlds
                            </div>
                            <div className={styles.groupsList} style={{ maxHeight: '120px' }}>
                                {stats.commonWorlds.map((world) => (
                                    <div
                                        key={world.id}
                                        className={styles.groupItem}
                                        style={{ cursor: openWorldProfile ? 'pointer' : 'default' }}
                                        onClick={() => openWorldProfile?.(world.id, world.name)}
                                    >
                                        <div className={styles.groupIconPlaceholder}>
                                            <Globe size={14} />
                                        </div>
                                        <div className={styles.groupInfo}>
                                            <div className={styles.groupNameRow}>
                                                <span className={styles.groupName}>{world.name}</span>
                                            </div>
                                            <div className={styles.groupMeta}>
                                                <span>Seen {world.count} times</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* VRChat Groups (LiveOps style - Full Width) */}
                    {profileData.userGroups && profileData.userGroups.length > 0 && (
                        <div className={styles.groupsSection}>
                            <div className={styles.cardHeader}>
                                <Crown size={16} />
                                Groups ({profileData.userGroups.length})
                            </div>
                            <div className={styles.groupsList}>
                                {profileData.userGroups.map((group: any) => (
                                    <div
                                        key={group.id}
                                        className={styles.groupItem}
                                        style={{ cursor: openGroupProfile ? 'pointer' : 'default' }}
                                        onClick={() => openGroupProfile?.(group.groupId, group.name)}
                                    >
                                        {group.iconUrl ? (
                                            <img
                                                src={group.iconUrl}
                                                alt={group.name}
                                                className={styles.groupIcon}
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className={styles.groupIconPlaceholder}>
                                                <Users size={14} />
                                            </div>
                                        )}
                                        <div className={styles.groupInfo}>
                                            <div className={styles.groupNameRow}>
                                                <span className={styles.groupName}>{group.name}</span>
                                                {group.isRepresenting && (
                                                    <span className={styles.representingBadge}>★ Rep</span>
                                                )}
                                                {group.mutualGroup && (
                                                    <span className={styles.mutualBadge}>Mutual</span>
                                                )}
                                            </div>
                                            <div className={styles.groupMeta}>
                                                <code>{group.shortCode}.{group.discriminator}</code>
                                                <span>{group.memberCount.toLocaleString()} members</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </Modal>
    );
};

