import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Shield, RefreshCw, Loader2, Crown, ShieldAlert, UserX, Globe, ScanFace } from 'lucide-react';
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
    onAdd: (identifier: string) => Promise<void>;
    groupId?: string; // Optional/Unused now
}> = ({ isOpen, onClose, onAdd }) => {
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!inputValue.trim()) return;

        setLoading(true);
        setError(null);

        try {
            await onAdd(inputValue.trim());
            setInputValue('');
            onClose();
        } catch (e) {
            let msg = String(e);
            // Clean up error message
            if (msg.includes('Error: ')) msg = msg.replace(/^Error: /, '');
            // If it's the specific JSON error object
            try {
                const json = JSON.parse(msg);
                if (json.message) msg = json.message;
            } catch { /* ignore */ }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add Staff Member"
            width="450px"
            footer={
                <>
                    <NeonButton variant="ghost" onClick={onClose}>Cancel</NeonButton>
                    <NeonButton onClick={handleAdd} disabled={loading || !inputValue.trim()} glow>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Add Staff
                    </NeonButton>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Add a staff member by <b>User ID</b> or <b>Exact Username</b>.
                    <br />
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                        The system will automatically resolve the user and whitelist them from all AutoMod actions, kicks, and bans.
                    </span>
                </p>

                <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'block' }}>
                        User ID or Username
                    </label>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => { setInputValue(e.target.value); setError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder="usr_... or Username"
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
                        autoFocus
                    />
                </div>

                {error && (
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '6px',
                        color: '#f87171',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <ShieldAlert size={14} />
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
    icon?: React.ReactNode;
}> = ({ label, description, enabled, onChange, color = '#4ade80', icon }) => {
    return (
        <div
            onClick={() => onChange(!enabled)}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                background: enabled ? `${color}10` : 'var(--color-surface-dark)',
                borderRadius: '8px',
                border: enabled ? `1px solid ${color}60` : '1px solid var(--border-color)', // Highlighted vs Grey
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                gap: '1rem',
                position: 'relative',
                overflow: 'hidden'
            }}
            className="hover:bg-[rgba(255,255,255,0.03)]" // Slight hover effect
        >
            {/* Active Glow Bar for extra flair matching site theme */}
            {enabled && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '3px',
                    background: color,
                    boxShadow: `0 0 10px ${color}`
                }} />
            )}

            <div style={{ flex: 1, paddingLeft: enabled ? '0.5rem' : '0', transition: 'padding 0.2s' }}>
                <div style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: enabled ? 'var(--color-text-main)' : 'var(--color-text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    marginBottom: '0.2rem'
                }}>
                    {icon && <span style={{ color: enabled ? color : 'currentColor', opacity: enabled ? 1 : 0.5 }}>{icon}</span>}
                    {label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '0.1rem', opacity: 0.8 }}>{description}</div>
            </div>

            <div style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: enabled ? color : 'var(--color-text-dim)',
                background: enabled ? `${color}15` : 'rgba(255,255,255,0.03)',
                padding: '4px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                border: enabled ? `1px solid ${color}30` : '1px solid transparent'
            }}>
                {enabled ? 'ON' : 'OFF'}
            </div>
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
            console.log('[Staff] No group selected, clearing staff list');
            setStaffMembers([]);
            setLoading(false);
            return;
        }

        console.log('[Staff] Loading staff for group:', selectedGroup.id);
        console.log('[Staff] staff API available:', !!window.electron.staff);
        console.log('[Staff] getMembers available:', !!window.electron.staff?.getMembers);

        try {
            const members = await window.electron.staff?.getMembers?.(selectedGroup.id);
            console.log('[Staff] Loaded members:', members);
            setStaffMembers(members || []);

            const savedSettings = await window.electron.staff?.getSettings?.(selectedGroup.id);
            console.log('[Staff] Loaded settings:', savedSettings);
            if (savedSettings) {
                setSettings(savedSettings);
            }
        } catch (e) {
            console.error('[Staff] Failed to load staff:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedGroup]);

    useEffect(() => {
        loadStaff();
    }, [loadStaff]);

    // Add staff member
    const handleAddStaff = async (userId: string) => {
        if (!selectedGroup) {
            console.error('[Staff] No group selected');
            throw new Error('Please select a group first');
        }

        console.log('[Staff] Adding staff member:', userId, 'to group:', selectedGroup.id);

        try {
            const result = await window.electron.staff?.addMember?.(selectedGroup.id, userId);
            console.log('[Staff] addMember result:', result);

            if (!result?.success) {
                throw new Error(result?.error || 'Failed to add staff member');
            }

            await loadStaff();
        } catch (e) {
            console.error('[Staff] Failed to add staff:', e);
            throw e;
        }
    };

    // Remove staff member
    const handleRemoveStaff = async (userId: string) => {
        if (!selectedGroup) return;

        console.log('[Staff] Removing staff member:', userId, 'from group:', selectedGroup.id);
        const result = await window.electron.staff?.removeMember?.(selectedGroup.id, userId);
        console.log('[Staff] removeMember result:', result);
        await loadStaff();
    };

    // Update settings
    const handleSettingsChange = async (newSettings: StaffProtectionSettings) => {
        if (!selectedGroup) return;

        console.log('[Staff] Updating settings for group:', selectedGroup.id, newSettings);
        setSettings(newSettings);
        const result = await window.electron.staff?.setSettings?.(selectedGroup.id, newSettings);
        console.log('[Staff] setSettings result:', result);
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
                                    icon={<ScanFace size={18} />}
                                />
                                <ProtectionToggle
                                    label="Prevent Kicks"
                                    description="Staff can't be kicked from the group"
                                    enabled={settings.preventKicks}
                                    onChange={(v) => handleSettingsChange({ ...settings, preventKicks: v })}
                                    color="#f87171"
                                    icon={<UserX size={18} />}
                                />
                                <ProtectionToggle
                                    label="Prevent Bans"
                                    description="Staff can't be banned from the group"
                                    enabled={settings.preventBans}
                                    onChange={(v) => handleSettingsChange({ ...settings, preventBans: v })}
                                    color="#ef4444"
                                    icon={<ShieldAlert size={18} />}
                                />
                                <ProtectionToggle
                                    label="Allow All Instances"
                                    description="Staff can create instances regardless of rules"
                                    enabled={settings.allowAllInstances}
                                    onChange={(v) => handleSettingsChange({ ...settings, allowAllInstances: v })}
                                    color="#3b82f6"
                                    icon={<Globe size={18} />}
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
