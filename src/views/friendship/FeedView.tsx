import React, { useEffect, useState, useCallback } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { ProfileModal, useProfileModal } from '../../components/ProfileModal';
import { LogFilterBar } from '../../components/ui/LogFilterBar';
import { useUserBatchFetcher } from '../../hooks/useUserBatchFetcher';
import { TrustRankBadge, AgeVerifiedBadge } from '../../components/ui/UserBadges';
import type { SocialFeedEntry } from '../../types/electron';

type FilterType = 'all' | 'online' | 'offline' | 'location' | 'status' | 'avatar' | 'bio';

export const FeedView: React.FC = () => {
    const [feed, setFeed] = useState<SocialFeedEntry[]>([]);
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
    const { users, fetchUsers } = useUserBatchFetcher();

    const { profile, openUserProfile, openWorldProfile, openGroupProfile, closeProfile } = useProfileModal();

    const fetchFeed = useCallback(async () => {
        try {
            const data = await window.electron.friendship.getSocialFeed(500);
            console.log('[FeedView] Got', data.length, 'feed entries');
            setFeed(data);
            setPage(0);
        } catch (error) {
            console.error('Failed to fetch feed:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();

        if (window.electron?.friendship?.onUpdate) {
            const unsubscribe = window.electron.friendship.onUpdate(() => {
                fetchFeed();
            });
            return () => unsubscribe();
        }
    }, [fetchFeed]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchFeed();
    };

    // Filter, Search, and Sort Logic
    const filteredFeed = feed.filter(entry => {
        const matchesFilter = filter === 'all' || entry.type === filter;
        const matchesSearch = !search ||
            entry.displayName.toLowerCase().includes(search.toLowerCase()) ||
            (entry.details && entry.details.toLowerCase().includes(search.toLowerCase()));

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

        return matchesFilter && matchesSearch && matchesDate;
    }).sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortAscending ? dateA - dateB : dateB - dateA;
    });

    // Pagination
    const totalPages = Math.ceil(filteredFeed.length / pageSize);
    const paginatedFeed = filteredFeed.slice(page * pageSize, (page + 1) * pageSize);

    // Fetch user details for visible items
    useEffect(() => {
        const userIds = paginatedFeed
            .map(e => e.userId)
            .filter(id => id); // Filter out undefined/empty IDs

        if (userIds.length > 0) {
            fetchUsers(userIds);
        }
    }, [paginatedFeed, fetchUsers]);

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'online': return 'Online';
            case 'offline': return 'Offline';
            case 'location': return 'GPS';
            case 'status': return 'Status';
            case 'avatar': return 'Avatar';
            case 'bio': return 'Bio';
            default: return type;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'online': return '#22c55e';
            case 'offline': return '#6b7280';
            case 'location': return '#3b82f6';
            case 'status': return '#f59e0b';
            case 'avatar': return '#a855f7';
            case 'bio': return '#06b6d4';
            default: return 'var(--color-text-dim)';
        }
    };

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
            date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const formatDetails = (entry: SocialFeedEntry) => {
        if (!entry.details) {
            if (entry.type === 'online') return 'Came online';
            if (entry.type === 'offline') return 'Went offline';
            return '';
        }
        return entry.details;
    };

    // Parse location from details to get worldId if available
    const parseWorldFromDetails = (details: string | undefined): { worldId?: string; worldName?: string } => {
        if (!details) return {};
        // Try to extract wrld_ ID from location string
        const match = details.match(/wrld_[a-f0-9-]+/);
        if (match) {
            return { worldId: match[0], worldName: details.split('#')[0] || details };
        }
        return { worldName: details };
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
                title="Activity Feed"
                count={filteredFeed.length}
                countLabel="events"
                search={search}
                onSearchChange={setSearch}
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
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {([
                        { value: 'all', label: 'All' },
                        { value: 'online', label: '🟢 Online' },
                        { value: 'offline', label: '⚫ Offline' },
                        { value: 'status', label: '💬 Status' },
                        { value: 'avatar', label: '👤 Avatar' },
                        { value: 'location', label: '📍 GPS' }
                    ] as { value: FilterType; label: string }[]).map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: 'var(--border-radius)',
                                border: filter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                background: filter === f.value ? 'rgba(var(--color-primary-rgb), 0.2)' : 'transparent',
                                color: filter === f.value ? 'var(--color-primary)' : 'var(--color-text-dim)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {f.label}
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
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '80px' }}>Type</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '50px' }}>18+</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '100px' }}>Rank</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '180px' }}>User</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)' }}>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && feed.length === 0 ? (
                            // Skeleton Loader
                            Array.from({ length: 10 }).map((_, i) => (
                                <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '0.65rem 1rem' }}>
                                        <div style={{ height: '14px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
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
                        ) : filteredFeed.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '2rem' }}>📋</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>No activity found.</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                                            Try adjusting your filters or date range.
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedFeed.map((entry) => {
                                const details = formatDetails(entry);
                                const worldInfo = entry.type === 'location' ? parseWorldFromDetails(entry.details) : {};

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
                                            <span style={{
                                                color: getTypeColor(entry.type),
                                                fontWeight: 600
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
                                            color: 'var(--color-text-dim)',
                                            maxWidth: '300px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }} title={details}>
                                            {entry.type === 'location' && worldInfo.worldId ? (
                                                <span
                                                    style={{
                                                        ...clickableStyle,
                                                        color: 'var(--color-text-dim)'
                                                    }}
                                                    onClick={() => openWorldProfile(worldInfo.worldId!, worldInfo.worldName)}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.color = 'var(--color-primary)';
                                                        e.currentTarget.style.textDecorationColor = 'var(--color-primary)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.color = 'var(--color-text-dim)';
                                                        e.currentTarget.style.textDecorationColor = 'transparent';
                                                    }}
                                                >
                                                    {details}
                                                </span>
                                            ) : (
                                                details
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls match standard */}
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

