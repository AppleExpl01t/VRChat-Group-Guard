import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { FileText } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
// import ReactMarkdown from 'react-markdown';
import tosMd from '../../assets/legal/TERMS_OF_SERVICE.md?raw'; // Assumption

const DEFAULT_TOS = `# Terms of Service
**Last Updated:** February 2026

## 1. Acceptance of Terms
By accessing or using Group Guard, you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service.

## 2. Description of Service
Group Guard is a moderation and analytics tool for VRChat group owners.
...
(Full TOS text)
`;

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void; // Trigger App Quit or Close Modal
  variant?: 'startup' | 'settings';
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ isOpen, onAccept, onDecline, variant = 'startup' }) => {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  if (!isOpen) return null;

  const handleDeclineClick = () => {
    if (variant === 'startup') {
      setShowQuitConfirm(true);
    } else {
      onDecline();
    }
  };

  const cancelQuit = () => {
    setShowQuitConfirm(false);
  };

  const confirmQuit = () => {
    onDecline(); // Parent handles quit
  };

  return ReactDOM.createPortal(
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(0,0,0,0.85)',
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
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(56, 189, 248, 0.1)' }}>
              <div style={{ 
                width: '48px', height: '48px', 
                background: 'rgba(56, 189, 248, 0.2)', 
                borderRadius: '12px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#38bdf8'
              }}>
                <FileText size={24} />
              </div>
              <div>
                <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Terms of Service</h1>
                <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Please accept the terms to use Group Guard.</div>
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
                  {tosMd || DEFAULT_TOS}
               </div>
            </div>

            {/* Sticky Footer */}
            <div style={{ padding: '1.5rem', background: 'var(--color-surface-hover)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <NeonButton 
                variant="secondary" 
                onClick={handleDeclineClick}
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
              >
                {variant === 'startup' ? 'Decline & Exit' : 'Cancel'}
              </NeonButton>
              <NeonButton 
                variant="primary" 
                size="lg"
                onClick={onAccept}
                style={{ minWidth: '150px' }}
              >
                I Accept
              </NeonButton>
            </div>

          </GlassPanel>
        </motion.div>
      </div>

      {/* Decline Confirmation (Only for Startup) */}
      <ConfirmationModal
        isOpen={showQuitConfirm}
        onClose={cancelQuit}
        onConfirm={confirmQuit}
        title="Terms Required"
        message={`
          Group Guard cannot be used without accepting the Terms of Service.
          
          The application will now close.
        `}
        confirmLabel="Exit Application"
        variant="danger" 
        cancelLabel="Back"
      />
    </>,
    document.body
  );
};
