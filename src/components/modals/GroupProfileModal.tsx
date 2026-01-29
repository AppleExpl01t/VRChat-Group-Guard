import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Users, Shield, Copy, Check, Loader2, Crown } from 'lucide-react';
import styles from '../../features/dashboard/dialogs/UserProfileDialog.module.css';

interface GroupProfileModalProps {
    groupId: string;
    onClose: () => void;
    openUserProfile?: (id: string, name?: string) => void;
}

export const GroupProfileModal: React.FC<GroupProfileModalProps> = ({ groupId, onClose, openUserProfile }) => {
    const [loading, setLoading] = useState(true);
    const [groupData, setGroupData] = useState<any>(null);
    const [ownerData, setOwnerData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            if (!groupId) return;
            setLoading(true);
            setError(null);
            try {
                const result = await window.electron.getGroupPublicDetails(groupId);
                if (result.success && result.group) {
                    setGroupData(result.group);

                    // Fetch owner details
                    if (result.group.ownerId) {
                        try {
                            const ownerResult = await window.electron.getUser(result.group.ownerId);
                            if (ownerResult.success) {
                                setOwnerData(ownerResult.user);
                            }
                        } catch (err) {
                            console.warn('Failed to fetch owner details:', err);
                        }
                    }
                } else {
                    setError(result.error || 'Failed to load group details');
                }
            } catch (e) {
                console.error('Failed to load group data:', e);
                setError('Failed to load group info');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [groupId]);

    const handleCopy = async (text: string, fieldName: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    if (!groupId) return null;

    return (
        <Modal
            isOpen={!!groupId}
            onClose={onClose}
            title={groupData?.name || 'Group Info'}
            width="900px"
        >
            {loading ? (
                <div className={styles.loadingState}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span>Loading group...</span>
                </div>
            ) : error ? (
                <div className={styles.errorState}>
                    {error}
                </div>
            ) : groupData ? (
                <div className={styles.dialogContent}>
                    {/* Header Banner (Optional for Groups) */}
                    {groupData.bannerUrl && (
                        <div style={{ width: '100%', height: '180px', borderRadius: 'var(--border-radius)', overflow: 'hidden', border: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                            <img src={groupData.bannerUrl} alt={groupData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                    )}

                    <div className={styles.profileGrid}>
                        {/* Identity Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Users size={16} />
                                Group Identity
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.profileHeader}>
                                    {groupData.iconUrl ? (
                                        <img
                                            src={groupData.iconUrl}
                                            alt={groupData.name}
                                            className={styles.avatar}
                                            style={{ borderRadius: '12px' }}
                                        />
                                    ) : (
                                        <div className={styles.avatar} style={{ background: 'var(--color-surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Users size={24} color="var(--color-text-dim)" />
                                        </div>
                                    )}
                                    <div className={styles.profileInfo}>
                                        <h3 className={styles.displayName}>{groupData.name}</h3>
                                        <div className={styles.idRow}>
                                            <code className={styles.userId}>{groupData.id}</code>
                                            <button
                                                className={styles.copyBtn}
                                                onClick={() => handleCopy(groupData.id, 'id')}
                                            >
                                                {copiedField === 'id' ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                        {groupData.shortCode && (
                                            <span className={styles.pronouns} style={{ background: 'rgba(var(--color-primary-rgb), 0.1)', color: 'var(--color-primary)', fontWeight: 700 }}>
                                                {groupData.shortCode}.{groupData.discriminator}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {groupData.description && (
                                    <div className={styles.bioSection} style={{ marginTop: '1rem', borderTop: 'none' }}>
                                        <label>Description</label>
                                        <p className={styles.bio} style={{ maxHeight: 'none', overflowY: 'visible' }}>
                                            {groupData.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Stats & Owner */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Stats Card */}
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <Shield size={16} />
                                    Group Stats
                                </div>
                                <div className={styles.cardContent}>
                                    <div className={styles.fieldGrid}>
                                        <div className={styles.field}>
                                            <label>Members</label>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                                {groupData.memberCount?.toLocaleString() || 0}
                                            </span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Privacy</label>
                                            <span style={{ textTransform: 'capitalize' }}>
                                                {groupData.privacy || 'Unknown'}
                                            </span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Join State</label>
                                            <span>{groupData.joinState || 'Unknown'}</span>
                                        </div>
                                        <div className={styles.field}>
                                            <label>Roles</label>
                                            <span>{groupData.roles?.length || 0} roles</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Owner Overview Card */}
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <Crown size={16} />
                                    Group Owner
                                </div>
                                <div className={styles.cardContent}>
                                    {ownerData ? (
                                        <div className={styles.profileHeader} style={{ padding: 0 }}>
                                            <img
                                                src={ownerData.userIcon || ownerData.currentAvatarThumbnailImageUrl}
                                                alt={ownerData.displayName}
                                                className={styles.avatar}
                                                style={{ width: '48px', height: '48px' }}
                                            />
                                            <div className={styles.profileInfo}>
                                                <h4 className={styles.displayName} style={{ fontSize: '1rem' }}>{ownerData.displayName}</h4>
                                                <div className={styles.idRow}>
                                                    <code className={styles.userId} style={{ fontSize: '0.7rem' }}>{ownerData.id}</code>
                                                    <button
                                                        className={styles.copyBtn}
                                                        onClick={() => handleCopy(ownerData.id, 'ownerId')}
                                                    >
                                                        {copiedField === 'ownerId' ? <Check size={10} /> : <Copy size={10} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={styles.idRow}>
                                            <code className={styles.userId}>{groupData.ownerId}</code>
                                            <button
                                                className={styles.copyBtn}
                                                onClick={() => handleCopy(groupData.ownerId, 'ownerId')}
                                            >
                                                {copiedField === 'ownerId' ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                    )}

                                    {groupData.ownerId && (
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                            <button
                                                className={styles.copyBtn}
                                                onClick={() => openUserProfile?.(groupData.ownerId)}
                                                style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', fontSize: '0.8rem', background: 'rgba(var(--color-primary-rgb), 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(var(--color-primary-rgb), 0.2)' }}
                                            >
                                                View Local Profile
                                            </button>
                                            <a
                                                href={`https://vrchat.com/home/user/${groupData.ownerId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.copyBtn}
                                                style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                            >
                                                VRChat Profile
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Roles Section (Full Width) */}
                    {groupData.roles && groupData.roles.length > 0 && (
                        <div className={styles.groupsSection}>
                            <div className={styles.cardHeader}>
                                <Crown size={16} />
                                Roles ({groupData.roles.length})
                            </div>
                            <div className={styles.groupsList} style={{ maxHeight: '200px' }}>
                                {groupData.roles.map((role: any) => (
                                    <div key={role.id} className={styles.groupItem}>
                                        <div className={styles.groupIconPlaceholder}>
                                            <Shield size={14} />
                                        </div>
                                        <div className={styles.groupInfo}>
                                            <div className={styles.groupNameRow}>
                                                <span className={styles.groupName}>{role.name}</span>
                                            </div>
                                            <div className={styles.groupMeta}>
                                                <span>{role.description || 'No description'}</span>
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
