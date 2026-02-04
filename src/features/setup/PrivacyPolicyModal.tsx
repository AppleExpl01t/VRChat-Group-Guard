import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { Shield, Check, X } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
// import ReactMarkdown from 'react-markdown'; // Removed to avoid dependency
import privacyPolicyMd from '../../assets/legal/PRIVACY_POLICY.md?raw'; // Assumption: Policy is generic or we use a text fallback if file import fails

// Fallback text if file import assumes a specific buildup
const DEFAULT_POLICY = `# Privacy Policy
**Last Updated:** February 2026

## 1. Minimal Data Collection
Group Guard is designed with privacy as a core tenet. We collect the absolute minimum data required to function.
...
(Full policy text would go here or be loaded from file)
`;

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onComplete: (accepted: boolean, cloudEnabled: boolean) => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onComplete }) => {
  const [cloudEnabled, setCloudEnabled] = useState(true);
  const [showCloudWarning, setShowCloudWarning] = useState(false);

  if (!isOpen) return null;

  const handleContinue = () => {
    if (!cloudEnabled) {
      setShowCloudWarning(true);
    } else {
      onComplete(true, true);
    }
  };

  const confirmDisableCloud = () => {
    setShowCloudWarning(false);
    onComplete(true, false);
  };

  return ReactDOM.createPortal(
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >
          <GlassPanel style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '48px', height: '48px', 
                background: 'rgba(59, 130, 246, 0.2)', 
                borderRadius: '12px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#60a5fa'
              }}>
                <Shield size={24} />
              </div>
              <div>
                <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Privacy & Cloud Features</h1>
                <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Please review our privacy practices.</div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
               <div style={{ 
                 whiteSpace: 'pre-wrap', 
                 fontFamily: 'monospace', 
                 fontSize: '0.9rem',
                 color: 'var(--color-text-main)',
                 lineHeight: '1.5'
               }}>
                  {privacyPolicyMd || DEFAULT_POLICY}
               </div>
            </div>

            {/* Cloud Toggle Section */}
            <div style={{ padding: '1.5rem', background: 'var(--color-surface-hover)', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--color-text-main)', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Group Guard Cloud
                    <span style={{ 
                      fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', 
                      background: 'var(--color-primary)', color: 'white' 
                    }}>RECOMMENDED</span>
                  </div>
                  <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                    Enables community-powered reporting, shared ban lists, and automated threat detection. 
                    Anonymous telemetry is used to improve detection accuracy.
                  </div>
                </div>

                {/* Toggle Switch */}
                <div 
                  onClick={() => setCloudEnabled(!cloudEnabled)}
                  style={{
                    width: '56px',
                    height: '30px',
                    background: cloudEnabled ? 'var(--color-primary)' : 'var(--color-surface-card)',
                    borderRadius: '15px',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.3s ease',
                    border: '1px solid var(--border-color)',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    background: 'white',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '2px',
                    left: cloudEnabled ? '28px' : '2px',
                    transition: 'left 0.3s ease',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {cloudEnabled ? <Check size={14} color="var(--color-primary)" /> : <X size={14} color="#666" />}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <NeonButton 
                  variant="primary" 
                  size="lg"
                  onClick={handleContinue}
                  style={{ minWidth: '150px' }}
                >
                  Continue
                </NeonButton>
              </div>
            </div>

          </GlassPanel>
        </motion.div>
      </div>

      {/* Cloud Opt-Out Warning Modal */}
      <ConfirmationModal
        isOpen={showCloudWarning}
        onClose={() => setShowCloudWarning(false)}
        onConfirm={confirmDisableCloud}
        title="⚠️ Disable Cloud Features?"
        message={`
          Are you sure you want to disable Group Guard Cloud?
          
          You will lose access to:
          • Community Reporting System
          • Shared Ban Lists
          • Automated Threat Intelligence
          
          The app will effectively run in "Offline Mode" for all moderation features.
        `}
        confirmLabel="Yes, Disable & Continue"
        variant="danger"
        cancelLabel="Go Back"
      />
    </>,
    document.body
  );
};
