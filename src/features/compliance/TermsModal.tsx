import React, { useState } from 'react';
import { 
  Shield, AlertTriangle, Check, X, ExternalLink, AlertCircle, 
  Lock, Database, UserX, Scale, Ban, CreditCard, Link as LinkIcon
} from 'lucide-react';
import { 
  CURRENT_TOS_VERSION, 
  TOS_LAST_UPDATED, 
  TOS_SECTIONS, 
  TOS_GITHUB_URL
} from './TosText';
import type { TosSection, TosContent } from './TosText';
import { Modal } from '../../components/ui/Modal';
import { NeonButton } from '../../components/ui/NeonButton';
import styles from './TermsModal.module.css';

interface TermsModalProps {
  onAccept: () => void;
}

// Icon mapping
const getIcon = (iconName: TosSection['icon'], size = 14) => {
  const icons = {
    'shield': <Shield size={size} />,
    'warning': <AlertTriangle size={size} />,
    'database': <Database size={size} />,
    'user-x': <UserX size={size} />,
    'scale': <Scale size={size} />,
    'ban': <Ban size={size} />,
    'lock': <Lock size={size} />,
    'credit-card': <CreditCard size={size} />,
    'alert': <AlertCircle size={size} />,
    'link': <LinkIcon size={size} />
  };
  return icons[iconName] || <Shield size={size} />;
};

// Render rich text with **bold** support
const renderRichText = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className={styles.bold}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// Render ToS content recursively
const renderContent = (content: TosContent[], depth = 0): React.ReactNode => {
  return content.map((item, index) => {
    switch (item.type) {
      case 'paragraph':
        return (
          <p key={index} className={styles.paragraph}>
            {renderRichText(item.text)}
          </p>
        );
      
      case 'list': {
        const ListTag = item.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={index} className={`${styles.list} ${item.ordered ? styles.ordered : ''}`}>
            {item.items.map((listItem, i) => (
              <li key={i} className={styles.listItem}>
                {item.ordered && <span className={styles.listNumber}>{i + 1}</span>}
                <span>{renderRichText(listItem)}</span>
              </li>
            ))}
          </ListTag>
        );
      }
      
      case 'highlight':
        return (
          <div key={index} className={`${styles.highlight} ${styles[item.variant]}`}>
            {renderRichText(item.text)}
          </div>
        );
      
      case 'subsection':
        return (
          <div key={index} className={styles.subsection}>
            <h4 className={styles.subsectionTitle}>{item.title}</h4>
            {renderContent(item.content, depth + 1)}
          </div>
        );
      
      default:
        return null;
    }
  });
};

// Section Component
const Section: React.FC<{ section: TosSection }> = ({ section }) => {
  const variantClass = section.variant ? styles[section.variant] : '';
  
  return (
    <div className={`${styles.section} ${variantClass}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}>
          {getIcon(section.icon)}
        </div>
        <h3 className={styles.sectionTitle}>{section.title}</h3>
      </div>
      <div className={styles.sectionContent}>
        {renderContent(section.content)}
      </div>
    </div>
  );
};

export const TermsModal: React.FC<TermsModalProps> = ({ onAccept }) => {
  const [step, setStep] = useState<'read' | 'deny-confirm'>('read');

  const handleAccept = async () => {
    try {
      if (window.electron?.settings) {
        await window.electron.settings.update({ tosAcceptedVersion: CURRENT_TOS_VERSION });
        onAccept();
      } else {
        console.error("Electron API missing");
      }
    } catch (e) {
      console.error("Failed to save ToS acceptance", e);
      alert("Failed to save settings. Please try again.");
    }
  };

  const handleDeny = () => {
    setStep('deny-confirm');
  };

  const confirmDeny = () => {
    if (window.electron?.close) {
      window.electron.close();
    } else {
      window.close();
    }
  };

  if (step === 'deny-confirm') {
    return (
      <Modal
        isOpen={true}
        onClose={() => setStep('read')}
        title="Decline Terms?"
        width="450px"
        closable={false}
      >
        <div className={styles.denyDialog}>
          <div className={styles.denyIcon}>
            <AlertTriangle size={40} />
          </div>
          
          <p className={styles.denyMessage}>
            You must accept the Terms of Service to use Group Guard.
            <br />
            Declining will <strong className={styles.dangerText}>close the application</strong>.
          </p>

          <div className={styles.denyActions}>
            <NeonButton 
              onClick={() => setStep('read')}
              variant="secondary"
              style={{ width: '100%' }}
            >
              Back to Terms
            </NeonButton>
            
            <button
              onClick={confirmDeny}
              className={styles.exitButton}
            >
              <X size={16} />
              Decline & Exit App
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={() => {}}
      title=""
      width="600px"
      closable={false}
    >
      <div className={styles.container}>
        {/* Custom Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Shield size={22} />
          </div>
          <div className={styles.headerText}>
            <h2 className={styles.headerTitle}>
              Terms of Service
              <span className={styles.requiredBadge}>Required</span>
            </h2>
            <p className={styles.headerMeta}>
              Version {CURRENT_TOS_VERSION} • Last Updated: {TOS_LAST_UPDATED}
            </p>
          </div>
        </div>

        {/* Important Notice */}
        <div className={`${styles.highlight} ${styles.warning}`}>
          <AlertCircle size={14} className={styles.highlightIcon} />
          <div>
            <strong>PLEASE READ CAREFULLY</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              By clicking "I AGREE", downloading, or using Group Guard for VRChat, you agree to be bound by these terms.
            </p>
          </div>
        </div>

        {/* Official Source */}
        <a 
          href={TOS_GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          <ExternalLink size={14} />
          <span>
            <strong>Official Source:</strong> {TOS_GITHUB_URL.replace('https://', '')}
          </span>
        </a>

        {/* Scrollable Sections */}
        <div className={styles.scrollArea}>
          {TOS_SECTIONS.map(section => (
            <Section key={section.id} section={section} />
          ))}

          {/* Final Notice */}
          <div className={styles.finalNotice}>
            BY CLICKING "I AGREE", YOU CONFIRM THAT YOU HAVE READ, UNDERSTOOD, AND AGREED TO THESE TERMS.
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <button onClick={handleDeny} className={styles.declineButton}>
            Decline
          </button>
          
          <NeonButton
            onClick={handleAccept}
            variant="primary"
            style={{ minWidth: '160px' }}
          >
            <Check size={16} />
            <span>I Accept</span>
          </NeonButton>
        </div>
      </div>
    </Modal>
  );
};
