import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { ProfileModal, useProfileModal } from '../../components/ProfileModal';
import { LogFilterBar } from '../../components/ui/LogFilterBar';
import { useUserBatchFetcher } from '../../hooks/useUserBatchFetcher';
import { TrustRankBadge, AgeVerifiedBadge, VRCPlusBadge } from '../../components/ui/UserBadges';
import type { FriendListItem } from '../../types/electron';

type FilterType = 'all' | 'online' | 'offline' | 'favorite';

export const FriendsListView: React.FC = () => {
    const [friends, setFriends] = useState<FriendListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters & Sorting
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [sortBy, setSortBy] = useState<'friendScore' | 'displayName' | 'lastSeen' | 'dateKnown'>('friendScore');
    const [sortAscending, setSortAscending] = useState(false);

    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(15);

    // Date Filters (satisfied for LogFilterBar interface)
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const { users, fetchUsers } = useUserBatchFetcher();
    const { profile, openUserProfile, openWorldProfile, openGroupProfile, closeProfile } = useProfileModal();

    // Mutuals data fetched on-demand per page
    const [mutuals, setMutuals] = useState<Record<string, { friends: number; groups: number }>>({});

    const fetchFriends = useCallback(async () => {
        if (friends.length === 0) setLoading(true);
        try {
            const data = await window.electron.friendship.getFriendsList();
            console.log('[FriendsListView] Got', data.length, 'friends');
            setFriends(data);
        } catch (error) {
            console.error('Failed to fetch friends list:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [friends.length]);

    useEffect(() => {
        fetchFriends();

        // Add real-time update listener
        if (window.electron?.friendship?.onUpdate) {
            const unsubscribe = window.electron.friendship.onUpdate(() => {
                fetchFriends();
            });
            return () => unsubscribe();
        }
    }, [fetchFriends]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await window.electron.friendship.refreshFriends();
        await fetchFriends();
    };

    // Filter, Search, and Sort Logic
    const filteredFriends = useMemo(() => {
        return friends.filter(f => {
            const matchesSearch = !search || f.displayName.toLowerCase().includes(search.toLowerCase());
            const isOnline = f.status?.toLowerCase() !== 'offline';

            if (filter === 'online') return matchesSearch && isOnline;
            if (filter === 'offline') return matchesSearch && !isOnline;

            return matchesSearch;
        }).sort((a, b) => {
            let valA: any = a[sortBy];
            let valB: any = b[sortBy];

            if (sortBy === 'displayName') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            } else if (sortBy === 'lastSeen' || sortBy === 'dateKnown') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            }

            if (valA < valB) return sortAscending ? -1 : 1;
            if (valA > valB) return sortAscending ? 1 : -1;
            return 0;
        });
    }, [friends, search, filter, sortBy, sortAscending]);

    // Pagination
    const totalPages = Math.ceil(filteredFriends.length / pageSize);
    const paginatedFriends = filteredFriends.slice(page * pageSize, (page + 1) * pageSize);

    // Fetch user details for visible items
    useEffect(() => {
        const userIds = paginatedFriends.map(f => f.userId);
        if (userIds.length > 0) fetchUsers(userIds);
    }, [paginatedFriends, fetchUsers]);

    // Fetch mutuals for visible items (on-demand)
    useEffect(() => {
        const fetchMutuals = async () => {
            const userIds = paginatedFriends.map(f => f.userId).filter(id => !mutuals[id]);
            if (userIds.length === 0) return;
            try {
                const batch = await window.electron.friendship.getMutualsBatch(userIds);
                setMutuals(prev => ({ ...prev, ...batch }));
            } catch (err) {
                console.warn('Failed to fetch mutuals batch:', err);
            }
        };
        fetchMutuals();
    }, [paginatedFriends]);

    // Helper to get platform icon
    const getPlatformIcon = (platform: string | undefined) => {
        if (!platform) return '❓';
        const p = platform.toLowerCase();
        if (p.includes('android') || p.includes('quest')) return '📱';
        if (p.includes('standalonewindows')) return '🖥️';
        return '🥽';
    };

    const formatDuration = (ms: number) => {
        if (!ms) return '0m';
        const minutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return `${minutes}m`;
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    };

    const getStatusColor = (status: string) => {
        const s = status?.toLowerCase() || '';
        switch (s) {
            case 'active':
            case 'join me': return '#22c55e';
            case 'busy': return '#ef4444';
            case 'ask me': return '#f59e0b';
            case 'offline': return '#6b7280';
            default: return '#6b7280';
        }
    };


    return (
        <GlassPanel style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <LogFilterBar
                title="Full Friends List"
                count={filteredFriends.length}
                countLabel="friends"
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search friends..."
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

                {/* Status Filters */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {([
                        { value: 'all', label: 'All' },
                        { value: 'online', label: '🟢 Online' },
                        { value: 'offline', label: '⚫ Offline' }
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

                    <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem' }} />

                    {/* Retro Scan Button */}
                    <NeonButton
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            if (confirm('Scan all old VRChat logs for missed time headers? This might take a moment.')) {
                                setLoading(true);
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const result = await (window.electron as any).logScanner.scan();
                                    alert(`Scanned ${result.processedFiles} files. Added ${result.totalMinutesAdded} minutes of history!`);
                                    handleRefresh();
                                } catch (e) {
                                    alert('Scan failed check console.');
                                    console.error(e);
                                } finally {
                                    setLoading(false);
                                }
                            }
                        }}
                    >
                        📚 Scan Old Logs
                    </NeonButton>
                </div>
            </LogFilterBar>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            position: 'sticky',
                            top: 0,
                            background: 'var(--glass-bg, #1a1a1a)',
                            zIndex: 10
                        }}>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', minWidth: '220px' }}>User</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', minWidth: '80px' }}>Rank</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', minWidth: '80px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSortBy('friendScore'); setSortAscending(!sortAscending); }}>Score{sortBy === 'friendScore' && (sortAscending ? '↑' : '↓')}</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', minWidth: '60px' }} title="Mutual Friends">Friends</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', minWidth: '60px' }} title="Mutual Groups">Groups</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', minWidth: '55px' }} title="Platform">Plat</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', minWidth: '50px' }} title="VRC+ Subscriber">VRC+</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.5rem', borderBottom: '1px solid var(--border-color)', minWidth: '45px' }} title="Age Verified (18+)">18+</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', minWidth: '60px' }}>Joins</th>
                            <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', minWidth: '80px' }}>Time</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', minWidth: '90px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSortBy('dateKnown'); setSortAscending(!sortAscending); }}>Since{sortBy === 'dateKnown' && (sortAscending ? '↑' : '↓')}</th>
                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSortBy('lastSeen'); setSortAscending(!sortAscending); }}>Last Seen{sortBy === 'lastSeen' && (sortAscending ? '↑' : '↓')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && friends.length === 0 ? (
                            Array.from({ length: 15 }).map((_, i) => (
                                <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td colSpan={11} style={{ padding: '0.65rem 1rem' }}>
                                        <div style={{ height: '24px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    </td>
                                </tr>
                            ))
                        ) : paginatedFriends.map(friend => {
                            const userImage = friend.profilePicOverride || friend.userIcon || friend.currentAvatarThumbnailImageUrl;
                            return (
                                <tr
                                    key={friend.userId}
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* User Column */}
                                    <td style={{ padding: '0.65rem 1rem' }}>
                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                                            onClick={() => openUserProfile(friend.userId, friend.displayName)}
                                        >
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                border: `2px solid ${getStatusColor(friend.status)}`,
                                                overflow: 'hidden',
                                                background: '#000',
                                                flexShrink: 0
                                            }}>
                                                {userImage ? (
                                                    <img src={userImage} alt={friend.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-main)' }}>{friend.displayName}</span>
                                                <span style={{ fontSize: '0.65rem', color: getStatusColor(friend.status) }}>{friend.status}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Rank */}
                                    <td style={{ padding: '0.65rem 0.5rem' }}>
                                        <TrustRankBadge
                                            tags={users.get(friend.userId)?.tags}
                                            fallbackRank={users.get(friend.userId)?.tags ? undefined : 'Visitor'}
                                        />
                                    </td>

                                    {/* Friend Score */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                        <span style={{
                                            fontWeight: 800,
                                            color: 'var(--color-primary)',
                                            fontSize: '0.85rem',
                                            textShadow: '0 0 10px rgba(var(--color-primary-rgb), 0.3)'
                                        }}>
                                            {friend.friendScore.toLocaleString()}
                                        </span>
                                    </td>

                                    {/* Mutual Friends */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                        {mutuals[friend.userId] ? (
                                            <span title={`${mutuals[friend.userId].friends} mutual friends`}>
                                                {mutuals[friend.userId].friends}
                                            </span>
                                        ) : (
                                            <span style={{ opacity: 0.4 }}>—</span>
                                        )}
                                    </td>

                                    {/* Mutual Groups */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                        {mutuals[friend.userId] ? (
                                            <span title={`${mutuals[friend.userId].groups} mutual groups`}>
                                                {mutuals[friend.userId].groups}
                                            </span>
                                        ) : (
                                            <span style={{ opacity: 0.4 }}>—</span>
                                        )}
                                    </td>

                                    {/* Platform */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontSize: '0.9rem' }} title={users.get(friend.userId)?.last_platform || 'Unknown'}>
                                        {getPlatformIcon(users.get(friend.userId)?.last_platform)}
                                    </td>

                                    {/* VRC+ */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                        <VRCPlusBadge isVRCPlus={users.get(friend.userId)?.tags?.includes('system_supporter')} />
                                    </td>

                                    {/* 18+ Age Verified */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                        <AgeVerifiedBadge isVerified={users.get(friend.userId)?.ageVerificationStatus === '18+'} />
                                    </td>

                                    {/* Joins */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                        {friend.encounterCount}
                                    </td>

                                    {/* Time */}
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                            {formatDuration(friend.timeSpent)}
                                            {/* Active Pulse Indicator */}
                                            {friend.status?.toLowerCase() !== 'offline' && (
                                                <div
                                                    title="Tracking active time..."
                                                    style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: '#22c55e',
                                                        boxShadow: '0 0 5px #22c55e',
                                                        animation: 'pulse 2s infinite'
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </td>

                                    {/* Known Since */}
                                    <td style={{ padding: '0.65rem 0.5rem', color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                        {formatDate(friend.dateKnown)}
                                    </td>

                                    {/* Last Seen */}
                                    <td style={{ padding: '0.65rem 1rem', color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                        {friend.status.toLowerCase() !== 'offline' ? (
                                            <span style={{ color: '#22c55e', fontWeight: 600 }}>Currently Online</span>
                                        ) : (
                                            formatDate(friend.lastSeen)
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
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
                    <NeonButton variant="ghost" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</NeonButton>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Page {page + 1} of {totalPages}</span>
                    <NeonButton variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next →</NeonButton>
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
