import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Play, Globe, Users, MapPin, RefreshCw, Loader2 } from 'lucide-react';
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

interface SavedWorld {
    worldId: string;
    name: string;
    thumbnailUrl?: string;
    authorName?: string;
    capacity?: number;
    addedAt: number;
}

interface LaunchOptions {
    region: 'us' | 'use' | 'eu' | 'jp';
    groupAccessType: 'members' | 'plus' | 'public';
    ageGate: boolean;
    queueEnabled: boolean;
}

interface GroupRole {
    id: string;
    name: string;
    description?: string;
}

// Saved World Card Component
const SavedWorldCard: React.FC<{
    world: SavedWorld;
    onLaunch: () => void;
    onRemove: () => void;
    isLaunching?: boolean;
}> = ({ world, onLaunch, onRemove, isLaunching }) => {
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
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.2s ease'
            }}
        >
            {/* Thumbnail */}
            {world.thumbnailUrl ? (
                <img
                    src={world.thumbnailUrl}
                    alt={world.name}
                    style={{
                        width: '80px',
                        height: '60px',
                        borderRadius: '8px',
                        objectFit: 'cover',
                        flexShrink: 0
                    }}
                />
            ) : (
                <div style={{
                    width: '80px',
                    height: '60px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-overlay)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <Globe size={24} style={{ color: 'var(--color-text-dim)' }} />
                </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {world.name || 'Unknown World'}
                </div>
                <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '0.25rem',
                    flexWrap: 'wrap'
                }}>
                    {world.authorName && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                            by {world.authorName}
                        </span>
                    )}
                    {world.capacity && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> {world.capacity}
                        </span>
                    )}
                </div>
                <code style={{
                    fontSize: '0.65rem',
                    color: 'var(--color-text-dim)',
                    opacity: 0.7
                }}>
                    {world.worldId.substring(0, 25)}...
                </code>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <NeonButton
                    variant="primary"
                    size="sm"
                    onClick={onLaunch}
                    disabled={isLaunching}
                    style={{ padding: '8px 16px' }}
                    glow
                >
                    {isLaunching ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    Launch
                </NeonButton>
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
                        justifyContent: 'center'
                    }}
                    title="Remove from list"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </motion.div>
    );
};

// Add World Modal
const AddWorldModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (worldId: string) => Promise<void>;
}> = ({ isOpen, onClose, onAdd }) => {
    const [worldId, setWorldId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!worldId.trim()) return;

        if (!worldId.trim().startsWith('wrld_')) {
            setError('World ID must start with "wrld_"');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onAdd(worldId.trim());
            setWorldId('');
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
            title="Add World to Quickstart"
            width="450px"
            footer={
                <>
                    <NeonButton variant="ghost" onClick={onClose}>Cancel</NeonButton>
                    <NeonButton onClick={handleAdd} disabled={loading || !worldId.trim()} glow>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Add World
                    </NeonButton>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Add a world by its World ID to quickly launch instances from the panel.
                </p>

                <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'block' }}>
                        World ID
                    </label>
                    <input
                        type="text"
                        value={worldId}
                        onChange={(e) => { setWorldId(e.target.value); setError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder="wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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

// Main Quickstart View
export const QuickstartView: React.FC = () => {
    const { selectedGroup } = useGroupStore();

    // State
    const [savedWorlds, setSavedWorlds] = useState<SavedWorld[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [launchingWorld, setLaunchingWorld] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [groupRoles, setGroupRoles] = useState<GroupRole[]>([]);

    // Launch Options
    const [launchOptions, setLaunchOptions] = useState<LaunchOptions>({
        region: 'us',
        groupAccessType: 'members',
        ageGate: false,
        queueEnabled: false
    });
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

    // Load saved worlds
    const loadWorlds = useCallback(async () => {
        if (!selectedGroup) {
            setSavedWorlds([]);
            setLoading(false);
            return;
        }

        try {
            const worlds = await window.electron.quickstart?.getWorlds?.(selectedGroup.id);
            setSavedWorlds(worlds || []);
        } catch (e) {
            console.error('Failed to load quickstart worlds:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedGroup]);

    // Load group roles
    const loadRoles = useCallback(async () => {
        if (!selectedGroup) {
            setGroupRoles([]);
            return;
        }

        try {
            const result = await window.electron.quickstart?.getRoles?.(selectedGroup.id);
            if (result?.success) {
                setGroupRoles(result.roles || []);
            } else {
                setGroupRoles([]);
            }
        } catch (e) {
            console.error('Failed to load group roles:', e);
        }
    }, [selectedGroup]);

    useEffect(() => {
        loadWorlds();
        loadRoles();
    }, [loadWorlds, loadRoles]);

    // Add world
    const handleAddWorld = async (worldId: string) => {
        if (!selectedGroup) return;

        await window.electron.quickstart?.addWorld?.(selectedGroup.id, worldId);
        await loadWorlds();
    };

    // Remove world
    const handleRemoveWorld = async (worldId: string) => {
        if (!selectedGroup) return;

        await window.electron.quickstart?.removeWorld?.(selectedGroup.id, worldId);
        await loadWorlds();
    };

    // Launch instance
    const handleLaunch = async (worldId: string) => {
        if (!selectedGroup) return;

        setLaunchingWorld(worldId);

        try {
            // Map groupAccessType to type
            const typeMap: Record<string, 'group' | 'group+' | 'groupPublic'> = {
                'members': 'group',
                'plus': 'group+',
                'public': 'groupPublic'
            };

            const result = await window.electron.quickstart?.launchInstance?.(
                selectedGroup.id,
                {
                    worldId,
                    type: typeMap[launchOptions.groupAccessType] || 'group',
                    region: launchOptions.region,
                    ageGate: launchOptions.ageGate,
                    queueEnabled: launchOptions.queueEnabled,
                    roleIds: selectedRoles
                }
            );

            if (result?.success) {
                // Show success notification or toast
                console.log('Instance launched successfully:', result);
            } else {
                console.error('Failed to launch instance:', result?.error);
            }
        } catch (e) {
            console.error('Failed to launch instance:', e);
        } finally {
            setLaunchingWorld(null);
        }
    };

    // Stats
    const lastLaunched = savedWorlds.length > 0
        ? new Date(Math.max(...savedWorlds.map(w => w.addedAt))).toLocaleDateString()
        : 'Never';

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
                        Please select a group to use Quickstart.
                    </div>
                )}

                {/* Header */}
                <GlassPanel className={styles.headerPanel} style={{ flexShrink: 0 }}>
                    <div className={styles.titleSection}>
                        <h1 className={`${styles.title} text-gradient`}>
                            Quickstart
                        </h1>
                        <div className={styles.subtitle}>
                            INSTANCE LAUNCHER
                        </div>
                    </div>

                    <div className={styles.statsGrid}>
                        <StatTile
                            label="SAVED WORLDS"
                            value={savedWorlds.length}
                            color="var(--color-primary)"
                        />
                        <StatTile
                            label="GROUP"
                            value={selectedGroup?.name?.substring(0, 12) || 'None'}
                            color="var(--color-success)"
                        />
                        <StatTile
                            label="REGION"
                            value={launchOptions.region.toUpperCase()}
                            color="var(--color-warning)"
                        />
                    </div>
                </GlassPanel>

                {/* Main Content */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* Left: Saved Worlds */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        <div style={{
                            padding: '1rem',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Saved Worlds</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <NeonButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={loadWorlds}
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
                                    <Plus size={14} /> Add World
                                </NeonButton>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            {loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                                </div>
                            ) : savedWorlds.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <AnimatePresence>
                                        {savedWorlds.map((world) => (
                                            <SavedWorldCard
                                                key={world.worldId}
                                                world={world}
                                                onLaunch={() => handleLaunch(world.worldId)}
                                                onRemove={() => handleRemoveWorld(world.worldId)}
                                                isLaunching={launchingWorld === world.worldId}
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
                                    <Zap size={48} style={{ opacity: 0.4 }} />
                                    <span style={{ fontSize: '1rem' }}>No saved worlds yet</span>
                                    <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Add worlds to quickly launch group instances</span>
                                    <NeonButton
                                        variant="primary"
                                        onClick={() => setShowAddModal(true)}
                                        disabled={!selectedGroup}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        <Plus size={16} /> Add Your First World
                                    </NeonButton>
                                </div>
                            )}
                        </div>
                    </GlassPanel>

                    {/* Right: Launch Options */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Launch Options</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                Configure how new instances are created.
                            </p>

                            {/* Region */}
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={14} /> Region
                                </label>
                                <select
                                    value={launchOptions.region}
                                    onChange={(e) => setLaunchOptions({ ...launchOptions, region: e.target.value as LaunchOptions['region'] })}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.75rem',
                                        background: 'var(--color-surface-dark)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-main)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="us">US West</option>
                                    <option value="use">US East</option>
                                    <option value="eu">Europe</option>
                                    <option value="jp">Japan</option>
                                </select>
                            </div>

                            {/* Access Type */}
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Users size={14} /> Access Type
                                </label>
                                <select
                                    value={launchOptions.groupAccessType}
                                    onChange={(e) => setLaunchOptions({ ...launchOptions, groupAccessType: e.target.value as LaunchOptions['groupAccessType'] })}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.75rem',
                                        background: 'var(--color-surface-dark)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-main)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="members">Group Members Only</option>
                                    <option value="plus">Group+ (Members can invite)</option>
                                    <option value="public">Public</option>
                                </select>
                            </div>

                            {/* Toggles */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* Age Gate */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem 0.75rem',
                                    background: 'var(--color-surface-dark)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-main)' }}>18+ Age Gate</span>
                                    <button
                                        onClick={() => setLaunchOptions({ ...launchOptions, ageGate: !launchOptions.ageGate })}
                                        style={{
                                            width: '40px',
                                            height: '22px',
                                            borderRadius: '20px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: launchOptions.ageGate ? 'var(--color-success)' : 'var(--color-surface-overlay)',
                                            position: 'relative',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '50%',
                                            background: 'white',
                                            position: 'absolute',
                                            top: '2px',
                                            left: launchOptions.ageGate ? '20px' : '2px',
                                            transition: 'left 0.2s'
                                        }} />
                                    </button>
                                </div>

                                {/* Queue */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem 0.75rem',
                                    background: 'var(--color-surface-dark)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-main)' }}>Enable Queue</span>
                                    <button
                                        onClick={() => setLaunchOptions({ ...launchOptions, queueEnabled: !launchOptions.queueEnabled })}
                                        style={{
                                            width: '40px',
                                            height: '22px',
                                            borderRadius: '20px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: launchOptions.queueEnabled ? 'var(--color-success)' : 'var(--color-surface-overlay)',
                                            position: 'relative',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '50%',
                                            background: 'white',
                                            position: 'absolute',
                                            top: '2px',
                                            left: launchOptions.queueEnabled ? '20px' : '2px',
                                            transition: 'left 0.2s'
                                        }} />
                                    </button>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* Role Restrictions */}
                        {groupRoles.length > 0 && (
                            <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', overflowY: 'auto' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Role Restrictions</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                    Optionally restrict to specific roles.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {groupRoles.map((role) => (
                                        <label
                                            key={role.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.5rem 0.75rem',
                                                background: selectedRoles.includes(role.id) ? 'rgba(74, 222, 128, 0.1)' : 'var(--color-surface-dark)',
                                                border: selectedRoles.includes(role.id) ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedRoles.includes(role.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedRoles([...selectedRoles, role.id]);
                                                    } else {
                                                        setSelectedRoles(selectedRoles.filter(id => id !== role.id));
                                                    }
                                                }}
                                                style={{ accentColor: 'var(--color-success)' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-main)' }}>{role.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </GlassPanel>
                        )}

                        {groupRoles.length === 0 && (
                            <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}>
                                <Zap size={32} style={{ color: 'var(--color-primary)', opacity: 0.5 }} />
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', textAlign: 'center' }}>
                                    Select a world and click Launch to create a new group instance
                                </span>
                            </GlassPanel>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Add World Modal */}
            <AddWorldModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onAdd={handleAddWorld}
            />
        </>
    );
};
