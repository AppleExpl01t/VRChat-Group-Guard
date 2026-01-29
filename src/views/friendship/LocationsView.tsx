import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { ProfileModal, useProfileModal } from '../../components/ProfileModal';
import type { FriendLocation } from '../../types/electron';

interface WorldInfo {
    id: string;
    name: string;
    thumbnailUrl?: string;
}

interface GroupInfo {
    id: string;
    name: string;
}

interface InstanceGroup {
    location: string;
    worldId: string;
    worldName: string;
    worldThumbnail?: string;
    groupId?: string;
    groupName?: string;
    friends: FriendLocation[];
    isPrivate: boolean;
    instanceType: string;
}

// Parse location string to extract info
// Format: wrld_xxx:instanceId~type(value)~...
const parseLocation = (location: string): { worldId: string; instanceId?: string; groupId?: string; region?: string; accessType?: string } => {
    const parts = location.split(':');
    const worldId = parts[0];

    if (parts.length < 2) {
        return { worldId };
    }

    const instancePart = parts[1];
    const instanceId = instancePart.split('~')[0];

    // Parse modifiers
    const groupMatch = instancePart.match(/group\((grp_[^)]+)\)/);
    const regionMatch = instancePart.match(/region\(([^)]+)\)/);
    const accessMatch = instancePart.match(/groupAccessType\(([^)]+)\)/);

    return {
        worldId,
        instanceId,
        groupId: groupMatch?.[1],
        region: regionMatch?.[1],
        accessType: accessMatch?.[1]
    };
};

export const LocationsView: React.FC = () => {
    const [friends, setFriends] = useState<FriendLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const { profile, openUserProfile, openWorldProfile, openGroupProfile, closeProfile } = useProfileModal();

    const handleJoinInstance = (location: string) => {
        // Use VRChat launch protocol
        window.open(`vrchat://launch?ref=groupguard&id=${encodeURIComponent(location)}`, '_blank');
    };
    const [worldCache, setWorldCache] = useState<Map<string, WorldInfo>>(new Map());
    const [groupCache, setGroupCache] = useState<Map<string, GroupInfo>>(new Map());

    const fetchFriends = useCallback(async (forceApiRefresh = false) => {
        if (forceApiRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            if (forceApiRefresh) {
                const result = await window.electron.friendship.refreshFriends();
                console.log('[LocationsView] API refresh result:', result);
            }

            const data = await window.electron.friendship.getFriendLocations();
            console.log('[LocationsView] Got', data.length, 'friends');
            setFriends(data);
            setLastRefresh(new Date());

            // Collect unique world IDs and group IDs to fetch
            const worldIds = new Set<string>();
            const groupIds = new Set<string>();

            data.forEach(f => {
                if (f.location && !f.location.startsWith('private') && f.location !== 'offline') {
                    const parsed = parseLocation(f.location);

                    if (parsed.worldId.startsWith('wrld_') && !worldCache.has(parsed.worldId)) {
                        worldIds.add(parsed.worldId);
                    }
                    if (parsed.groupId && !groupCache.has(parsed.groupId)) {
                        groupIds.add(parsed.groupId);
                    }
                }
            });

            // Fetch world details
            for (const worldId of worldIds) {
                try {
                    const worldResult = await window.electron.getWorld(worldId);
                    if (worldResult.success && worldResult.world) {
                        const world = worldResult.world;
                        setWorldCache(prev => new Map(prev).set(worldId, {
                            id: worldId,
                            name: world.name || 'Unknown World',
                            thumbnailUrl: world.imageUrl
                        }));
                    }
                } catch (e) {
                    console.warn('Failed to fetch world info:', worldId, e);
                }
            }

            // Fetch group details
            for (const groupId of groupIds) {
                try {
                    const groupResult = await window.electron.getGroupPublicDetails(groupId);
                    if (groupResult.success && groupResult.group) {
                        const group = groupResult.group;
                        setGroupCache(prev => new Map(prev).set(groupId, {
                            id: groupId,
                            name: group.name || 'Unknown Group'
                        }));
                    }
                } catch (e) {
                    console.warn('Failed to fetch group info:', groupId, e);
                }
            }
        } catch (error) {
            console.error('Failed to fetch locations:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [worldCache, groupCache]);

    useEffect(() => {
        // Initial fetch - force API refresh to purge offline players on load
        fetchFriends(true);

        // Listen for updates (passive updates from WebSocket)
        if (window.electron?.friendship?.onUpdate) {
            const unsubscribe = window.electron.friendship.onUpdate(() => {
                fetchFriends();
            });
            return () => unsubscribe();
        }

        // Auto-refresh every 15 seconds (active API refresh)
        const interval = setInterval(() => fetchFriends(true), 15000);
        return () => clearInterval(interval);
    }, [fetchFriends]);

    // Group friends by instance location
    const instanceGroups = useMemo(() => {
        const onlineFriends = friends.filter(f => f.status?.toLowerCase() !== 'offline');
        const groups = new Map<string, InstanceGroup>();

        for (const friend of onlineFriends) {
            const location = friend.location || 'private';

            // Check if private: empty, "private", "private:xxx", "offline", or doesn't start with "wrld_"
            const isPrivate = !location ||
                location === 'private' ||
                location.startsWith('private') ||
                location === 'offline' ||
                !location.startsWith('wrld_');

            // Parse location to get world/group info
            const parsed = parseLocation(location);

            // Use location as key (includes instance ID), but group all private into one
            const groupKey = isPrivate ? 'private' : location;

            if (!groups.has(groupKey)) {
                const worldInfo = isPrivate ? undefined : worldCache.get(parsed.worldId);
                const groupInfo = parsed.groupId ? groupCache.get(parsed.groupId) : undefined;

                // Determine instance type
                let instanceType = 'Public';
                if (isPrivate) instanceType = 'Private';
                else if (parsed.groupId) instanceType = parsed.accessType === 'public' ? 'Group Public' : 'Group';

                groups.set(groupKey, {
                    location,
                    worldId: parsed.worldId,
                    worldName: isPrivate ? 'Private World' : (worldInfo?.name || friend.worldName || 'Loading...'),
                    worldThumbnail: worldInfo?.thumbnailUrl,
                    groupId: parsed.groupId,
                    groupName: groupInfo?.name,
                    friends: [],
                    isPrivate,
                    instanceType
                });
            }

            groups.get(groupKey)!.friends.push(friend);
        }

        // Sort: More friends first, private last
        return Array.from(groups.values())
            .sort((a, b) => {
                if (a.isPrivate && !b.isPrivate) return 1;
                if (!a.isPrivate && b.isPrivate) return -1;
                if (b.friends.length !== a.friends.length) {
                    return b.friends.length - a.friends.length;
                }
                return a.worldName.localeCompare(b.worldName);
            });
    }, [friends, worldCache, groupCache]);

    const totalOnline = friends.filter(f => f.status?.toLowerCase() !== 'offline').length;

    const getStatusColor = (status: string) => {
        const s = status?.toLowerCase() || '';
        switch (s) {
            case 'active':
            case 'join me':
                return '#22c55e';
            case 'busy':
                return '#ef4444';
            case 'ask me':
                return '#f59e0b';
            default:
                return '#6b7280';
        }
    };

    const clickableStyle: React.CSSProperties = {
        cursor: 'pointer',
        transition: 'color 0.15s ease'
    };

    return (
        <GlassPanel style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--border-color)'
            }}>
                <div>
                    <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--color-text-main)',
                        margin: 0
                    }}>
                        Friend Locations ({totalOnline} online in {instanceGroups.length} {instanceGroups.length === 1 ? 'instance' : 'instances'})
                    </h3>
                    {lastRefresh && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                            Last updated: {lastRefresh.toLocaleTimeString()}
                        </span>
                    )}
                </div>
                <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchFriends(true)}
                    disabled={refreshing}
                >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </NeonButton>
            </div>

            {/* Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                {loading && friends.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <p style={{ color: 'var(--color-text-dim)' }}>Loading friends...</p>
                    </div>
                ) : instanceGroups.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <p style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>No friends online right now.</p>
                        <NeonButton
                            variant="primary"
                            size="sm"
                            onClick={() => fetchFriends(true)}
                            style={{ marginTop: '1rem' }}
                            disabled={refreshing}
                        >
                            Check for Friends
                        </NeonButton>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                        {/* Grouped Instances & Solo Friends (Unified) */}
                        {instanceGroups.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <h4 style={{
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    color: 'var(--color-text-dim)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    margin: 0,
                                    paddingBottom: '0.5rem'
                                }}>
                                    Active Locations
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {instanceGroups.map((group) => (
                                        <div
                                            key={group.location}
                                            style={{
                                                position: 'relative',
                                                borderRadius: 'var(--border-radius)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                background: 'rgba(255,255,255,0.02)',
                                                padding: '1rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '1rem',
                                                width: 'fit-content', // Shrink wrap width
                                                maxWidth: '100%' // Prevent overflow
                                            }}
                                        >
                                            {/* Instance Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    {group.worldThumbnail && (
                                                        <img
                                                            src={group.worldThumbnail}
                                                            alt=""
                                                            style={{
                                                                width: '40px',
                                                                height: '30px',
                                                                borderRadius: '4px',
                                                                objectFit: 'cover',
                                                                border: '1px solid rgba(255,255,255,0.1)'
                                                            }}
                                                        />
                                                    )}
                                                    <div>
                                                        <div
                                                            style={{
                                                                fontWeight: 700,
                                                                fontSize: '1rem',
                                                                color: 'var(--color-text-main)',
                                                                ...clickableStyle
                                                            }}
                                                            onClick={() => !group.isPrivate && group.worldId && openWorldProfile(group.worldId, group.worldName)}
                                                        >
                                                            {group.worldName}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            {group.groupName && (
                                                                <span
                                                                    style={{ fontSize: '0.75rem', color: 'var(--color-primary)', ...clickableStyle }}
                                                                    onClick={() => group.groupId && openGroupProfile(group.groupId, group.groupName)}
                                                                >
                                                                    👥 {group.groupName}
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                                                                {group.instanceType}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {(!group.isPrivate || group.location.includes('groupAccessType(public)')) && (
                                                    <NeonButton
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => handleJoinInstance(group.location)}
                                                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.75rem', height: '28px', marginLeft: '1rem' }}
                                                    >
                                                        Join
                                                    </NeonButton>
                                                )}
                                            </div>

                                            {/* Friends Flex Grid */}
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '1rem'
                                            }}>
                                                {group.friends.map(friend => {
                                                    const userImage = friend.profilePicOverride || friend.userIcon || friend.currentAvatarThumbnailImageUrl;
                                                    return (
                                                        <div
                                                            key={friend.userId}
                                                            style={{
                                                                position: 'relative',
                                                                borderRadius: 'var(--border-radius)',
                                                                overflow: 'hidden',
                                                                background: 'var(--color-surface-card)',
                                                                border: '1px solid var(--border-color)',
                                                                height: '110px',
                                                                width: '200px', // Fixed width for nice flex alignment
                                                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                                                cursor: 'pointer',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                            }}
                                                            onClick={() => friend.userId && openUserProfile(friend.userId, friend.displayName)}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                                                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.transform = 'translateY(0)';
                                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                                            }}
                                                        >
                                                            {/* Instance Background Image */}
                                                            {(group.worldThumbnail) ? (
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: 0, left: 0, right: 0, bottom: 0,
                                                                    backgroundImage: `url(${group.worldThumbnail})`,
                                                                    backgroundSize: 'cover',
                                                                    backgroundPosition: 'center',
                                                                    opacity: 0.5, // Dim severely to make text and avatar pop
                                                                    filter: 'blur(0.5px)'
                                                                }} />
                                                            ) : (
                                                                /* Fallback Gradient if no world thumb */
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: 0, left: 0, right: 0, bottom: 0,
                                                                    background: `linear-gradient(135deg, ${getStatusColor(friend.status)}22, rgba(20,20,30,0.9))`
                                                                }} />
                                                            )}

                                                            {/* Dark Overlay for Contrast */}
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: 0, left: 0, right: 0, bottom: 0,
                                                                background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.2))'
                                                            }} />

                                                            {/* Content */}
                                                            <div style={{
                                                                position: 'relative',
                                                                zIndex: 2,
                                                                padding: '0.75rem',
                                                                height: '100%',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'space-between'
                                                            }}>
                                                                {/* Top Row: Avatar & Status */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                    {/* Avatar Circle */}
                                                                    <div style={{
                                                                        width: '45px',
                                                                        height: '45px',
                                                                        borderRadius: '50%',
                                                                        border: '2px solid var(--color-primary)',
                                                                        overflow: 'hidden',
                                                                        background: '#000',
                                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                                                                    }}>
                                                                        {userImage ? (
                                                                            <img
                                                                                src={userImage}
                                                                                alt={friend.displayName}
                                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                            />
                                                                        ) : (
                                                                            <div style={{
                                                                                width: '100%',
                                                                                height: '100%',
                                                                                background: `linear-gradient(45deg, ${getStatusColor(friend.status)}, #222)`,
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                fontSize: '1.2rem'
                                                                            }}>
                                                                                👤
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Status Pill */}
                                                                    <div style={{
                                                                        fontSize: '0.65rem',
                                                                        color: 'rgba(255,255,255,0.9)',
                                                                        background: 'rgba(0,0,0,0.6)',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        marginTop: '2px',
                                                                        backdropFilter: 'blur(4px)',
                                                                        border: '1px solid rgba(255,255,255,0.1)'
                                                                    }}>
                                                                        <span style={{
                                                                            display: 'inline-block',
                                                                            width: '6px',
                                                                            height: '6px',
                                                                            borderRadius: '50%',
                                                                            background: getStatusColor(friend.status),
                                                                            boxShadow: `0 0 5px ${getStatusColor(friend.status)}`,
                                                                            marginRight: '0.4rem'
                                                                        }} />
                                                                        {friend.status}
                                                                    </div>
                                                                </div>

                                                                {/* Bottom Row: Name */}
                                                                <div>
                                                                    <span style={{
                                                                        fontWeight: 700,
                                                                        fontSize: '0.95rem',
                                                                        color: 'white',
                                                                        textShadow: '0 2px 4px rgba(0,0,0,1)',
                                                                        display: 'block',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        marginTop: '0.25rem'
                                                                    }}>
                                                                        {friend.displayName}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ProfileModal
                profile={profile}
                onClose={closeProfile}
                openUserProfile={openUserProfile}
                openWorldProfile={openWorldProfile}
                openGroupProfile={openGroupProfile}
            />
        </GlassPanel >
    );
};
