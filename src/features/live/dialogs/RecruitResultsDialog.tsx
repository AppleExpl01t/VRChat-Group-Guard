import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { NeonButton } from '../../../components/ui/NeonButton';

interface BlockedUser {
    name: string;
    reason?: string;
}

interface RecruitResultsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    blockedUsers: BlockedUser[];
    totalInvited: number;
}

export const RecruitResultsDialog: React.FC<RecruitResultsDialogProps> = ({ 
    isOpen, onClose, blockedUsers, totalInvited 
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Recruitment Report" width="500px">
             <div style={{ padding: '0 0.5rem', color: 'var(--color-text-main)' }}>
                 <p style={{ marginBottom: '1.5rem', fontSize: '1rem', lineHeight: '1.5', color: 'rgba(255,255,255,0.8)' }}>
                    Successfully sent invites to <strong style={{ color: 'var(--color-success)', fontSize: '1.1rem' }}>{totalInvited}</strong> users.
                 </p>
                 
                 {blockedUsers.length > 0 && (
                     <>
                        <div style={{ 
                            padding: '1rem', 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            marginBottom: '1rem'
                        }}>
                            <div style={{ color: '#f87171', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                {blockedUsers.length} Users Blocked by AutoMod
                            </div>
                            
                            <div style={{ 
                                maxHeight: '200px',
                                overflowY: 'auto',
                                marginTop: '0.5rem',
                                paddingRight: '4px'
                            }}>
                                {blockedUsers.map((u, i) => (
                                    <div key={i} style={{ 
                                        padding: '0.5rem', 
                                        marginBottom: '0.5rem',
                                        background: 'rgba(0, 0, 0, 0.2)', 
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ fontWeight: '600', color: 'white' }}>{u.name}</div>
                                        {u.reason && (
                                            <div style={{ fontSize: '0.8rem', color: '#fca5a5', background: 'rgba(255,0,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                {u.reason}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                     </>
                 )}
                 
                 <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                     <NeonButton onClick={onClose} variant="secondary">Close</NeonButton>
                 </div>
             </div>
        </Modal>
    );
};
