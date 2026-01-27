import React, { useState, useEffect, useCallback } from 'react';
import { UserCheck, Plus, Trash2, Shield, Search, RefreshCw, Loader2, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { StatTile } from '../dashboard/components/StatTile';
import { useGroupStore } from '../../stores/groupStore';
import { Modal } from '../../components/ui/Modal';
import styles from '../automod/AutoModView.module.css';

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2
        }
    }
};

interface StaffMember {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    addedAt: number;
    addedBy?: string;
    note?: string;
}

interface StaffProtectionSettings {
    skipAutoModScans: boolean;
    preventKicks: boolean;
    preventBans: boolean;
    allowAllInstances: boolean;
}

// Staff Member Card Component
const StaffMemberCard: React.FC<{
    member: StaffMember;
    onRemove: () => void;
}> = ({ member, onRemove }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem',
                background: 'rgba(74, 222, 128, 0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(74, 222, 128, 0.15)',
                transition: 'all 0.2s ease'
            }}
        >
            {/* Avatar */}
            {member.avatarUrl ? (
                <img
                    src={member.avatarUrl}
                    alt={member.displayName}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '2px solid rgba(74, 222, 128, 0.3)'
                    }}
                />
            ) : (
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'var(--color-surface-overlay)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '2px solid rgba(74, 222, 128, 0.3)'
                }}>
                    <Crown size={20} style={{ color: '#4ade80' }} />
                </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <span style={{
                        fontWeight: 600,
                        color: 'var(--color-text-main)',
                        fontSize: '0.95rem'
                    }}>
                        {member.displayName}
                    </span>
                    <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        background: 'rgba(74, 222, 128, 0.2)',
                        color: '#4ade80',
                        borderRadius: '4px',
                        fontWeight: 600
                    }}>
                        STAFF
                    </span>
                </div>
                <code style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-dim)',
                    opacity: 0.8
                }}>
                    {member.userId}
                </code>
                <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-dim)',
                    marginTop: '0.25rem'
                }}>
                    Added {new Date(member.addedAt).toLocaleDateString()}
                </div>
            </div>

            {/* Actions */}
            <button
                onClick={onRemove}
                style={{
                    padding: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '6px',
                    color: '#f87171',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}
                title="Remove from staff"
            >
                <Trash2 size={16} />
            </button>
        </motion.div>
    );
};

// Add Staff Modal
const AddStaffModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (userId: string) => Promise<void>;
    groupId: string;
}> = ({ isOpen, onClose, onAdd, groupId }) => {
    const [searchMode, setSearchMode] = useState<'id' | 'search'>('id');
    const [userId, setUserId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string; avatarUrl?: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAddById = async () => {
        if (!userId.trim()) return;

        if (!userId.trim().startsWith('usr_')) {
            setError('User ID must start with "usr_"');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onAdd(userId.trim());
            setUserId('');
            onClose();
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !groupId) return;

        setSearching(true);
        setError(null);

        try {
            const result = await window.electron.staff?.searchMembers?.(groupId, searchQuery.trim());
            if (result?.success && result.members) {
                const formattedResults = result.members.map((m: { user?: { id: string; displayName: string; currentAvatarThumbnailImageUrl?: string } }) => ({
                    id: m.user?.id || '',
                    displayName: m.user?.displayName || 'Unknown',
                    avatarUrl: m.user?.currentAvatarThumbnailImageUrl
                })).filter((r: { id: string }) => r.id);
                setSearchResults(formattedResults);
                if (formattedResults.length === 0) {
                    setError('No users found');
                }
            } else {
                setSearchResults([]);
                setError(result?.error || 'No users found');
            }
        } catch (e) {
            setError(String(e));
        } finally {
            setSearching(false);
        }
    };

    const handleSelectUser = async (selectedUserId: string) => {
        setLoading(true);
        setError(null);

        try {
            await onAdd(selectedUserId);
            setSearchQuery('');
            setSearchResults([]);
            onClose();
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add Staff Member"
            width="500px"
            footer={searchMode === 'id' ? (
                <>
                    <NeonButton variant="ghost" onClick={onClose}>Cancel</NeonButton>
                    <NeonButton onClick={handleAddById} disabled={loading || !userId.trim()} glow>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Add Staff
                    </NeonButton>
                </>
            ) : (
                <NeonButton variant="ghost" onClick={onClose}>Close</NeonButton>
            )}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Add a staff member to protect them from all AutoMod actions.
                </p>

                {/* Mode Toggle */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setSearchMode('id')}
                        style={{
                            flex: 1,
                            padding: '0.6rem',
                            background: searchMode === 'id' ? 'var(--color-primary)' : 'var(--color-surface-dark)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--color-text-main)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: searchMode === 'id' ? 600 : 400
                        }}
                    >
                        By User ID
                    </button>
                    <button
                        onClick={() => setSearchMode('search')}
                        style={{
                            flex: 1,
                            padding: '0.6rem',
                            background: searchMode === 'search' ? 'var(--color-primary)' : 'var(--color-surface-dark)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--color-text-main)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: searchMode === 'search' ? 600 : 400
                        }}
                    >
                        Search User
                    </button>
                </div>

                {searchMode === 'id' ? (
                    <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'block' }}>
                            User ID
                        </label>
                        <input
                            type="text"
                            value={userId}
                            onChange={(e) => { setUserId(e.target.value); setError(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddById()}
                            placeholder="usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                background: 'var(--color-surface-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--color-text-main)',
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search by username..."
                                style={{
                                    flex: 1,
                                    padding: '0.75rem 1rem',
                                    background: 'var(--color-surface-dark)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    color: 'var(--color-text-main)',
                                    fontSize: '0.9rem',
                                    outline: 'none'
                                }}
                            />
                            <NeonButton onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            </NeonButton>
                        </div>

                        {searchResults.length > 0 && (
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                {searchResults.map((user) => (
                                    <div
                                        key={user.id}
                                        onClick={() => handleSelectUser(user.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.6rem',
                                            background: 'var(--color-surface-dark)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt={user.displayName} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                                        ) : (
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <UserCheck size={16} style={{ color: 'var(--color-text-dim)' }} />
                                            </div>
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.displayName}</div>
                                            <code style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>{user.id}</code>
                                        </div>
                                        <Plus size={16} style={{ color: 'var(--color-success)' }} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '6px',
                        color: '#f87171',
                        fontSize: '0.8rem'
                    }}>
                        {error}
                    </div>
                )}
            </div>
        </Modal>
    );
};

// Protection Setting Toggle
const ProtectionToggle: React.FC<{
    label: string;
    description: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    color?: string;
}> = ({ label, description, enabled, onChange, color = '#4ade80' }) => {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '0.75rem',
            background: enabled ? `${color}10` : 'var(--color-surface-dark)',
            borderRadius: '8px',
            border: enabled ? `1px solid ${color}30` : '1px solid var(--border-color)',
            gap: '1rem',
            transition: 'all 0.2s'
        }}>
            <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-text-main)' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '0.2rem' }}>{description}</div>
            </div>
            <button
                onClick={() => onChange(!enabled)}
                style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '20px',
                    border: 'none',
                    cursor: 'pointer',
                    background: enabled ? color : 'var(--color-surface-overlay)',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0
                }}
            >
                <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: enabled ? '22px' : '2px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
            </button>
        </div>
    );
};

// Main Staff View
export const StaffView: React.FC = () => {
    const { selectedGroup } = useGroupStore();

    // State
    const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<StaffProtectionSettings>({
        skipAutoModScans: true,
        preventKicks: true,
        preventBans: true,
        allowAllInstances: true
    });

    // Load staff members
    const loadStaff = useCallback(async () => {
        if (!selectedGroup) {
            setStaffMembers([]);
            setLoading(false);
            return;
        }

        try {
            const members = await window.electron.staff?.getMembers?.(selectedGroup.id);
            setStaffMembers(members || []);

            const savedSettings = await window.electron.staff?.getSettings?.(selectedGroup.id);
            if (savedSettings) {
                setSettings(savedSettings);
            }
        } catch (e) {
            console.error('Failed to load staff:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedGroup]);

    useEffect(() => {
        loadStaff();
    }, [loadStaff]);

    // Add staff member
    const handleAddStaff = async (userId: string) => {
        if (!selectedGroup) return;

        await window.electron.staff?.addMember?.(selectedGroup.id, userId);
        await loadStaff();
    };

    // Remove staff member
    const handleRemoveStaff = async (userId: string) => {
        if (!selectedGroup) return;

        await window.electron.staff?.removeMember?.(selectedGroup.id, userId);
        await loadStaff();
    };

    // Update settings
    const handleSettingsChange = async (newSettings: StaffProtectionSettings) => {
        if (!selectedGroup) return;

        setSettings(newSettings);
        await window.electron.staff?.setSettings?.(selectedGroup.id, newSettings);
    };

    return (
        <>
            <motion.div
                className={styles.container}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', padding: '1rem', paddingBottom: 'var(--dock-height)' }}
            >
                {!selectedGroup && (
                    <div style={{ padding: '1rem', background: 'rgba(255,165,0, 0.2)', border: '1px solid orange', borderRadius: '8px', color: '#ffcc00' }}>
                        Please select a group to manage staff.
                    </div>
                )}

                {/* Header */}
                <GlassPanel className={styles.headerPanel} style={{ flexShrink: 0 }}>
                    <div className={styles.titleSection}>
                        <h1 className={`${styles.title} text-gradient`}>
                            Staff
                        </h1>
                        <div className={styles.subtitle}>
                            STAFF MANAGEMENT
                        </div>
                    </div>

                    <div className={styles.statsGrid}>
                        <StatTile
                            label="STAFF MEMBERS"
                            value={staffMembers.length}
                            color="#4ade80"
                        />
                        <StatTile
                            label="PROTECTIONS"
                            value={Object.values(settings).filter(Boolean).length}
                            color="var(--color-primary)"
                        />
                        <StatTile
                            label="STATUS"
                            value={staffMembers.length > 0 ? "ACTIVE" : "SETUP"}
                            color={staffMembers.length > 0 ? "var(--color-success)" : "var(--color-warning)"}
                        />
                    </div>
                </GlassPanel>

                {/* Main Content */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* Left: Staff List */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        <div style={{
                            padding: '1rem',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Crown size={18} style={{ color: '#4ade80' }} />
                                Staff List
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <NeonButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={loadStaff}
                                    style={{ padding: '6px' }}
                                >
                                    <RefreshCw size={14} />
                                </NeonButton>
                                <NeonButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setShowAddModal(true)}
                                    disabled={!selectedGroup}
                                >
                                    <Plus size={14} /> Add Staff
                                </NeonButton>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            {loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                                </div>
                            ) : staffMembers.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <AnimatePresence>
                                        {staffMembers.map((member) => (
                                            <StaffMemberCard
                                                key={member.userId}
                                                member={member}
                                                onRemove={() => handleRemoveStaff(member.userId)}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    gap: '0.75rem',
                                    color: 'var(--color-text-dim)'
                                }}>
                                    <Crown size={48} style={{ opacity: 0.4, color: '#4ade80' }} />
                                    <span style={{ fontSize: '1rem' }}>No staff members yet</span>
                                    <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Add staff to protect them from AutoMod actions</span>
                                    <NeonButton
                                        variant="primary"
                                        onClick={() => setShowAddModal(true)}
                                        disabled={!selectedGroup}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        <Plus size={16} /> Add First Staff Member
                                    </NeonButton>
                                </div>
                            )}
                        </div>
                    </GlassPanel>

                    {/* Right: Protection Settings */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Shield size={18} style={{ color: '#4ade80' }} />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Protection Settings</h3>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                Configure what staff members are protected from.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <ProtectionToggle
                                    label="Skip AutoMod Scans"
                                    description="Staff won't be scanned by AutoMod rules"
                                    enabled={settings.skipAutoModScans}
                                    onChange={(v) => handleSettingsChange({ ...settings, skipAutoModScans: v })}
                                />
                                <ProtectionToggle
                                    label="Prevent Kicks"
                                    description="Staff can't be kicked from the group"
                                    enabled={settings.preventKicks}
                                    onChange={(v) => handleSettingsChange({ ...settings, preventKicks: v })}
                                />
                                <ProtectionToggle
                                    label="Prevent Bans"
                                    description="Staff can't be banned from the group"
                                    enabled={settings.preventBans}
                                    onChange={(v) => handleSettingsChange({ ...settings, preventBans: v })}
                                />
                                <ProtectionToggle
                                    label="Allow All Instances"
                                    description="Staff can create instances regardless of rules"
                                    enabled={settings.allowAllInstances}
                                    onChange={(v) => handleSettingsChange({ ...settings, allowAllInstances: v })}
                                    color="#3b82f6"
                                />
                            </div>
                        </GlassPanel>

                        {/* Info Panel */}
                        <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>How It Works</h3>

                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                fontSize: '0.8rem',
                                color: 'var(--color-text-dim)'
                            }}>
                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(74, 222, 128, 0.05)',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #4ade80'
                                }}>
                                    <strong style={{ color: '#4ade80' }}>Staff Whitelist</strong>
                                    <p style={{ margin: '0.25rem 0 0' }}>
                                        Staff members are automatically exempt from all AutoMod actions based on your protection settings.
                                    </p>
                                </div>

                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(59, 130, 246, 0.05)',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #3b82f6'
                                }}>
                                    <strong style={{ color: '#3b82f6' }}>Global Protection</strong>
                                    <p style={{ margin: '0.25rem 0 0' }}>
                                        Protections apply across ALL AutoMod rules - staff are checked first before any rule evaluation.
                                    </p>
                                </div>

                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(251, 191, 36, 0.05)',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #fbbf24'
                                }}>
                                    <strong style={{ color: '#fbbf24' }}>Tip</strong>
                                    <p style={{ margin: '0.25rem 0 0' }}>
                                        Add your moderators and trusted members to prevent accidental bans or kicks.
                                    </p>
                                </div>
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            </motion.div>

            {/* Add Staff Modal */}
            <AddStaffModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onAdd={handleAddStaff}
                groupId={selectedGroup?.id || ''}
            />
        </>
    );
};
