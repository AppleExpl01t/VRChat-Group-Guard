import React, { useState, useEffect } from 'react';
import { Globe, ShieldOff, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { NeonButton } from '../../components/ui/NeonButton';

interface WorldInfo {
    id: string;
    name?: string;
    thumbnailUrl?: string;
    authorName?: string;
}

interface WorldListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (worldIds: string[]) => void;
    title: string;
    description: string;
    initialWorldIds: string[];
    type: 'whitelist' | 'blacklist';
}

export const WorldListModal: React.FC<WorldListModalProps> = ({
    isOpen,
    onClose,
    onSave,
    title,
    description,
    initialWorldIds,
    type
}) => {
    const [worldIds, setWorldIds] = useState<string[]>(initialWorldIds);
    const [worldInfoMap, setWorldInfoMap] = useState<Record<string, WorldInfo>>({});
    const [newWorldId, setNewWorldId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setWorldIds(initialWorldIds);
    }, [initialWorldIds]);

    // Fetch world info for display
    useEffect(() => {
        const fetchWorldInfo = async (worldId: string) => {
            if (worldInfoMap[worldId]) return;

            try {
                const result = await window.electron.getWorld(worldId);
                if (result?.success && result?.world) {
                    setWorldInfoMap(prev => ({
                        ...prev,
                        [worldId]: {
                            id: worldId,
                            name: result.world?.name || 'Unknown World',
                            thumbnailUrl: result.world?.imageUrl,
                            authorName: result.world?.authorName
                        }
                    }));
                }
            } catch (e) {
                console.error('Failed to fetch world info:', e);
            }
        };

        worldIds.forEach(id => fetchWorldInfo(id));
    }, [worldIds, worldInfoMap]);

    const handleAddWorld = async () => {
        const trimmedId = newWorldId.trim();
        if (!trimmedId) return;

        // Validate world ID format
        if (!trimmedId.startsWith('wrld_')) {
            setError('World ID must start with "wrld_"');
            return;
        }

        if (worldIds.includes(trimmedId)) {
            setError('This world is already in the list');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Try to fetch world info to validate it exists
            const result = await window.electron.getWorld(trimmedId);
            if (result?.success && result?.world) {
                setWorldInfoMap(prev => ({
                    ...prev,
                    [trimmedId]: {
                        id: trimmedId,
                        name: result.world?.name || 'Unknown World',
                        thumbnailUrl: result.world?.imageUrl,
                        authorName: result.world?.authorName
                    }
                }));
                setWorldIds([...worldIds, trimmedId]);
                setNewWorldId('');
            } else {
                // Still add it even if we can't fetch info
                setWorldIds([...worldIds, trimmedId]);
                setNewWorldId('');
            }
        } catch (e) {
            // Still add it even if fetch fails
            setWorldIds([...worldIds, trimmedId]);
            setNewWorldId('');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveWorld = (idToRemove: string) => {
        setWorldIds(worldIds.filter(id => id !== idToRemove));
    };

    const handleSave = () => {
        onSave(worldIds);
        onClose();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !loading) {
            handleAddWorld();
        }
    };

    const accentColor = type === 'whitelist' ? '#4ade80' : '#ef4444';
    const accentBg = type === 'whitelist' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const accentBorder = type === 'whitelist' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            width="550px"
            footer={
                <>
                    <NeonButton variant="ghost" onClick={onClose}>
                        Cancel
                    </NeonButton>
                    <NeonButton onClick={handleSave} glow>
                        Save {worldIds.length} World{worldIds.length !== 1 ? 's' : ''}
                    </NeonButton>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Description */}
                <p style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    color: 'var(--color-text-dim)',
                    lineHeight: 1.5
                }}>
                    {description}
                </p>

                {/* Add World Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--color-text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <Plus size={16} style={{ color: accentColor }} />
                        Add World
                    </h3>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <input
                            type="text"
                            value={newWorldId}
                            onChange={(e) => {
                                setNewWorldId(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyPress}
                            placeholder="Enter World ID (e.g., wrld_xxx...)"
                            style={{
                                flex: 1,
                                padding: '0.75rem 1rem',
                                background: 'var(--color-surface-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--color-text-main)',
                                fontSize: '0.9rem',
                                outline: 'none',
                                transition: 'border-color 0.2s ease'
                            }}
                            onFocus={(e) => e.target.style.borderColor = accentColor}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                        />
                        <NeonButton
                            onClick={handleAddWorld}
                            disabled={loading || !newWorldId.trim()}
                            style={{ minWidth: '100px' }}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Add
                        </NeonButton>
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

                {/* World List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--color-text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        {type === 'whitelist' ? (
                            <Globe size={16} style={{ color: accentColor }} />
                        ) : (
                            <ShieldOff size={16} style={{ color: accentColor }} />
                        )}
                        {type === 'whitelist' ? 'Whitelisted' : 'Blacklisted'} Worlds ({worldIds.length})
                    </h3>

                    <div style={{
                        maxHeight: '300px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '0.5rem',
                        background: 'var(--color-surface-dark)',
                        borderRadius: '8px',
                        minHeight: '150px'
                    }}>
                        {worldIds.length === 0 ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2rem',
                                color: 'var(--color-text-dim)',
                                textAlign: 'center',
                                height: '100%',
                                minHeight: '130px'
                            }}>
                                {type === 'whitelist' ? (
                                    <Globe size={32} style={{ color: accentColor, opacity: 0.5, marginBottom: '0.75rem' }} />
                                ) : (
                                    <ShieldOff size={32} style={{ color: accentColor, opacity: 0.5, marginBottom: '0.75rem' }} />
                                )}
                                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                    No {type === 'whitelist' ? 'whitelisted' : 'blacklisted'} worlds yet
                                </p>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', opacity: 0.7 }}>
                                    Add World IDs above to get started
                                </p>
                            </div>
                        ) : (
                            worldIds.map((worldId) => {
                                const info = worldInfoMap[worldId];
                                return (
                                    <div
                                        key={worldId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem',
                                            background: accentBg,
                                            border: `1px solid ${accentBorder}`,
                                            borderRadius: '8px',
                                            transition: 'background 0.2s ease'
                                        }}
                                    >
                                        {/* World Thumbnail */}
                                        {info?.thumbnailUrl ? (
                                            <img
                                                src={info.thumbnailUrl}
                                                alt={info.name || worldId}
                                                style={{
                                                    width: '48px',
                                                    height: '36px',
                                                    borderRadius: '6px',
                                                    objectFit: 'cover',
                                                    flexShrink: 0
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '48px',
                                                height: '36px',
                                                borderRadius: '6px',
                                                background: 'var(--color-surface-overlay)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                <Globe size={16} style={{ color: 'var(--color-text-dim)' }} />
                                            </div>
                                        )}

                                        {/* World Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: 600,
                                                color: 'var(--color-text-main)',
                                                fontSize: '0.9rem',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {info?.name || 'Loading...'}
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                gap: '0.75rem',
                                                marginTop: '0.15rem'
                                            }}>
                                                <code style={{
                                                    fontSize: '0.7rem',
                                                    color: 'var(--color-text-dim)',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {worldId.substring(0, 20)}...
                                                </code>
                                                {info?.authorName && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        color: 'var(--color-text-dim)'
                                                    }}>
                                                        by {info.authorName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                            <button
                                                onClick={() => window.open(`https://vrchat.com/home/world/${worldId}`, '_blank')}
                                                style={{
                                                    padding: '0.5rem',
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    borderRadius: '6px',
                                                    color: 'var(--color-text-dim)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                title="View on VRChat"
                                            >
                                                <ExternalLink size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveWorld(worldId)}
                                                style={{
                                                    padding: '0.5rem',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    borderRadius: '6px',
                                                    color: '#f87171',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                title="Remove from list"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};
