import React, { useEffect, useState, useCallback } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { ProfileModal, useProfileModal } from '../../components/ProfileModal';
import { LogFilterBar } from '../../components/ui/LogFilterBar';
import { useUserBatchFetcher } from '../../hooks/useUserBatchFetcher';
import { TrustRankBadge, AgeVerifiedBadge } from '../../components/ui/UserBadges';
import type { RelationshipEvent } from '../../types/electron';

type FilterType = 'all' | 'add' | 'remove' | 'name_change';

export const SocialView: React.FC = () => {
    const [events, setEvents] = useState<RelationshipEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [filter, setFilter] = useState<FilterType>('all');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortAscending, setSortAscending] = useState(false); // Default: Newest first

    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const { users, fetchUsers } = useUserBatchFetcher();

    const { profile, openUserProfile, openWorldProfile, openGroupProfile, closeProfile } = useProfileModal();

    const fetchEvents = useCallback(async () => {
        if (events.length === 0) setLoading(true);
        try {
            const data = await window.electron.friendship.getRelationshipEvents(500);
            console.log('[SocialView] Got', data.length, 'relationship events');
            setEvents(data);
            setPage(0);
        } catch (error) {
            console.error('Failed to fetch relationship events:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []); // Check dependency if needed

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await window.electron.friendship.refreshRelationships();
        await fetchEvents();
    };

    // Filter, Search, and Sort Logic
    const filteredEvents = events.filter(e => {
        const matchesFilter = filter === 'all' || e.type === filter;
        const matchesSearch = !search ||
            e.displayName.toLowerCase().includes(search.toLowerCase()) ||
            (e.previousName && e.previousName.toLowerCase().includes(search.toLowerCase()));

        // Date Range
        let matchesDate = true;
        const entryDate = new Date(e.timestamp);

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
    const totalPages = Math.ceil(filteredEvents.length / pageSize);
    const paginatedEvents = filteredEvents.slice(page * pageSize, (page + 1) * pageSize);

    // Fetch user details for visible items
    useEffect(() => {
        const userIds = paginatedEvents
            .map(e => e.userId)
            .filter(id => id); // Filter out undefined/empty IDs

        if (userIds.length > 0) {
            fetchUsers(userIds);
        }
    }, [paginatedEvents, fetchUsers]);

    const getTypeIcon = (type: 'add' | 'remove' | 'name_change') => {
        switch (type) {
            case 'add': return '🟢';
            case 'remove': return '🔴';
            case 'name_change': return '🟣';
        }
    };

    const getTypeLabel = (type: 'add' | 'remove' | 'name_change') => {
        switch (type) {
            case 'add': return 'Friend added';
            case 'remove': return 'Unfriended';
            case 'name_change': return 'Name changed';
        }
    };

    const getTypeColor = (type: 'add' | 'remove' | 'name_change') => {
        switch (type) {
            case 'add': return '#22c55e';
            case 'remove': return '#ef4444';
            case 'name_change': return '#a855f7';
        }
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
                title="Social Activity"
                count={filteredEvents.length}
                countLabel="events"
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name..."
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
                {/* Type Filters */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {([
                        { value: 'all', label: 'All' },
                        { value: 'add', label: '🟢 Added' },
                        { value: 'remove', label: '🔴 Removed' },
                        { value: 'name_change', label: '🟣 Names' }
                    ] as { value: FilterType; label: string }[]).map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: 'var(--border-radius)',
                                border: filter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                background: filter === f.value ? 'rgba(var(--color-primary-rgb), 0.2)' : 'transparent',
                                color: filter === f.value ? 'var(--color-primary)' : 'var(--color-text-dim)',
                                fontSize: '0.75rem',
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
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '120px' }}>Type</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '50px' }}>18+</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '100px' }}>Rank</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', width: '180px' }}>User</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)' }}>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && events.length === 0 ? (
                            // Skeleton Loader
                            Array.from({ length: 10 }).map((_, i) => (
                                <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '0.65rem 1rem' }}>
                                        <div style={{ height: '14px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <div style={{ height: '14px', width: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
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
                                        <div style={{ height: '14px', width: '140px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                </tr>
                            ))
                        ) : filteredEvents.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '2rem' }}>👥</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>No social activity found.</span>
                                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                                            Try adjusting your filters or date range.
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedEvents.map((event) => (
                                <tr
                                    key={event.id}
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
                                        {formatDate(event.timestamp)}
                                    </td>
                                    <td style={{
                                        padding: '0.65rem 0.5rem',
                                        fontSize: '0.75rem'
                                    }}>
                                        <span style={{ marginRight: '0.3rem' }}>{getTypeIcon(event.type)}</span>
                                        <span style={{
                                            color: getTypeColor(event.type),
                                            fontWeight: 500
                                        }}>
                                            {getTypeLabel(event.type)}
                                        </span>
                                    </td>
                                    <td style={{
                                        padding: '0.65rem 0.5rem',
                                        textAlign: 'center'
                                    }}>
                                        {event.userId && (
                                            <AgeVerifiedBadge isVerified={users.get(event.userId)?.ageVerified} />
                                        )}
                                    </td>
                                    <td style={{
                                        padding: '0.65rem 0.5rem'
                                    }}>
                                        {event.userId && (
                                            <TrustRankBadge
                                                tags={users.get(event.userId)?.tags}
                                                fallbackRank={users.get(event.userId)?.tags ? undefined : 'Visitor'}
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
                                            onClick={() => event.userId && openUserProfile(event.userId, event.displayName)}
                                            onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = 'var(--color-primary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = 'transparent'}
                                        >
                                            {event.displayName}
                                        </span>
                                    </td>
                                    <td style={{
                                        padding: '0.65rem 1rem',
                                        fontSize: '0.75rem',
                                        color: 'var(--color-text-dim)',
                                        maxWidth: '200px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {event.type === 'name_change' && event.previousName ? (
                                            <span>
                                                Was: <span style={{ textDecoration: 'line-through' }}>{event.previousName}</span>
                                            </span>
                                        ) : event.type === 'add' ? (
                                            <span style={{ color: '#22c55e' }}>Now friends</span>
                                        ) : (
                                            <span style={{ color: '#ef4444' }}>No longer friends</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
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
