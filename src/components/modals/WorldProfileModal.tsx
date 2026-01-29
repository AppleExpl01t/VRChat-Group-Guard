import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Globe, History, Loader2, Info, Hash } from 'lucide-react';
import styles from '../../features/dashboard/dialogs/UserProfileDialog.module.css';

interface WorldProfileModalProps {
    worldId: string;
    onClose: () => void;
}

interface WorldStats {
    visitCount: number;
    timeSpent: number;
    lastVisited: string;
}

export const WorldProfileModal: React.FC<WorldProfileModalProps> = ({ worldId, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [world, setWorld] = useState<any>(null);
    const [stats, setStats] = useState<WorldStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            if (!worldId) return;
            setLoading(true);
            setError(null);
            try {
                // Fetch VRChat World Info
                const worldResult = await window.electron.getWorld(worldId);
                if (worldResult.success && worldResult.world) {
                    setWorld(worldResult.world);
                } else {
                    setError(worldResult.error || 'Failed to load world');
                }

                // Fetch Local Stats
                const statsResult = await window.electron.friendship.getWorldStats(worldId);
                if (statsResult.success && statsResult.stats) {
                    setStats(statsResult.stats);
                }
            } catch (e) {
                console.error('Failed to load world data:', e);
                setError('Failed to load world info');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [worldId]);

    const formatDuration = (ms: number) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (!worldId) return null;

    return (
        <Modal
            isOpen={!!worldId}
            onClose={onClose}
            title={world?.name || 'World Info'}
            width="900px"
        >
            {loading ? (
                <div className={styles.loadingState}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span>Loading world details...</span>
                </div>
            ) : error ? (
                <div className={styles.errorState}>
                    {error}
                </div>
            ) : world ? (
                <div className={styles.dialogContent}>
                    {/* Hero Banner */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '220px',
                        borderRadius: 'var(--border-radius)',
                        overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                        marginBottom: '0.5rem'
                    }}>
                        <img
                            src={world.imageUrl || world.thumbnailImageUrl}
                            alt={world.name}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            padding: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                                        {world.name}
                                    </h2>
                                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                                        by <span style={{ color: 'var(--color-primary)' }}>{world.authorName}</span>
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                        padding: '0.35rem 0.75rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        backdropFilter: 'blur(10px)',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: '#fff',
                                        border: '1px solid rgba(255,255,255,0.2)'
                                    }}>
                                        Capacity: {world.capacity}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.profileGrid}>
                        {/* Identity Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Info size={16} />
                                World Information
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>Author</label>
                                        <span>{world.authorName}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Release Status</label>
                                        <span style={{ textTransform: 'capitalize' }}>{world.releaseStatus}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Labs Date</label>
                                        <span>{formatDate(world.labsPublicationDate)}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Last Updated</label>
                                        <span>{formatDate(world.updated_at)}</span>
                                    </div>
                                </div>

                                {world.description && (
                                    <div className={styles.bioSection}>
                                        <label>Description</label>
                                        <p className={styles.bio} style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                            {world.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Local Stats Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <History size={16} />
                                Personal History
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>Total Visits</label>
                                        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                            {stats?.visitCount || 0}
                                        </span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Time Spent</label>
                                        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                            {stats ? formatDuration(stats.timeSpent) : '0h 0m'}
                                        </span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Last Visited</label>
                                        <span>{stats ? formatDate(stats.lastVisited) : 'Never'}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>First Encountered</label>
                                        <span>{world.created_at ? formatDate(world.created_at) : 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Public Stats Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Globe size={16} />
                                Global Statistics
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.fieldGrid}>
                                    <div className={styles.field}>
                                        <label>Public Visits</label>
                                        <span>{world.visits?.toLocaleString() || 'N/A'}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Favorites</label>
                                        <span>{world.favorites?.toLocaleString() || 'N/A'}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Heat</label>
                                        <span>{world.heat?.toLocaleString() || 'N/A'}</span>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Occupants</label>
                                        <span>{world.occupants?.toLocaleString() || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tags Card */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Hash size={16} />
                                World Tags ({world.tags?.length || 0})
                            </div>
                            <div className={styles.cardContent}>
                                <div className={styles.tagsContainer}>
                                    {world.tags?.slice(0, 15).map((tag: string) => (
                                        <span key={tag} className={styles.tag}>{tag}</span>
                                    ))}
                                    {(world.tags?.length || 0) > 15 && (
                                        <span className={styles.tagMore}>+{world.tags!.length - 15} more</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
};

