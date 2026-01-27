import React from 'react';
import styles from './TitleBar.module.css';
import { Minus, Square, X } from 'lucide-react';

export const WindowControls: React.FC = () => {
  const handleMinimize = () => {
    try { window.electron.minimize(); } catch(e) { console.error('Minimize error:', e); }
  };
  
  const handleMaximize = () => {
    try { window.electron.maximize(); } catch(e) { console.error('Maximize error:', e); }
  };

  const handleClose = () => {
    try { window.electron.close(); } catch(e) { console.error('Close error:', e); }
  };

  return (
      <div className={styles.windowControls}>
           <button
               onClick={handleMinimize}
               className={`${styles.controlButton} ${styles.minimizeButton}`}
               aria-label="Minimize"
            >
               <Minus size={12} />
            </button>
            <button
               onClick={handleMaximize}
               className={`${styles.controlButton} ${styles.maximizeButton}`}
               aria-label="Maximize"
            >
               <Square size={12} />
            </button>
            <button
               onClick={handleClose}
               className={`${styles.controlButton} ${styles.closeButton}`}
               aria-label="Close"
            >
               <X size={14} />
            </button>
      </div>
  );
};
