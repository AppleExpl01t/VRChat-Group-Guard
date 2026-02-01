import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { NeonButton } from '../../components/ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './LoginView.module.css';
import { getBackendEnv, setBackendEnv } from '../../config';
import type { BackendEnv } from '../../config';

export const LoginView: React.FC = () => {
  const { login, verify2FA, requires2FA, isLoading, error, rememberMe, setRememberMe } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const initialEnv = getBackendEnv();
  const [env] = useState<BackendEnv>(initialEnv);

  const handleEnvToggle = () => {
    const newEnv = env === 'local' ? 'prod' : 'local';
    setBackendEnv(newEnv); // This triggers reload
  };

  // Load saved username if available (optional optimization)
  React.useEffect(() => {
    // We could pre-fill username here if desired
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requires2FA) {
      if (code) verify2FA(code);
    } else {
      if (username && password) login(username, password, rememberMe);
    }
  };

  // Particle interface for type safety
  interface Particle {
    id: number;
    left: number;
    width: number;
    height: number;
    isPrimary: boolean;
    duration: number;
    delay: number;
  }

  // Generate stable random values for particles (useState initializer runs once)
  const [particles] = useState<Particle[]>(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      width: Math.random() * 3 + 1,
      height: Math.random() * 3 + 1,
      isPrimary: Math.random() > 0.5,
      duration: Math.random() * 5 + 5,
      delay: Math.random() * 5
    }));
  });

  // Particle animation variants
  const particleVariants = {
    animate: (custom: Particle) => ({
      y: [0, -1000],
      opacity: [0, 0.5, 0],
      transition: {
        duration: custom.duration,
        repeat: Infinity,
        delay: custom.delay,
        ease: "linear" as const,
      },
    }),
  };

  return (
    <div className={styles.container}>
      {/* Dynamic Background Effects */}
      <div className={styles.bgRadialCenter} />
      <div className={styles.bgBlurTopLeft} />
      <div className={styles.bgBlurBottomRight} />

      {/* Floating Particles / Data Stream */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          custom={particle}
          variants={particleVariants}
          animate="animate"
          className={styles.particle}
          style={{
            left: `${particle.left}%`,
            width: `${particle.width}px`,
            height: `${particle.height}px`,
            background: particle.isPrimary ? 'var(--color-primary)' : 'cyan',
            boxShadow: `0 0 10px ${particle.isPrimary ? 'var(--color-primary)' : 'cyan'}`,
          }}
        />
      ))}

      {/* Main Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={styles.loginCard}
      >
        {/* Glow behind card */}
        <div className={styles.cardGlow} />

        {/* Header */}
        <div className={styles.header}>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div 
              className={styles.logoIcon}
              title="🛡️"
            >
               <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            style={{ marginBottom: '1rem' }}
          >
            <h2 className={styles.logoTitle}>
              VRChat
            </h2>
            <h1 className={`${styles.logoMain} text-gradient`}>
              GROUP GUARD
            </h1>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem' }}
          >
            {requires2FA ? 'Security Verification' : 'Command Center Access'}
          </motion.p>
        </div>

        {/* LOGIN FORM VIEW */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <AnimatePresence mode='wait'>
            {!requires2FA ? (
              <motion.div
                key="login-fields"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                {/* Username Input */}
                <div className={styles.inputGroup}>
                  <label className={`${styles.inputLabel} ${(focusedInput === 'username' || username) ? styles.inputLabelActive : ''}`}>
                    Username
                  </label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedInput('username')}
                    onBlur={() => setFocusedInput(null)}
                    className={styles.inputField}
                  />
                </div>

                {/* Password Input */}
                <div className={styles.inputGroup}>
                  <label className={`${styles.inputLabel} ${(focusedInput === 'password' || password) ? styles.inputLabelActive : ''}`}>
                    Password
                  </label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    className={styles.inputField}
                  />
                </div>
                
                {/* Remember Me Checkbox */}
                <motion.label 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={styles.rememberMe}
                >
                  <div 
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`${styles.checkbox} ${rememberMe ? styles.checkboxChecked : ''}`}
                  >
                    {rememberMe && (
                      <motion.svg 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        width="12" 
                        height="12" 
                        viewBox="0 0 12 12" 
                        fill="none"
                      >
                        <path 
                          d="M2 6L5 9L10 3" 
                          stroke="white" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        />
                      </motion.svg>
                    )}
                  </div>
                  <span 
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`${styles.checkboxLabel} ${rememberMe ? styles.checkboxLabelChecked : ''}`}
                  >
                    Remember me & auto-login
                  </span>
                </motion.label>
              </motion.div>
            ) : (
              <motion.div
                key="2fa-field"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}
              >
                <div className={styles.twoFaDisplay}>
                  Enter the code from your authenticator app
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                  <input 
                    type="text" 
                    value={code}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setCode(val);
                      if (val.length === 6) {
                        verify2FA(val);
                      }
                    }}
                    className={styles.twoFaInput}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                  <small style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                    Type your 6-digit code
                  </small>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ 
                  color: '#fb7185', 
                  fontSize: '0.9rem', 
                  textAlign: 'center', 
                  background: 'rgba(225, 29, 72, 0.1)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(225, 29, 72, 0.2)'
                }}
              >
                <pre style={{ 
                  margin: 0,
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  textAlign: 'left'
                }}>
                  {error}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>

          <NeonButton 
            type="submit" 
            variant="secondary"
            disabled={isLoading}
            style={{ width: '100%', height: '3.5rem', fontSize: '1.1rem' }}
          >
            {isLoading ? (
               <motion.div 
                 animate={{ rotate: 360 }}
                 transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                 style={{ 
                   width: '20px', 
                   height: '20px', 
                   border: '2px solid white', 
                   borderTopColor: 'transparent',
                   borderRadius: '50%'
                 }} 
               />
            ) : (requires2FA ? 'VERIFY IDENTITY' : 'Login with VRC')}
          </NeonButton>
        </form>
        
        {/* Security Footer */}
        <div className={styles.securityFooter}>
          <motion.div 
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
            onClick={() => setShowSecurityModal(true)}
            className={styles.securityButton}
          >
             <div style={{ 
               fontSize: '1.2rem',
               filter: 'drop-shadow(0 0 5px hsla(var(--primary-hue), 100%, 60%, 0.5))'
             }}>
               🔒
             </div>
             <div style={{ textAlign: 'left' }}>
               <div style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, letterSpacing: '0.02em' }}>
                 Double-Encrypted Vault
               </div>
               <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                 Stored logins are kept secure. Click for details.
               </div>
             </div>
          </motion.div>
        </div>

        {/* Security Info Modal (kept inline/simple or extract? It's fine to keep overlay inline to maintain Portal-like behavior visually for now, but style inner content) */}
        <AnimatePresence>
          {showSecurityModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSecurityModal(false)}
              style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                padding: '1rem'
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'rgba(20, 20, 30, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '24px',
                  padding: '2.5rem',
                  maxWidth: '500px',
                  width: '100%',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                  {/* Decorative background glow */}
                  <div style={{
                    position: 'absolute',
                    top: '-50%', left: '-50%',
                    width: '200%', height: '200%',
                    background: 'radial-gradient(circle at 50% 50%, hsla(var(--primary-hue), 100%, 60%, 0.1) 0%, transparent 60%)',
                    pointerEvents: 'none',
                    zIndex: 0
                  }} />

                  <div style={{ position: 'relative', zIndex: 1 }}>
                     <h2 style={{ color: 'white' }}>Maximum Security</h2>
                     <p style={{ color: 'rgba(255,255,255,0.7)' }}>Your data is encrypted with AES-256 + Windows DPAPI.</p>
                     <NeonButton onClick={() => setShowSecurityModal(false)} style={{ marginTop: '1rem' }}>Close</NeonButton>
                  </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Window Controls (Top Right) */}
      <div className={styles.windowControls}>
        <button
          onClick={() => {
            try { window.electron.minimize(); } catch(e) { console.error('Minimize error:', e); }
          }}
          className={styles.controlBtn}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button
          onClick={() => {
            try { window.electron.maximize(); } catch(e) { console.error('Maximize error:', e); }
          }}
          className={styles.controlBtn}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
        </button>
        <button
          onClick={() => {
            try { window.electron.close(); } catch(e) { console.error('Close error:', e); }
          }}
          className={`${styles.controlBtn} ${styles.controlBtnClose}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Backend Env Toggle (Dev Tool) */}
      <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 50 }}>
        <button 
          onClick={handleEnvToggle}
          title="Toggle Backend Environment"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: env === 'prod' ? '#ef4444' : '#22c55e',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.65rem',
            cursor: 'pointer',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        >
          ENV: {env}
        </button>
      </div>
    </div>
  );
};
