import React from 'react';
import { Modal } from '../ui/Modal';
import { NeonButton } from '../ui/NeonButton';
import { UserProfileDialog } from '../../features/dashboard/dialogs/UserProfileDialog';
import { useUpdateStore } from '../../stores/updateStore';
import { Download } from 'lucide-react';

interface GlobalModalsProps {
  isLogoutConfirmOpen: boolean;
  setIsLogoutConfirmOpen: (open: boolean) => void;
  onLogoutConfirm: () => void;
}

export const GlobalModals: React.FC<GlobalModalsProps> = ({
  isLogoutConfirmOpen,
  setIsLogoutConfirmOpen,
  onLogoutConfirm,
}) => {
  const { downloadProgress } = useUpdateStore();

  return (
    <>
      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title="Confirm Logout"
        width="400px"
        footer={
            <>
                <NeonButton 
                    variant="ghost" 
                    onClick={() => setIsLogoutConfirmOpen(false)}
                >
                    Cancel
                </NeonButton>
                <NeonButton 
                    variant="danger" 
                    onClick={onLogoutConfirm}
                >
                    Logout
                </NeonButton>
            </>
        }
      >
        <div style={{ color: 'var(--color-text-dim)', lineHeight: '1.6' }}>
            Are you sure you want to log out?
            <br />
            You can receive a quick login (without 2FA) next time if you don't clear your credentials.
        </div>
      </Modal>

      {/* Global User Profile Dialog (Controlled by its own store) */}
      <UserProfileDialog />

      {/* Download Progress Toast - shown while downloading */}
      {downloadProgress !== null && (
        <div style={{ 
            position: 'fixed', 
            bottom: 20, 
            right: 20, 
            background: 'var(--color-surface-hover)', 
            padding: '12px', 
            borderRadius: '8px', 
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            border: '1px solid var(--color-border)',
            width: '240px'
        }}>
            <div style={{ color: 'var(--color-text-bright)', marginBottom: 8, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Download size={16} style={{ color: 'var(--color-primary)' }} />
                    Downloading Update...
                </span>
                <span>{Math.round(downloadProgress)}%</span>
            </div>
            <div style={{ width: '100%', height: 4, background: 'var(--color-surface)', borderRadius: 2 }}>
                <div style={{ 
                    width: `${downloadProgress}%`, 
                    height: '100%', 
                    background: 'var(--color-primary)', 
                    borderRadius: 2,
                    transition: 'width 0.2s ease-out'
                }} />
            </div>
        </div>
      )}
    </>
  );
};

