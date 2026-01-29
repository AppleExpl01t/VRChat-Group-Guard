import React from 'react';
import { NeonButton } from '../../../components/ui/NeonButton';
import { UserPlus, Gavel, Users, ShieldAlert, X } from 'lucide-react';
import styles from '../LiveView.module.css';
import { NeonSelect } from '../../../components/ui/NeonSelect';

interface LiveToolbarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onKickSelected: () => void;
    onInviteSelected: () => void;
    onRally: () => void;
    onRecruitAll: () => void;
    onLockdown: () => void;

    // State flags
    isRoaming: boolean;
    hasGroupSelected: boolean;
    isRallying: boolean;
    isRecruiting: boolean;
    progress: number | null; // 0-100

    statusText?: string;
    isLoading?: boolean;

    // Roaming Props
    roamingGroups?: { id: string; name: string }[];
    selectedRoamingGroupId?: string | null;
    onSelectRoamingGroup?: (id: string | null) => void;
}

export const LiveToolbar: React.FC<LiveToolbarProps> = ({
    selectedCount,
    onClearSelection,
    onKickSelected,
    onInviteSelected,
    onRally,
    onRecruitAll,
    onLockdown,
    isRoaming,
    hasGroupSelected,
    isRallying,
    isRecruiting,
    progress,
    statusText,
    isLoading,
    roamingGroups,
    selectedRoamingGroupId,
    onSelectRoamingGroup
}) => {

    if (selectedCount > 0) {
        // CONTEXTUAL MODE (Selection Active)
        return (
            <div className={styles.toolbarContainer} style={{ background: 'var(--color-surface-card)', padding: '12px', borderRadius: '12px', alignItems: 'center', border: '1px solid var(--color-primary)', marginTop: '0' }}>
                <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        background: 'var(--color-primary)', color: 'black',
                        fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem'
                    }}>
                        {selectedCount} SELECTED
                    </div>
                    <NeonButton variant="secondary" size="sm" onClick={onClearSelection}>
                        <X size={14} /> Clear
                    </NeonButton>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <NeonButton onClick={onInviteSelected} size="sm">
                        <UserPlus size={16} /> Invite
                    </NeonButton>

                    <NeonButton onClick={onKickSelected} variant="danger" size="sm">
                        <Gavel size={16} /> Kick / Ban
                    </NeonButton>
                </div>
            </div>
        );
    }

    // GLOBAL MODE (No Selection)
    return (
        <div className={styles.toolbarContainer}>
            {/* Unified Action Bar */}

            {/* Recruit / Invite All */}
            <NeonButton
                onClick={onRecruitAll}
                disabled={(isRoaming && !hasGroupSelected && !selectedRoamingGroupId) || (progress !== null && !isRecruiting) || isLoading}
                style={{ flex: 1, flexDirection: 'column', height: '60px', gap: '4px', position: 'relative', overflow: 'hidden' }}
            >
                {isRecruiting && progress !== null ? (
                    <>
                        <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${progress}%`,
                            background: 'rgba(var(--primary-hue), 100%, 50%, 0.3)',
                            transition: 'width 0.2s linear'
                        }} />
                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold' }}>{Math.round(progress)}%</span>
                            <span style={{ fontSize: '0.65rem' }}>{statusText || 'SENDING INVITES...'}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <UserPlus size={20} />
                        <span style={{ fontSize: '0.7rem' }}>
                            {isRoaming ? 'INVITE INSTANCE (ROAMING)' : 'INVITE INSTANCE (RECRUIT)'}
                        </span>
                    </>
                )}
            </NeonButton>



            {/* Rally Group / Roaming Selector */}
            {isRoaming ? (
                <div style={{ flex: 1, height: '60px', position: 'relative' }}>
                    <NeonSelect
                        value={selectedRoamingGroupId}
                        onChange={(val) => onSelectRoamingGroup && onSelectRoamingGroup(val)}
                        options={roamingGroups?.map(g => ({ value: g.id, label: g.name })) || []}
                        placeholder="SELECT GROUP"
                        direction="down" // Opens down since it's at the top of the controls (or maybe up if controls are at bottom? let's stick to default/down logic)
                    // Actually, looking at UI, if this is in the toolbar, 'up' might be better if it's at the bottom of the screen?
                    // But user typically expects down. Let's try 'down'. 
                    // Wait, the new layout puts health widget BELOW it. So 'down' goes over the widget, which is fine.
                    />
                </div>
            ) : (
                <NeonButton
                    onClick={onRally}
                    disabled={!hasGroupSelected || (progress !== null && !isRallying) || isLoading}
                    variant="secondary"
                    style={{ flex: 1, flexDirection: 'column', height: '60px', gap: '4px', position: 'relative', overflow: 'hidden' }}
                >
                    {isRallying && progress !== null ? (
                        <>
                            <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${progress}%`,
                                background: 'rgba(255, 255, 255, 0.2)',
                                transition: 'width 0.2s linear'
                            }} />
                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold' }}>{Math.round(progress)}%</span>
                                <span style={{ fontSize: '0.65rem' }}>{statusText || 'RALLY IN PROGRESS...'}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <Users size={20} />
                            <span style={{ fontSize: '0.7rem' }}>RALLY GROUP HERE</span>
                        </>
                    )}
                </NeonButton>
            )}

            {/* Lockdown */}
            <NeonButton
                onClick={onLockdown}
                variant="danger"
                style={{ flex: 1, flexDirection: 'column', height: '60px', gap: '4px' }}
            >
                <ShieldAlert size={20} />
                <span style={{ fontSize: '0.7rem' }}>EMERGENCY LOCKDOWN</span>
            </NeonButton>
        </div>
    );
};
