import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { NeonButton } from '../../../components/ui/NeonButton';
import { useGroupStore } from '../../../stores/groupStore';
import { useUserProfileStore } from '../../../stores/userProfileStore';
import { Modal } from '../../../components/ui/Modal';
import type { GroupMember } from '../../../types/electron';

import { MemberRoleDialog } from '../dialogs/MemberRoleDialog';

export const MemberSearchWidget: React.FC = () => {
    const { selectedGroup, fetchGroupMembers } = useGroupStore();
    const { openProfile } = useUserProfileStore();
    const [search, setSearch] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<GroupMember[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    
    // Debounce timer ref
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Action states
    const [actionTarget, setActionTarget] = useState<GroupMember | null>(null);
    const [actionType, setActionType] = useState<'kick' | 'ban' | 'roles' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

    // Debounced API search
    const performSearch = useCallback(async (query: string) => {
        if (!selectedGroup || !query.trim()) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }
        
        setIsSearching(true);
        setSearchError(null);
        
        try {
            const result = await window.electron.searchGroupMembers(selectedGroup.id, query, 15);
            if (result.success && result.members) {
                setSearchResults(result.members);
            } else {
                setSearchError(result.error || 'Search failed');
                setSearchResults([]);
            }
        } catch (error) {
            const err = error as { message?: string };
            setSearchError(err.message || 'Search failed');
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [selectedGroup]);

    // Handle search input with debounce
    const handleSearchChange = useCallback((value: string) => {
        setSearch(value);
        setIsExpanded(value.length > 0);
        
        // Clear previous debounce timer
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        
        // Debounce the API call (300ms)
        if (value.trim().length >= 2) {
            debounceRef.current = setTimeout(() => {
                performSearch(value);
            }, 300);
        } else {
            setSearchResults([]);
            setSearchError(null);
        }
    }, [performSearch]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    // Handle action confirmation
    const handleAction = async () => {
        if (!actionTarget || !actionType || !selectedGroup) return;
        
        setIsProcessing(true);
        setActionResult(null);
        
        try {
            if (actionType === 'ban') {
                const result = await window.electron.banUser(selectedGroup.id, actionTarget.userId);
                if (result.success) {
                    setActionResult({ success: true, message: `${actionTarget.user.displayName} has been banned.` });
                    // Refresh members list and clear search
                    fetchGroupMembers(selectedGroup.id);
                    setSearch('');
                    setSearchResults([]);
                } else {
                    setActionResult({ success: false, message: result.error || 'Failed to ban user.' });
                }
            } else if (actionType === 'kick') {
                // Kick is implemented as a short ban in VRChat
                const result = await window.electron.banUser(selectedGroup.id, actionTarget.userId);
                if (result.success) {
                    setActionResult({ success: true, message: `${actionTarget.user.displayName} has been kicked.` });
                    fetchGroupMembers(selectedGroup.id);
                    setSearch('');
                    setSearchResults([]);
                } else {
                    setActionResult({ success: false, message: result.error || 'Failed to kick user.' });
                }
            }
            // Roles handled by Dialog component directly updating state/backend
        } catch (error) {
            const err = error as { message?: string };
            setActionResult({ success: false, message: err.message || 'An error occurred.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const closeActionModal = () => {
        setActionTarget(null);
        setActionType(null);
        setActionResult(null);
    };

    const openActionModal = (member: GroupMember, type: 'kick' | 'ban' | 'roles') => {
        setActionTarget(member);
        setActionType(type);
        setActionResult(null);
    };

    return (
        <>
            <GlassPanel style={{ 
                padding: '0.6rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem',
                flex: isExpanded ? '1' : '0 0 auto',
                minHeight: isExpanded ? '180px' : 'auto',
                maxHeight: isExpanded ? '320px' : 'auto',
                transition: 'all 0.2s ease'
            }}>
                {/* Header */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                }}>
                    <span style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--color-accent)', 
                        fontWeight: 600,
                        letterSpacing: '0.5px'
                    }}>
                        MEMBER SEARCH
                    </span>
                    {isSearching && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--color-primary)' }}>Searching...</span>
                    )}
                </div>

                {/* Search Input */}
                <input
                    type="text"
                    placeholder="Search members (min 2 chars)..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: '0.8rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                />

                {/* Results List */}
                {isExpanded && (
                    <div style={{ 
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        minHeight: 0
                    }}>
                        {/* Status messages */}
                        {search.trim().length < 2 && search.trim().length > 0 && (
                            <div style={{ 
                                padding: '0.75rem', 
                                textAlign: 'center', 
                                color: 'var(--color-text-dim)',
                                fontSize: '0.7rem'
                            }}>
                                Type at least 2 characters to search
                            </div>
                        )}
                        
                        {searchError && (
                            <div style={{ 
                                padding: '0.75rem', 
                                textAlign: 'center', 
                                color: 'var(--color-danger)',
                                fontSize: '0.7rem'
                            }}>
                                {searchError}
                            </div>
                        )}
                        
                        {!isSearching && !searchError && searchResults.length === 0 && search.trim().length >= 2 && (
                            <div style={{ 
                                padding: '0.75rem', 
                                textAlign: 'center', 
                                color: 'var(--color-text-dim)',
                                fontSize: '0.7rem'
                            }}>
                                No members found
                            </div>
                        )}
                        
                        {/* Results */}
                        {searchResults.map(member => (
                            <div 
                                key={member.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '6px 8px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '6px',
                                    gap: '8px',
                                    transition: 'background 0.15s'
                                }}
                            >
                                {/* Avatar */}
                                <img
                                    src={member.user.userIcon || member.user.currentAvatarThumbnailImageUrl || undefined}
                                    alt=""
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        cursor: 'pointer',
                                        border: '2px solid rgba(255,255,255,0.1)'
                                    }}
                                    onClick={() => openProfile(member.userId)}
                                />
                                
                                {/* Name */}
                                <div 
                                    style={{ 
                                        flex: 1, 
                                        minWidth: 0,
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => openProfile(member.userId)}
                                >
                                    <div style={{ 
                                        fontWeight: 600, 
                                        fontSize: '0.8rem',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {member.user.displayName}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.65rem', 
                                        color: 'var(--color-text-dim)',
                                        textTransform: 'capitalize'
                                    }}>
                                        {member.membershipStatus}
                                    </div>
                                </div>
                                
                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                    <button
                                        onClick={() => openActionModal(member, 'roles')}
                                        title="Manage Roles"
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            background: 'rgba(59, 130, 246, 0.15)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            borderRadius: '4px',
                                            color: '#60A5FA',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                                        }}
                                    >
                                        ROLES
                                    </button>
                                    <button
                                        onClick={() => openActionModal(member, 'kick')}
                                        title="Kick from group"
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            background: 'rgba(255, 165, 0, 0.15)',
                                            border: '1px solid rgba(255, 165, 0, 0.3)',
                                            borderRadius: '4px',
                                            color: '#FFA500',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.15)';
                                        }}
                                    >
                                        KICK
                                    </button>
                                    <button
                                        onClick={() => openActionModal(member, 'ban')}
                                        title="Ban from group"
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            background: 'rgba(239, 68, 68, 0.15)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            borderRadius: '4px',
                                            color: '#EF4444',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                        }}
                                    >
                                        BAN
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </GlassPanel>

            {/* Action Confirmation Modal */}
            <Modal
                isOpen={!!actionTarget && !!actionType && actionType !== 'roles'}
                onClose={closeActionModal}
                title={actionType === 'ban' ? 'Confirm Ban' : 'Confirm Kick'}
                width="400px"
            >
                {actionResult ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <div style={{ 
                            fontSize: '2rem', 
                            marginBottom: '0.5rem'
                        }}>
                            {actionResult.success ? '✓' : '✗'}
                        </div>
                        <div style={{ 
                            color: actionResult.success ? 'var(--color-success)' : 'var(--color-danger)',
                            marginBottom: '1rem'
                        }}>
                            {actionResult.message}
                        </div>
                        <NeonButton onClick={closeActionModal}>
                            Close
                        </NeonButton>
                    </div>
                ) : (
                    <div style={{ padding: '0.5rem' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px',
                            marginBottom: '1rem',
                            padding: '0.75rem',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px'
                        }}>
                            <img
                                src={actionTarget?.user.userIcon || actionTarget?.user.currentAvatarThumbnailImageUrl || ''}
                                alt=""
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    objectFit: 'cover'
                                }}
                            />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                                    {actionTarget?.user.displayName}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                    {actionTarget?.membershipStatus}
                                </div>
                            </div>
                        </div>
                        
                        <p style={{ 
                            marginBottom: '1rem', 
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.85rem'
                        }}>
                            {actionType === 'ban' 
                                ? `Are you sure you want to ban this user from ${selectedGroup?.name}? They will not be able to rejoin until unbanned.`
                                : `Are you sure you want to kick this user from ${selectedGroup?.name}?`
                            }
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <NeonButton 
                                variant="ghost" 
                                onClick={closeActionModal}
                                disabled={isProcessing}
                            >
                                Cancel
                            </NeonButton>
                            <NeonButton 
                                variant={actionType === 'ban' ? 'danger' : 'primary'}
                                onClick={handleAction}
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Processing...' : (actionType === 'ban' ? 'Ban User' : 'Kick User')}
                            </NeonButton>
                        </div>
                    </div>
                )}
            </Modal>
            {/* Role Management Dialog */}
            {selectedGroup && (
                <MemberRoleDialog 
                    isOpen={!!actionTarget && actionType === 'roles'} 
                    onClose={closeActionModal}
                    member={actionTarget}
                    groupId={selectedGroup.id}
                    onUpdate={() => {
                        // Refresh search logic if needed, or update the specific member in search results list 
                        // (Requires fetching latest member data, but for now we rely on Dialog internal state for roles)
                        // If we want to refresh the search list to show new roles:
                        if (search.trim().length >= 2) performSearch(search);
                        fetchGroupMembers(selectedGroup.id);
                    }}
                />
            )}
        </>
    );
};
