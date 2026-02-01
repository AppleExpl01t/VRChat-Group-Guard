import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { useAdminStore } from '../../stores/adminStore';
import { Shield, X, LogIn, UserPlus, AlertTriangle, CheckCircle, Users, Activity, Ban, Clock, Globe, Server } from 'lucide-react';
import dashStyles from './AdminDashboard.module.css';

interface AdminPanelViewProps {
  isOpen: boolean;
  onClose: () => void;
}

// Backend API URL (TODO: Move to config)
// Backend API URL (TODO: Move to config)
import { getBackendUrl, getBackendEnv, setBackendEnv } from '../../config';
import type { BackendEnv } from '../../config';

const BACKEND_URL = getBackendUrl();

// Input field style
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: 'var(--color-surface-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--color-text)',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
};

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({ isOpen, onClose }) => {
  const { adminSessionToken, adminUser, setAdminSession, recordFailedLogin, resetAdminAccess } = useAdminStore();
  
  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register fields
  const [inviteToken, setInviteToken] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regUsernameConfirm, setRegUsernameConfirm] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  
  // State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  const [showManageAdmins, setShowManageAdmins] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [env] = useState<BackendEnv>(getBackendEnv());

  const handleEnvToggle = () => {
    const newEnv = env === 'local' ? 'prod' : 'local';
    setBackendEnv(newEnv); // Reloads app
  };

  // Auto-fetch profile if logged in but user data missing
  React.useEffect(() => {
    if (adminSessionToken && !adminUser) {
      console.log('Fetching admin profile...');
      fetch(`${BACKEND_URL}/admin/me`, {
        headers: { 'Authorization': `Bearer ${adminSessionToken}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
           console.log('Profile fetched:', data.data);
           setAdminSession(adminSessionToken, data.data);
        }
      })
      .catch(console.error);
    }
  }, [adminSessionToken, adminUser, setAdminSession]);

  const resetForms = () => {
    setLoginUsername('');
    setLoginPassword('');
    setInviteToken('');
    setRegUsername('');
    setRegUsernameConfirm('');
    setRegPassword('');
    setRegPasswordConfirm('');
    setError(null);
    setSuccess(null);
  };

  const switchMode = (newMode: 'login' | 'register') => {
    console.log('[AdminPanel] switchMode called, newMode:', newMode);
    try {
      resetForms();
      console.log('[AdminPanel] Forms reset successfully');
      setMode(newMode);
      console.log('[AdminPanel] Mode set to:', newMode);
    } catch (err) {
      console.error('[AdminPanel] Error in switchMode:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAdminSession(data.token, data.data);
        resetForms();
      } else {
        // Handle error object or string
        const errorMsg = typeof data.error === 'object' ? data.error.message : (data.error || 'Login failed');
        setError(errorMsg);
        recordFailedLogin();
      }
    } catch {
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (regUsername !== regUsernameConfirm) {
      setError('Usernames do not match');
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!inviteToken.trim()) {
      setError('Invite token is required');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: regUsername, 
          password: regPassword, 
          inviteToken: inviteToken.trim() 
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        resetForms();
        setMode('login');
        setError(null);
        // Show success message in-app
        setSuccess('Registration successful! Please log in with your new credentials.');
      } else {
        // Check for unauthorized/invalid token errors
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          setShowUnauthorizedModal(true);
        } else {
          // Handle error object or string
          const errorMsg = typeof data.error === 'object' ? data.error.message : (data.error || 'Registration failed');
          setError(errorMsg);
        }
      }
    } catch {
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const handleUnauthorizedAcknowledge = () => {
    setShowUnauthorizedModal(false);
    resetAdminAccess();
    onClose();
  };

  const handleLogout = () => {
    setAdminSession(null, null);
    setShowManageAdmins(false);
  };

  const handleIShouldntBeHere = () => {
    resetAdminAccess();
    onClose();
  };

  if (!isOpen) return null;

  // Unauthorized Modal
  if (showUnauthorizedModal) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GlassPanel style={{ padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
          <h2 style={{ margin: 0, color: 'var(--color-text)' }}>Unauthorized</h2>
          <p style={{ color: 'var(--color-text-dim)', margin: '1rem 0' }}>
            Your invite token is invalid, expired, or has already been used.
          </p>
          <NeonButton onClick={handleUnauthorizedAcknowledge} style={{ width: '100%' }}>
            OK
          </NeonButton>
        </GlassPanel>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="admin-panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          style={{ width: '100%', maxWidth: adminSessionToken ? '950px' : '480px', transition: 'max-width 0.3s ease' }}
        >
          <GlassPanel style={{ padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Close Button */}
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-dim)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </motion.button>

            {/* Header */}
            {/* Header - Only show if NOT logged in (dashboard has its own header) */}
            {!adminSessionToken && (
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <Shield size={48} style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }} />
                <h2 style={{ margin: 0, color: 'var(--color-text)' }}>GroupGuard Admin</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </p>
              </div>
            )}

            {/* Content */}
            {adminSessionToken ? (
              // Logged In: Admin Dashboard
              <div className={dashStyles.adminContainer}>
                {/* Dashboard Header */}
                <div className={dashStyles.header}>
                  <div className={dashStyles.headerLeft}>
                    <Shield size={24} className={dashStyles.adminIcon} />
                    <div>
                      <h2 className={dashStyles.headerTitle}>GROUPGUARD // ADMIN CONSOLE</h2>
                      <p className={dashStyles.headerSubtitle}>v1.0.0 // ACCESS LEVEL: {adminUser?.role.toUpperCase() || 'UNKNOWN'}</p>
                    </div>
                  </div>
                  <div className={dashStyles.statusBadge}>
                    <div className={dashStyles.statusDot} />
                    SYSTEM ONLINE
                  </div>
                </div>

                {/* Stat Cards */}
                <div className={dashStyles.statsGrid}>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Total Users</div>
                    <div className={dashStyles.statValue}>1,247</div>
                    <Users size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Active Now</div>
                    <div className={dashStyles.statValue}>23</div>
                    <Activity size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Total Bans</div>
                    <div className={dashStyles.statValue}>89</div>
                    <Ban size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Uptime</div>
                    <div className={dashStyles.statValue}>7d 12h</div>
                    <Clock size={16} className={dashStyles.statIcon} />
                  </div>
                </div>

                {/* Main Content Panels */}
                <div className={dashStyles.panelsGrid}>
                  {/* Live Activity Feed */}
                  <div className={dashStyles.terminalPanel}>
                    <div className={dashStyles.terminalHeader}>
                      <div className={dashStyles.terminalDots}>
                        <div className={dashStyles.terminalDot} />
                        <div className={dashStyles.terminalDot} />
                        <div className={dashStyles.terminalDot} />
                      </div>
                      <div className={dashStyles.terminalTitle}>LIVE ACTIVITY</div>
                    </div>
                    <div className={dashStyles.terminalContent}>
                      <div className={dashStyles.activityItem}>
                        <span className={dashStyles.activityPrompt}>{'>'}</span>
                        <span className={dashStyles.activityText}>AppleExpl01t joined instance "Furry Talk"</span>
                      </div>
                      <div className={dashStyles.activityItem}>
                        <span className={dashStyles.activityPrompt}>{'>'}</span>
                        <span className={dashStyles.activityText}>AutoMod triggered: User "SuspiciousUser" (Trust Level)</span>
                      </div>
                      <div className={dashStyles.activityItem}>
                        <span className={dashStyles.activityPrompt}>{'>'}</span>
                        <span className={dashStyles.activityText}>Config updated by admin "AppleExpl01t"</span>
                      </div>
                      <div className={dashStyles.activityItem}>
                        <span className={dashStyles.activityPrompt}>{'>'}</span>
                        <span className={dashStyles.activityText}>Backup completed: 47 groups synced</span>
                      </div>
                      <div className={dashStyles.activityItem}>
                        <span className={dashStyles.activityPrompt}>{'>'}</span>
                        <span className={dashStyles.activityText}>
                          Listening for events<span className={dashStyles.cursor} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* System Logs */}
                  <div className={dashStyles.terminalPanel}>
                    <div className={dashStyles.terminalHeader}>
                      <div className={dashStyles.terminalDots}>
                        <div className={dashStyles.terminalDot} />
                        <div className={dashStyles.terminalDot} />
                        <div className={dashStyles.terminalDot} />
                      </div>
                      <div className={dashStyles.terminalTitle}>SYSTEM LOGS</div>
                    </div>
                    <div className={dashStyles.terminalContent}>
                      <div className={dashStyles.logEntry}>
                        <span className={dashStyles.logTime}>[04:52:12]</span>
                        <span className={`${dashStyles.logLevel} ${dashStyles.info}`}>INFO</span>
                        <span className={dashStyles.logMessage}>Backend server started on port 3001</span>
                      </div>
                      <div className={dashStyles.logEntry}>
                        <span className={dashStyles.logTime}>[04:52:10]</span>
                        <span className={`${dashStyles.logLevel} ${dashStyles.auth}`}>AUTH</span>
                        <span className={dashStyles.logMessage}>Admin login successful: AppleExpl01t</span>
                      </div>
                       <div className={dashStyles.logEntry}>
                        <span className={dashStyles.logTime}>[04:51:58]</span>
                        <span className={`${dashStyles.logLevel} ${dashStyles.warn}`}>WARN</span>
                        <span className={dashStyles.logMessage}>Rate limit triggered for IP x.x.x.x</span>
                      </div>
                       <div className={dashStyles.logEntry}>
                        <span className={dashStyles.logTime}>[04:51:45]</span>
                        <span className={`${dashStyles.logLevel} ${dashStyles.debug}`}>DEBUG</span>
                        <span className={dashStyles.logMessage}>Heartbeat sent to Discord RPC</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className={dashStyles.quickActions}>
                  <button className={dashStyles.actionButton}>
                    <Globe size={14} /> Global Config
                  </button>
                  <button onClick={() => setShowManageAdmins(true)} className={dashStyles.actionButton}>
                    <Users size={14} /> Manage Admins
                  </button>
                   <button className={dashStyles.actionButton}>
                    <Server size={14} /> Server Status
                  </button>
                </div>

                {/* Footer / Logout */}
                <div className={dashStyles.footer}>
                  <button onClick={handleLogout} className={dashStyles.footerButton}>
                    TERMINATE SESSION
                  </button>
                </div>
              </div>
            ) : mode === 'login' ? (
              // LOGIN FORM
              <form onSubmit={handleLogin}>
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(74, 222, 128, 0.1)',
                      border: '1px solid rgba(74, 222, 128, 0.3)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      color: '#4ade80',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <CheckCircle size={16} />
                    {success}
                  </motion.div>
                )}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      color: '#fca5a5',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertTriangle size={16} />
                    {error}
                  </motion.div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    autoComplete="username"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                    style={inputStyle}
                  />
                </div>

                <NeonButton type="submit" style={{ width: '100%' }} disabled={loading}>
                  {loading ? 'Please wait...' : (
                    <>
                      <LogIn size={16} style={{ marginRight: '0.5rem' }} />
                      Sign In
                    </>
                  )}
                </NeonButton>

                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '1rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Have an invite token? Register here
                </button>
              </form>
            ) : (
              // REGISTER FORM
              <form onSubmit={handleRegister}>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      color: '#fca5a5',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertTriangle size={16} />
                    {error}
                  </motion.div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Invite Token
                  </label>
                  <input
                    type="text"
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="Paste your invite token"
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Choose a username"
                    required
                    autoComplete="username"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Confirm Username
                  </label>
                  <input
                    type="text"
                    value={regUsernameConfirm}
                    onChange={(e) => setRegUsernameConfirm(e.target.value)}
                    placeholder="Re-enter username"
                    required
                    autoComplete="off"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Choose a password (min 8 chars)"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={regPasswordConfirm}
                    onChange={(e) => setRegPasswordConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    autoComplete="new-password"
                    style={inputStyle}
                  />
                </div>

                <NeonButton type="submit" style={{ width: '100%' }} disabled={loading}>
                  {loading ? 'Please wait...' : (
                    <>
                      <UserPlus size={16} style={{ marginRight: '0.5rem' }} />
                      Register
                    </>
                  )}
                </NeonButton>

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '1rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Already have an account? Sign in
                </button>
              </form>
            )}

            {/* I Shouldn't Be Here Button */}
            {!adminSessionToken && (
              <>
                <motion.button
                  onClick={handleIShouldntBeHere}
                  whileHover={{ opacity: 0.8 }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '2rem',
                    padding: '0.5rem',
                    background: 'none',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'var(--color-text-dim)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  I shouldn't be here (Hide Admin Access)
                </motion.button>
                
                {/* Backend Env Toggle */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                    <button 
                      onClick={handleEnvToggle}
                      title="Toggle Backend Environment"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: env === 'prod' ? '#ef4444' : '#22c55e',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.6rem',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        opacity: 0.5,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                    >
                      ENV: {env}
                    </button>
                </div>
              </>
            )}
          </GlassPanel>
        </motion.div>
      {/* Manage Admins Modal */}
      {showManageAdmins && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           style={{
             position: 'fixed',
             inset: 0,
             zIndex: 10000, // Above dashboard
             background: 'rgba(0, 0, 0, 0.8)',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
           }}
           onClick={() => setShowManageAdmins(false)}
        >
          <GlassPanel 
            style={{ width: '500px', padding: '2rem', border: '1px solid var(--color-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
             <h2 style={{ marginTop: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Users size={24} /> Manage Admins
             </h2>
             
             {adminUser?.role === 'owner' ? (
                <div style={{ marginTop: '1.5rem' }}>
                  <p style={{ color: 'var(--color-text)' }}>Admin Invitation</p>
                  
                  {generatedInvite ? (
                    <div style={{ background: 'rgba(74, 222, 128, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-primary)' }}>
                       <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }}>New Invite Token Generated:</div>
                       <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                         {generatedInvite}
                       </code>
                       <div style={{ display: 'flex', gap: '0.5rem' }}>
                         <NeonButton 
                           onClick={() => navigator.clipboard.writeText(generatedInvite)}
                           style={{ flex: 1, fontSize: '0.9rem' }}
                         >
                           Copy Token
                         </NeonButton>
                         <button 
                           onClick={() => setGeneratedInvite(null)}
                           style={{ padding: '0.5rem', background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                         >
                           Close
                         </button>
                       </div>
                       <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem' }}>
                         Give this token to a trusted user. It expires in 24 hours.
                       </p>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)', marginBottom: '1rem' }}>
                        Generate a secure invite token to register a new administrator.
                      </p>
                      <NeonButton 
                        onClick={async () => {
                           try {
                             setLoading(true);
                             const res = await fetch(`${BACKEND_URL}/admin/invite`, {
                               method: 'POST',
                               headers: { 
                                 'Content-Type': 'application/json',
                                 'Authorization': `Bearer ${adminSessionToken}`
                               }
                             });
                             const data = await res.json();
                             if (data.success) {
                               setGeneratedInvite(data.inviteToken);
                             } else {
                               alert('Failed: ' + (data.error?.message || data.error || 'Unknown error'));
                             }
                           } catch (error) {
                             console.error("Invite generation failed:", error);
                             alert('Connection failed');
                           } finally {
                             setLoading(false);
                           }
                        }}
                        disabled={loading}
                      >
                        {loading ? 'Generating...' : 'Generate New Invite Token'}
                      </NeonButton>
                    </div>
                  )}
                </div>
             ) : (
               <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-dim)' }}>
                 <AlertTriangle size={32} style={{ color: '#fb7185', marginBottom: '1rem' }} />
                 <p>Only the OWNER account can manage invites.</p>
               </div>
             )}
             
             <div style={{ marginTop: '2rem', textAlign: 'right' }}>
               <button 
                 onClick={() => setShowManageAdmins(false)}
                 style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
               >
                 Close
               </button>
             </div>
          </GlassPanel>
        </motion.div>
      )}
      </motion.div>
  );
};
