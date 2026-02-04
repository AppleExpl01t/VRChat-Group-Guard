import React, { useState } from 'react';
import { NeonButton } from '../../components/ui/NeonButton';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import { PrivacyDangerDialog } from './dialogs/PrivacyDangerDialog';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { TermsOfServiceModal } from '../setup/TermsOfServiceModal';
import { PrivacyPolicyModal } from '../setup/PrivacyPolicyModal';

const innerCardStyle: React.CSSProperties = {
    background: 'var(--color-surface-card)',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid var(--border-color)',
};

export const PrivacySettings: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDangerDialog, setShowDangerDialog] = useState(false);
    const { addNotification } = useNotificationStore();
    const logout = useAuthStore(state => state.logout);

    const handleExport = async () => {
        setIsExporting(true);
        addNotification({ type: 'info', title: 'Exporting Data', message: 'Generating your data package...' });

        try {
            const result = await window.electron.identity.exportUserData();
            
            if (result.success && result.data) {
                // Trigger download
                const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `groupguard-data-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                addNotification({ type: 'success', title: 'Export Complete', message: 'Your data has been successfully exported.' });
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error: unknown) {
            console.error('Export error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            addNotification({ type: 'error', title: 'Export Failed', message: errorMessage || 'Could not export data.' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            const result = await window.electron.identity.deleteAccount();
            if (result.success) {
                addNotification({ type: 'success', title: 'Account Deleted', message: 'Your account has been permanently removed. Goodbye!' });
                
                // Wait briefly for notification to be seen
                setTimeout(() => {
                   logout();
                }, 1500);
            } else {
                throw new Error(result.error);
            }
        } catch (error: unknown) {
            console.error('Delete error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            addNotification({ type: 'error', title: 'Deletion Failed', message: errorMessage || 'Could not delete account.' });
            setIsDeleting(false); // Only reset if failed, otherwise we are logging out
            setShowDangerDialog(false);
        }
    };

    const [showTosModal, setShowTosModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [cloudEnabled, setCloudEnabled] = useState(true);
    const [showCloudWarning, setShowCloudWarning] = useState(false);

    // Load initial settings
    React.useEffect(() => {
        const loadSettings = async () => {
            const settings = await window.electron.settings.get();
            if (settings.system?.enableCloudFeatures !== undefined) {
                setCloudEnabled(settings.system.enableCloudFeatures);
            }
        };
        loadSettings();
    }, []);

    const toggleCloudFeatures = async (newValue: boolean) => {
        if (!newValue) {
            setShowCloudWarning(true);
            return;
        }
        
        // Enabling requires explicit re-consent
        setShowTosModal(true);
    };

    const handleTosAccept = () => {
        setShowTosModal(false);
        setShowPrivacyModal(true);
    };

    const handleTosDecline = () => {
        setShowTosModal(false);
        addNotification({ type: 'warning', title: 'Not Enabled', message: 'TOS acceptance is required for Cloud Features.' });
    };

    const handlePrivacyComplete = async (accepted: boolean, privacyCloudEnabled: boolean) => {
        setShowPrivacyModal(false);
        
        if (accepted && privacyCloudEnabled) {
            await updateCloudSetting(true);
        } else {
             addNotification({ type: 'warning', title: 'Not Enabled', message: 'Privacy Policy acceptance is required for Cloud Features.' });
        }
    };

    const updateCloudSetting = async (enabled: boolean) => {
        try {
            // Fetch current settings to preserve other system fields
            const currentSettings = await window.electron.settings.get();
            const currentSystem = currentSettings.system || { 
                tosAcceptedVersion: null, 
                privacyAcceptedDate: null, 
                enableCloudFeatures: true 
            };

            await window.electron.settings.update({
                system: { 
                    ...currentSystem,
                    enableCloudFeatures: enabled 
                }
            });
            setCloudEnabled(enabled);
            addNotification({ 
                type: 'success', 
                title: enabled ? 'Cloud Enabled' : 'Cloud Disabled', 
                message: enabled ? 'Group Guard Cloud features active.' : 'Cloud features disabled.' 
            });
        } catch (e) {
            console.error(e);
            addNotification({ type: 'error', title: 'Error', message: 'Failed to update settings.' });
        }
    };

    return (
        <div style={{ marginTop: '1.5rem' }}>
            {/* Legal Modals for Reactivation */}
            <TermsOfServiceModal 
                isOpen={showTosModal}
                onAccept={handleTosAccept}
                onDecline={handleTosDecline}
                variant="settings"
            />
            <PrivacyPolicyModal 
                isOpen={showPrivacyModal}
                onComplete={handlePrivacyComplete}
            />

            <h3 style={{ color: 'var(--color-text-main)', fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Privacy & Data
            </h3>

            <div style={innerCardStyle}>
                {/* Cloud Features Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ color: 'var(--color-text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Group Guard Cloud
                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--color-primary)', color: 'white' }}>RECOMMENDED</span>
                        </div>
                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem', maxWidth: '500px' }}>
                            Enables community reporting, shared bans, and automated threat detection. 
                            If disabled, the app runs in offline mode for moderation.
                        </div>
                    </div>
                    
                    <div 
                        onClick={() => toggleCloudFeatures(!cloudEnabled)}
                        style={{
                            width: '50px',
                            height: '26px',
                            background: cloudEnabled ? 'var(--color-primary)' : 'var(--color-surface-card)',
                            borderRadius: '13px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            border: '1px solid var(--border-color)'
                        }}
                    >
                        <div style={{
                            width: '20px',
                            height: '20px',
                            background: 'white',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '2px',
                            left: cloudEnabled ? '26px' : '2px',
                            transition: 'left 0.3s ease',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Export My Data</div>
                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Download a copy of your personal data held by GroupGuard.</div>
                    </div>
                    <NeonButton
                        variant="secondary"
                        onClick={handleExport}
                        disabled={isExporting}
                    >
                        <Download size={16} style={{ marginRight: '8px' }} />
                        {isExporting ? 'Exporting...' : 'Export JSON'}
                    </NeonButton>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Reset Telemetry ID</div>
                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Generate a new anonymous installation UUID. This disconnects your future activity from past history.</div>
                    </div>
                    <NeonButton
                        variant="ghost"
                        onClick={async () => {
                            if (confirm('Are you sure you want to reset your Telemetry ID? This will generate a new anonymous UUID.')) {
                                await window.electron.installationId.reset();
                                addNotification({ type: 'success', title: 'ID Reset', message: 'New anonymous installation ID generated.' });
                            }
                        }}
                    >
                        <RefreshCw size={16} style={{ marginRight: '8px' }} />
                        Reset ID
                    </NeonButton>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ color: '#ef4444', fontWeight: 600 }}>Delete Account</div>
                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Permanently remove your account and all associated data.</div>
                    </div>
                    <NeonButton
                        variant="danger"
                        onClick={() => setShowDangerDialog(true)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)' }}
                    >
                        <Trash2 size={16} style={{ marginRight: '8px' }} />
                        Delete Account
                    </NeonButton>
                </div>
            </div>

            <PrivacyDangerDialog
                isOpen={showDangerDialog}
                onClose={() => setShowDangerDialog(false)}
                onConfirm={handleDeleteAccount}
                isLoading={isDeleting}
            />

            {/* Cloud Disable Warning using existing Dialog or a simple confirm if Dialog not flexible */}
            {/* Reusing PrivacyDangerDialog for simplicity but customizing text would be better. 
                However, let's use the browser confirm/custom modal if available. 
                actually, I can't easily perform a complex modal here without importing ConfirmationModal 
                which I forgot to import. Let's rely on standard confirm for now OR import ConfirmationModal.
                Let's import proper ConfirmationModal.
            */}
            {showCloudWarning && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ width: '400px', background: '#1a1a2e', padding: '2rem', borderRadius: '12px', border: '1px solid #ef4444' }}>
                        <h3 style={{ color: '#ef4444', marginTop: 0 }}>⚠️ Disable Cloud?</h3>
                        <p style={{ color: 'white' }}>
                            You will lose access to the Community Reporting System, Shared Bans, and Automated Threat Intelligence.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <NeonButton variant="ghost" onClick={() => setShowCloudWarning(false)}>Cancel</NeonButton>
                            <NeonButton variant="danger" onClick={() => {
                                setShowCloudWarning(false);
                                updateCloudSetting(false);
                            }}>Disable Features</NeonButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
