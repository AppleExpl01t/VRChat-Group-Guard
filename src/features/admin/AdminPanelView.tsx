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
  WebkitAppRegion: 'no-drag', // Crucial for Electron inputs
} as React.CSSProperties;

// Type for user management
interface AdminUser {
  id: number;
  username: string;
  role: 'owner' | 'admin';
  hwid: string | null;
}

interface Invite {
  token: string;
  created_by: string;
  is_used: number;
  expires_at: string;
}

interface HWIDRecord { hwid: string; last_seen: string; }
interface IPRecord { ip_address: string; last_seen: string; }
interface AliasRecord { username: string; first_seen: string; }

interface TrackedUser {
  vrc_userid: string;
  current_username?: string;
  tos_version?: string;
  last_seen: string;
  first_seen: string;
  hwids?: HWIDRecord[];
  ips?: IPRecord[];
  aliases?: AliasRecord[];
}


// Inline Confirm Button Component
const ConfirmButton: React.FC<{
  onClick: () => void;
  label: string;
  confirmLabel?: string;
  style?: React.CSSProperties;
  className?: string;
}> = ({ onClick, label, confirmLabel = 'Confirm?', style, className }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = () => {
    if (isConfirming) {
      onClick();
      setIsConfirming(false);
      if (timer) clearTimeout(timer);
    } else {
      setIsConfirming(true);
      const t = setTimeout(() => setIsConfirming(false), 3000);
      setTimer(t);
    }
  };

  React.useEffect(() => {
    return () => { if (timer) clearTimeout(timer); };
  }, [timer]);

  return (
    <button
      onClick={handleClick}
      className={className}
      style={{
        ...style,
        background: isConfirming ? '#fbbf24' : style?.background, // Amber warning color
        color: isConfirming ? '#000' : style?.color,
        fontWeight: isConfirming ? 'bold' : 'normal',
        transition: 'all 0.2s',
        minWidth: '80px',
        textAlign: 'center',
        border: isConfirming ? '1px solid #d97706' : style?.border
      }}
      title={isConfirming ? "Click again to confirm" : undefined}
    >
      {isConfirming ? confirmLabel : label}
    </button>
  );
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
  const [showUserAnalytics, setShowUserAnalytics] = useState(false); // New state
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [env] = useState<BackendEnv>(getBackendEnv());
  const [hwid, setHwid] = useState<string>('browser-dev-mode');
  const [users, setUsers] = useState<AdminUser[]>([]); // List of admins for management
  const [invites, setInvites] = useState<Invite[]>([]); // List of pending invites
  
  // Analytics State
  const [analyticsStats, setAnalyticsStats] = useState({ online: 0, total: 0, daily: 0 });
  const [trackedUsers, setTrackedUsers] = useState<TrackedUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedTrackedUser, setSelectedTrackedUser] = useState<TrackedUser | null>(null);
  
  // Local status for Manage Admins modal
  const [manageStatus, setManageStatus] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Fetch HWID on mount
  React.useEffect(() => {
    if (window.electron?.getHWID) {
      window.electron.getHWID().then(id => {
        console.log('[AdminPanel] HWID fetched:', id);
        setHwid(id);
      }).catch(err => console.error('Failed to get HWID:', err));
    }
  }, []);

  const handleEnvToggle = () => {
    const newEnv = env === 'local' ? 'prod' : 'local';
    setBackendEnv(newEnv); // Reloads app
  };

  // Helper for auth headers
  const getHeaders = React.useCallback((token?: string | null) => {
    const headers: Record<string, string> = { 
      'Content-Type': 'application/json',
      'x-admin-hwid': hwid
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [hwid]);

  // Auto-fetch profile if logged in but user data missing
  React.useEffect(() => {
    if (adminSessionToken && !adminUser) {
      console.log('Fetching admin profile...');
      fetch(`${BACKEND_URL}/admin/me`, {
        headers: getHeaders(adminSessionToken)
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
  }, [adminSessionToken, adminUser, setAdminSession, getHeaders]);

  // Fetch users when Manage Admins modal opens
  React.useEffect(() => {
    if (showManageAdmins && adminUser?.role === 'owner' && adminSessionToken) {
      fetch(`${BACKEND_URL}/admin/users`, {
        headers: getHeaders(adminSessionToken)
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUsers(data.data);
        }
      })
      .catch(console.error);
    }
  }, [showManageAdmins, adminUser, adminSessionToken, getHeaders]);



  // Fetch Analytics Stats on Dashboard Load (Polled)
  React.useEffect(() => {
    if (adminSessionToken && !showManageAdmins && !showUserAnalytics) {
       const fetchStats = () => {
         fetch(`${BACKEND_URL}/track/stats`, { headers: getHeaders(adminSessionToken) })
           .then(res => res.json())
           .then(data => {
             if (data.success) setAnalyticsStats(data.data);
           })
           .catch(console.error);
       };
       fetchStats();
       const interval = setInterval(fetchStats, 10000); // Poll every 10s
       return () => clearInterval(interval);
    }
  }, [adminSessionToken, getHeaders, showManageAdmins, showUserAnalytics]);

  // Fetch Tracked Users when Analytics Panel opens
  React.useEffect(() => {
    if (showUserAnalytics && adminSessionToken) {
       const searchTerm = userSearchQuery || '';
       fetch(`${BACKEND_URL}/track/users?q=${encodeURIComponent(searchTerm)}`, { 
         headers: getHeaders(adminSessionToken) 
       })
         .then(res => res.json())
         .then(data => {
           if (data.success) setTrackedUsers(data.data);
         })
         .catch(console.error);
    }
  }, [showUserAnalytics, userSearchQuery, adminSessionToken, getHeaders]);

  // Fetch User Details
  const handleViewUserDetails = (userId: string) => {
    fetch(`${BACKEND_URL}/track/users/${userId}`, { headers: getHeaders(adminSessionToken) })
      .then(res => res.json())
      .then(data => {
        if (data.success) setSelectedTrackedUser(data.data);
      })
      .catch(console.error);
  };

  const handleResetHwid = async (userId: number, username: string) => {
    // Confirm handled by button state now
    try {
      setManageStatus(null);
      const res = await fetch(`${BACKEND_URL}/admin/users/${userId}/reset-hwid`, {
        method: 'POST',
        headers: getHeaders(adminSessionToken)
      });
      const data = await res.json();
      if (data.success) {
        setManageStatus({ msg: `HWID Reset for ${username}`, type: 'success' });
        // Refresh list
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, hwid: null } : u));
      } else {
        setManageStatus({ msg: 'Failed: ' + (data.error || 'Unknown error'), type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setManageStatus({ msg: 'Connection failed', type: 'error' });
    }
  };

  const handleRevokeUser = async (userId: number, username: string) => {
    // Confirm handled by button state now
    try {
      setManageStatus(null);
      const res = await fetch(`${BACKEND_URL}/admin/users/${userId}/revoke`, {
        method: 'POST',
        headers: getHeaders(adminSessionToken)
      });
      const data = await res.json();
      if (data.success) {
        setManageStatus({ msg: `Revoked access for ${username}`, type: 'success' });
        // Remove from list
        setUsers(prev => prev.filter(u => u.id !== userId));
      } else {
        setManageStatus({ msg: 'Failed: ' + (data.error || 'Unknown error'), type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setManageStatus({ msg: 'Connection failed', type: 'error' });
    }
  };

  const handleRevokeInvite = async (token: string) => {
    // Confirm handled by button now
    try {
      setManageStatus(null);
      const res = await fetch(`${BACKEND_URL}/admin/invites/${token}/revoke`, {
        method: 'POST',
        headers: getHeaders(adminSessionToken)
      });
      const data = await res.json();
      if (data.success) {
        setManageStatus({ msg: 'Invite cancelled', type: 'success' });
        setInvites(prev => prev.filter(i => i.token !== token));
      } else {
        setManageStatus({ msg: 'Failed: ' + (data.error || 'Unknown error'), type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setManageStatus({ msg: 'Connection failed', type: 'error' });
    }
  };

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
        headers: getHeaders(),
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
        headers: getHeaders(),
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      </div>
    );
  }

  // Analytics Panel (Full Screen Overlay for now)
  if (showUserAnalytics) {
     return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#020617' }}>
         {/* Simple Header */}
         <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Shield className="text-emerald-500" />
              <h2 className="text-white font-bold text-xl">User Analytics Database</h2>
              <span className="text-slate-500 text-sm">{trackedUsers.length} results</span>
            </div>
            <button 
              onClick={() => { setShowUserAnalytics(false); setSelectedTrackedUser(null); }}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
            >
              <X />
            </button>
         </div>

         <div style={{ display: 'flex', height: 'calc(100vh - 65px)' }}>
            {/* Left: Search & List */}
            <div style={{ width: '400px', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
               <div style={{ padding: '1rem' }}>
                  <input 
                    type="text" 
                    placeholder="Search Username or ID..." 
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    style={{ ...inputStyle, background: '#0f172a', borderColor: '#334155' }}
                  />
               </div>
               <div className="flex-1 overflow-y-auto">
                  {trackedUsers.map(user => (
                    <div 
                      key={user.vrc_userid}
                      onClick={() => handleViewUserDetails(user.vrc_userid)}
                      className={`p-4 border-b border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors ${selectedTrackedUser?.vrc_userid === user.vrc_userid ? 'bg-slate-900 border-l-4 border-emerald-500' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                         <span className="text-white font-medium">{user.current_username || 'Unknown'}</span>
                         {user.tos_version && <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-900">v{user.tos_version}</span>}
                      </div>
                      <div className="text-xs text-slate-500 font-mono text-ellipsis overflow-hidden">{user.vrc_userid}</div>
                      <div className="text-xs text-slate-600 mt-2 flex justify-between">
                        <span>Seen: {new Date(user.last_seen).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Right: Detail View */}
            <div className="flex-1 overflow-y-auto bg-slate-950 p-8">
               {selectedTrackedUser ? (
                 <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
                       <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-emerald-900/20">
                          {selectedTrackedUser.current_username?.[0] || '?'}
                       </div>
                       <div>
                          <h1 className="text-3xl font-bold text-white mb-1">{selectedTrackedUser.current_username}</h1>
                          <div className="flex items-center gap-3 text-slate-400 font-mono text-sm">
                             <span>{selectedTrackedUser.vrc_userid}</span>
                             <span className="w-1 h-1 bg-slate-600 rounded-full" />
                             <span>First Seen: {new Date(selectedTrackedUser.first_seen).toLocaleDateString()}</span>
                          </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                       <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                          <h3 className="text-slate-400 text-sm font-bold uppercase mb-4 tracking-wider">Hardware Identity</h3>
                          <div className="space-y-3">
                             {selectedTrackedUser.hwids?.map((h, i) => (
                               <div key={i} className="flex justify-between items-center text-sm font-mono border-b border-slate-800/50 pb-2 last:border-0">
                                  <span className="text-emerald-400">{h.hwid}</span>
                                  <span className="text-slate-600">{new Date(h.last_seen).toLocaleDateString()}</span>
                                </div>
                             ))}
                          </div>
                       </div>

                       <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                          <h3 className="text-slate-400 text-sm font-bold uppercase mb-4 tracking-wider">Known IP Addresses</h3>
                          <div className="space-y-3">
                             {selectedTrackedUser.ips?.map((ip, i) => (
                               <div key={i} className="flex justify-between items-center text-sm font-mono border-b border-slate-800/50 pb-2 last:border-0">
                                  <span className="text-blue-400">{ip.ip_address}</span>
                                  <span className="text-slate-600">{new Date(ip.last_seen).toLocaleDateString()}</span>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>

                    <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                       <h3 className="text-slate-400 text-sm font-bold uppercase mb-4 tracking-wider">Username History</h3>
                       <div className="flex flex-wrap gap-2">
                          {selectedTrackedUser.aliases?.map((a, i) => (
                            <span key={i} className="px-3 py-1 bg-slate-800 rounded text-sm text-slate-300 border border-slate-700">
                              {a.username}
                            </span>
                          ))}
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Users size={64} className="mb-4 opacity-50" />
                    <p className="text-lg">Select a user to view detailed dossiers</p>
                 </div>
               )}
            </div>
         </div>
      </div>
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
                    <div className={dashStyles.statValue}>{analyticsStats.total.toLocaleString()}</div>
                    <Users size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Active Now</div>
                    <div className={dashStyles.statValue} style={{ color: '#4ade80' }}>
                      {analyticsStats.online}
                    </div>
                    <Activity size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>24h Active</div>
                    <div className={dashStyles.statValue}>{analyticsStats.daily.toLocaleString()}</div>
                    <Ban size={16} className={dashStyles.statIcon} />
                  </div>
                  <div className={dashStyles.statCard}>
                    <div className={dashStyles.statLabel}>Uptime</div>
                    <div className={dashStyles.statValue}>99.9%</div>
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
                  <button onClick={() => setShowUserAnalytics(true)} className={dashStyles.actionButton}>
                    <Globe size={14} /> User Analytics
                  </button>
                  <button onClick={() => setShowManageAdmins(true)} className={dashStyles.actionButton}>
                    <Users size={14} /> Manage Admins
                  </button>
                   <button className={dashStyles.actionButton}>
                    <Server size={14} /> Server Status
                  </button>
                </div>

                {/* Footer / Logout */}
                <div className={dashStyles.footer} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                  <button onClick={handleLogout} className={dashStyles.footerButton}>
                    TERMINATE SESSION
                  </button>
                  <button 
                    onClick={handleEnvToggle}
                    title="Toggle Backend Environment"
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: env === 'prod' ? '#ef4444' : '#22c55e',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
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
                               headers: getHeaders(adminSessionToken)
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

                  {/* User List */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <h3 style={{ color: 'var(--color-text)', fontSize: '1rem', marginBottom: '1rem' }}>Active Administrators</h3>
                    
                    {manageStatus && (
                         <div style={{
                           marginBottom: '1rem',
                           padding: '0.5rem',
                           borderRadius: '4px',
                           background: manageStatus.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                           color: manageStatus.type === 'success' ? '#4ade80' : '#f87171',
                           fontSize: '0.8rem',
                           textAlign: 'center'
                         }}>
                           {manageStatus.msg}
                         </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {users.map(user => (
                      <div key={user.id} style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        padding: '0.75rem', 
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid rgba(255,255,255,0.05)',
                        marginBottom: '0.5rem'
                      }}>
                        <div>
                          <div style={{ color: 'var(--color-text)', fontWeight: 'bold' }}>
                            {user.username} 
                            {user.id === adminUser?.id && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginLeft: '0.5rem' }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                            Role: {user.role} | HWID: {user.hwid ? 'BOUND' : 'UNBOUND'}
                          </div>
                        </div>
                        
                        {/* Actions (Only for other users or if forced) */}
                        {user.id !== adminUser?.id && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <ConfirmButton 
                              onClick={() => handleResetHwid(user.id, user.username)}
                              label="Reset Device"
                              style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            />
                            <ConfirmButton
                              onClick={() => handleRevokeUser(user.id, user.username)}
                              label="Revoke Access"
                              confirmLabel="Confirm Delete?"
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {users.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontStyle: 'italic', padding: '1rem' }}>
                        No users found
                      </div>
                    )}

                    {/* Pending Invites Section */}
                    {invites.length > 0 && (
                      <>
                        <div style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.1)', 
                          marginTop: '2rem', 
                          marginBottom: '1rem',
                          paddingBottom: '0.5rem',
                          color: 'var(--color-text-dim)',
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>
                          Pending Invites
                        </div>
                        
                        {invites.map(invite => (
                          <div key={invite.token} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '8px',
                            marginBottom: '0.5rem'
                          }}>
                            <div>
                                <div style={{ fontFamily: 'monospace', color: '#fbbf24', fontSize: '0.9rem' }}>
                                  {invite.token.substring(0, 18)}...
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                  Created by: <span style={{ color: 'var(--color-text)' }}>{invite.created_by}</span>
                                </div>
                            </div>
                            <ConfirmButton
                                onClick={() => handleRevokeInvite(invite.token)}
                                label="Cancel"
                                confirmLabel="Sure?"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#ef4444',
                                  padding: '0.4rem 0.8rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                            />
                          </div>
                        ))}
                      </>
                    )}
                    </div>
                  </div>

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
