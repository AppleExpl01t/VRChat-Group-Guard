import React, { useEffect, useState, useCallback } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { ProfileModal, useProfileModal } from '../../components/ProfileModal';
import { LogFilterBar } from '../../components/ui/LogFilterBar';
import { useUserBatchFetcher } from '../../hooks/useUserBatchFetcher';
import { TrustRankBadge, AgeVerifiedBadge } from '../../components/ui/UserBadges';
import type { PlayerLogEntry } from '../../types/electron';

type FilterType = 'all' | 'join' | 'leave';

interface WorldInfo {
    name: string;
    imageUrl?: string;
}

export const GameLogView: React.FC = () => {
    const [logs, setLogs] = useState<PlayerLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortAscending, setSortAscending] = useState(false); // Default: Newest first

    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    // Caching
    const [worldCache, setWorldCache] = useState<Map<string, WorldInfo>>(new Map());
    const { users, fetchUsers } = useUserBatchFetcher();

    const { profile, openUserProfile, openWorldProfile, openGroupProfile, closeProfile } = useProfileModal();

    const fetchLogs = useCallback(async () => {
        // Only show full loading state if we have no data
        if (logs.length === 0) {
            setLoading(true);
        }

        try {
            const data = await window.electron.friendship.getPlayerLog({
                limit: 500,
                search: search || undefined,
                type: filter
            });
            console.log('[GameLogView] Got', data.length, 'player log entries');
            setLogs(data);
            setPage(0);

            // Collect unique world IDs to fetch
            const worldIds = new Set<string>();
            data.forEach(entry => {
                if (entry.worldId && entry.worldId.startsWith('wrld_') && !worldCache.has(entry.worldId)) {
                    worldIds.add(entry.worldId);
                }
            });

            // Fetch world names for unique world IDs
            for (const worldId of worldIds) {
                try {
                    const result = await window.electron.getWorld(worldId);
                    if (result.success && result.world) {
                        setWorldCache(prev => new Map(prev).set(worldId, {
                            name: result.world!.name || 'Unknown World',
                            imageUrl: result.world!.imageUrl
                        }));
                    }
                } catch (e) {
                    console.warn('Failed to fetch world:', worldId, e);
                }
            }
        } catch (error) {
            console.error('Failed to fetch player log:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [search, filter, worldCache]); // Removed logs dependency to avoid loop, but logs.length check needs logs.
    // Actually, we can just remove setLoading(true) from here and rely on initial state = true.
    // But if filter changes, we might want to show loading?
    // Let's refine:

    /* 
       Refined logic in replacement below:
       - We don't depend on 'logs' in dependency array to avoid loops.
       - We rely on the fact that if it's a refresh, 'refreshing' is true. 
       - If filter changes, we might want to keep showing old data until new data arrives, 
         OR show loading. Standard UI is usually keep data + spinner, or skeleton.
         Let's stick to: if we are refreshing, don't set loading.
    */

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchLogs();
    };

    // Get resolved world name from cache or entry
    const getWorldName = useCallback((entry: PlayerLogEntry): string => {
        if (entry.worldId && worldCache.has(entry.worldId)) {
            return worldCache.get(entry.worldId)!.name;
        }
        return entry.worldName || 'Unknown World';
    }, [worldCache]);

    // Client-side filtering/sorting just like FeedView
    // Note: We fetch with search/filter, but for consistent date/sort behavior we can apply it here too
    // or rely entirely on client-side sorting of the fetched 500 block.
    // Given the requirement for date range which isn't in API yet, we do client filtering here.
    const filteredLogs = logs.filter(entry => {
        // Date Range
        let matchesDate = true;
        const entryDate = new Date(entry.timestamp);

        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            if (entryDate < from) matchesDate = false;
        }

        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            if (entryDate > to) matchesDate = false;
        }

        return matchesDate;
    }).sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortAscending ? dateA - dateB : dateB - dateA;
    });


    // Pagination
    const totalPages = Math.ceil(filteredLogs.length / pageSize);
    const paginatedLogs = filteredLogs.slice(page * pageSize, (page + 1) * pageSize);

    // Fetch user details for visible items
    useEffect(() => {
        const userIds = paginatedLogs
            .map(e => e.userId)
            .filter(id => id) as string[]; // Filter out undefined/empty IDs

        if (userIds.length > 0) {
            fetchUsers(userIds);
        }
    }, [paginatedLogs, fetchUsers]);

    const getTypeIcon = (type: 'join' | 'leave') => {
        return type === 'join' ? '🟢' : '🔴';
    };

    const getTypeLabel = (type: 'join' | 'leave') => {
        return type === 'join' ? 'Player joined' : 'Player left';
    };

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
            date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const clickableStyle: React.CSSProperties = {
        cursor: 'pointer',
        transition: 'color 0.15s ease',
        textDecoration: 'underline',
        textDecorationColor: 'transparent'
    };

    return (
        <GlassPanel style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <LogFilterBar
                title="Instance History"
                count={filteredLogs.length}
                countLabel="entries"
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by player name..."
                dateFrom={dateFrom}
                onDateFromChange={setDateFrom}
                dateTo={dateTo}
                onDateToChange={setDateTo}
                sortAscending={sortAscending}
                onSortChange={() => setSortAscending(!sortAscending)}
                pageSize={pageSize}
                onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(0);
                }}
                onRefresh={handleRefresh}
                refreshing={refreshing}
            >
                {/* Custom Type Filter Buttons */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {(['all', 'join', 'leave'] as FilterType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => setFilter(type)}
                            style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: 'var(--border-radius)',
                                border: filter === type ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                background: filter === type ? 'rgba(var(--color-primary-rgb), 0.2)' : 'transparent',
                                color: filter === type ? 'var(--color-primary)' : 'var(--color-text-dim)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {type === 'all' ? 'All' : type === 'join' ? '🟢 Joins' : '🔴 Leaves'}
                        </button>
                    ))}
                </div>
            </LogFilterBar>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{
                            color: 'var(--color-text-dim)',
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            position: 'sticky',
                            top: 0,
                            background: 'var(--color-surface-glass)',
                            backdropFilter: 'blur(10px)',
                            zIndex: 10
                        }}>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', width: '100px' }}>Date</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '150px' }}>Type</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '50px' }}>18+</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '100px' }}>Rank</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '180px' }}>User</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)' }}>World</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && logs.length === 0 ? (
                            // SKELETON LOADER
                            Array.from({ length: 10 }).map((_, i) => (
                                <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '0.65rem 1rem' }}>
                                        <div style={{ height: '14px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '100px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '30px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '100px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 1rem' }}>
                                        <div style={{ height: '14px', width: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                </tr>
                            ))
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '2rem' }}>🎮</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>No player encounters found.</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                                            Try adjusting your filters or date range.
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedLogs.map((entry) => {
                                const worldName = getWorldName(entry);
                                return (
                                    <tr
                                        key={entry.id}
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            transition: 'background 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{
                                            padding: '0.65rem 1rem',
                                            fontFamily: 'monospace',
                                            fontSize: '0.7rem',
                                            color: 'var(--color-text-dim)'
                                        }}>
                                            {formatDate(entry.timestamp)}
                                        </td>
                                        <td style={{
                                            padding: '0.65rem 0.5rem',
                                            fontSize: '0.75rem'
                                        }}>
                                            <span style={{ marginRight: '0.3rem' }}>{getTypeIcon(entry.type)}</span>
                                            <span style={{
                                                color: entry.type === 'join' ? '#22c55e' : '#ef4444',
                                                fontWeight: 500
                                            }}>
                                                {getTypeLabel(entry.type)}
                                            </span>
                                        </td>
                                        <td style={{
                                            padding: '0.65rem 0.5rem',
                                            textAlign: 'center'
                                        }}>
                                            {entry.userId && (
                                                <AgeVerifiedBadge isVerified={users.get(entry.userId)?.ageVerified} />
                                            )}
                                        </td>
                                        <td style={{
                                            padding: '0.65rem 0.5rem'
                                        }}>
                                            {entry.userId && (
                                                <TrustRankBadge
                                                    tags={users.get(entry.userId)?.tags}
                                                    fallbackRank={users.get(entry.userId)?.tags ? undefined : 'Visitor'}
                                                />
                                            )}
                                        </td>
                                        <td style={{
                                            padding: '0.65rem 0.5rem',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            maxWidth: '180px'
                                        }}>
                                            <span
                                                style={{
                                                    ...clickableStyle,
                                                    color: 'var(--color-primary)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: 'inline-block',
                                                    maxWidth: '100%'
                                                }}
                                                onClick={() => entry.userId && openUserProfile(entry.userId, entry.displayName)}
                                                onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = 'var(--color-primary)'}
                                                onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = 'transparent'}
                                            >
                                                {entry.displayName}
                                            </span>
                                        </td>
                                        <td style={{
                                            padding: '0.65rem 1rem',
                                            fontSize: '0.75rem',
                                            maxWidth: '200px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }} title={worldName}>
                                            <span
                                                style={{
                                                    ...clickableStyle,
                                                    color: 'var(--color-text-dim)'
                                                }}
                                                onClick={() => entry.worldId && openWorldProfile(entry.worldId, worldName)}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.color = 'var(--color-primary)';
                                                    e.currentTarget.style.textDecorationColor = 'var(--color-primary)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.color = 'var(--color-text-dim)';
                                                    e.currentTarget.style.textDecorationColor = 'transparent';
                                                }}
                                            >
                                                {worldName}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    padding: '0.75rem 1rem',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <NeonButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                    >
                        ← Prev
                    </NeonButton>
                    <span style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-dim)',
                        padding: '0 0.5rem'
                    }}>
                        Page {page + 1} of {totalPages}
                    </span>
                    <NeonButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                    >
                        Next →
                    </NeonButton>
                </div>
            )}

            {/* Profile Modal */}
            <ProfileModal
                profile={profile}
                onClose={closeProfile}
                openUserProfile={openUserProfile}
                openWorldProfile={openWorldProfile}
                openGroupProfile={openGroupProfile}
            />
        </GlassPanel>
    );
};
