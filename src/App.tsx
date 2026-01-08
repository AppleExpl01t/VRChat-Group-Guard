import React, { useEffect, useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { TitleBar } from './components/layout/TitleBar';
import { GlobalModals } from './components/layout/GlobalModals';
import { LoginView } from './features/auth/LoginView';
import { useAuthStore } from './stores/authStore';
import { useGroupStore } from './stores/groupStore';
import { GlassPanel } from './components/ui/GlassPanel';
import { motion } from 'framer-motion';
import { NeonDock, type DockView } from './components/layout/NeonDock';
import { usePipelineInit } from './hooks/usePipelineInit';
import { useInstanceMonitorInit } from './hooks/useInstanceMonitorInit';
import { SetupView } from './features/setup/SetupView';

import { AnimatePresence } from 'framer-motion';
import { PageTransition } from './components/layout/PageTransition';

// Lazy load heavy views for better performance
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));

const GroupSelectionView = lazy(() => import('./features/groups/GroupSelectionView').then(m => ({ default: m.GroupSelectionView })));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const DatabaseView = lazy(() => import('./features/database/DatabaseView').then(m => ({ default: m.DatabaseView })));
const AutoModView = lazy(() => import('./features/automod/AutoModView').then(m => ({ default: m.AutoModView })));
const LiveView = lazy(() => import('./features/live/LiveView').then(m => ({ default: m.LiveView })));

// Simple loading fallback
const ViewLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '200px' }}>
    <div style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Loading screen component for auto-login
const AutoLoginLoadingScreen: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    background: 'radial-gradient(circle at center, hsla(var(--primary-hue), 50%, 10%, 0.4) 0%, var(--color-bg-app) 100%)'
  }}>
    <GlassPanel style={{ 
      width: '400px', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1.5rem',
      alignItems: 'center',
      padding: '3rem'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', color: 'var(--color-primary)', letterSpacing: '0.2em', fontWeight: 600, marginBottom: '-0.3rem' }}>VRCHAT</div>
        <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
          GROUP GUARD
        </h1>
      </div>
      
      {/* Animated loading spinner */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--color-primary)',
        }}
      />
      
      <p style={{ color: 'var(--color-text-dim)', textAlign: 'center' }}>
        Signing you in automatically...
      </p>
    </GlassPanel>
  </div>
);

function App() {
  const { isAuthenticated, autoLogin, status, logout } = useAuthStore();
  const { selectedGroup, selectGroup, isRoamingMode } = useGroupStore();
  const [isCheckingAutoLogin, setIsCheckingAutoLogin] = useState(true);
  const [isStorageConfigured, setIsStorageConfigured] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<DockView>('main');
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false); // Track if VRC is running basically

  // Initialize Pipeline WebSocket connection and event subscriptions
  usePipelineInit();
  
  // Initialize Live Log Watcher
  useInstanceMonitorInit(isAuthenticated);

  const [isUpdateReady, setIsUpdateReady] = useState(false);

  // Listen for updates
  useEffect(() => {
    // Return unsubscribe function
    // Listen for updates if updater API is available
    if (window.electron?.updater) {
      // Check initial status (in case we missed the event)
      window.electron.updater.checkStatus().then(downloaded => {
          if (downloaded) {
              setIsUpdateReady(true);
          }
      });

      const unsubscribe = window.electron.updater.onUpdateDownloaded(() => {
        setIsUpdateReady(true);
      });
      return unsubscribe;
    }
  }, []);

  // Monitor Live Log state to toggle Live Mode UI
  useEffect(() => {
    if (isRoamingMode) {
      if (!isLiveMode) {
         const t = setTimeout(() => setIsLiveMode(true), 0);
         return () => clearTimeout(t);
      }
      return;
    }

    // 1. Initial check
    const checkStatus = async () => {
        if (!selectedGroup) {
            setIsLiveMode(false);
            return;
        }
        
        try {
            const currentInstanceGroupId = await window.electron.instance.getCurrentGroup();
            setIsLiveMode(currentInstanceGroupId === selectedGroup.id);
        } catch (e) {
            console.error("Failed to check live status:", e);
        }
    };
    checkStatus();

    // 2. Listen for changes
    if (!window.electron?.instance?.onGroupChanged) return;

    const unsubscribe = window.electron.instance.onGroupChanged((groupId) => {
        if (!selectedGroup) {
            setIsLiveMode(false);
        } else {
            setIsLiveMode(groupId === selectedGroup.id);
        }
    });

    return () => {
        unsubscribe();
    };
  }, [selectedGroup, isRoamingMode, isLiveMode]);

  // Check storage configuration first
  useEffect(() => {
    const checkStorage = async () => {
      try {
        const status = await window.electron.storage.getStatus();
        setIsStorageConfigured(status.configured);
      } catch (err) {
        console.error('Failed to check storage status:', err);
        // Fallback to true to avoid blocking app if something weird happens, 
        // though this ideally shouldn't happen with the new service.
        setIsStorageConfigured(true); 
      }
    };
    checkStorage();
  }, []);

  // Attempt auto-login only after storage is confirmed
  useEffect(() => {
    if (isStorageConfigured === false || isStorageConfigured === null) {
        return;
    }

    const attemptAutoLogin = async () => {
      setIsCheckingAutoLogin(true);
      try {
        // Check if we have saved credentials and attempt auto-login
        const hasSaved = await window.electron.hasSavedCredentials();
        if (hasSaved) {
          await autoLogin();
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      }
      setIsCheckingAutoLogin(false);
    };
    
    attemptAutoLogin();
  }, [autoLogin, isStorageConfigured]);

  // Auto-switch to Live View when entering Roaming Mode
  useEffect(() => {
    if (isRoamingMode) {
      if (currentView !== 'live') {
        const t = setTimeout(() => setCurrentView('live'), 0);
        return () => clearTimeout(t);
      }
    } else if (currentView === 'live' && !selectedGroup) {
        // If we exited roaming mode and have no group, go back to main
        // Use setTimeout to avoid synchronous setState within effect
        const t = setTimeout(() => setCurrentView('main'), 0);
        return () => clearTimeout(t);
    }
  }, [isRoamingMode, selectedGroup, currentView]);

  // Handle View Switching - memoized to prevent re-renders
  const handleViewChange = useCallback((view: DockView) => {
    // Exceptions for Live view in Roaming Mode
    if (view === 'live' && (isRoamingMode || selectedGroup)) {
        setCurrentView('live');
        return;
    }

    if ((view === 'moderation' || view === 'audit' || view === 'database' || view === 'live') && !selectedGroup) {
      // If trying to access group features without a group, go to group selection
      selectGroup(null);
      setCurrentView('main');
      return;
    }
    setCurrentView(view);
  }, [selectedGroup, selectGroup, isRoamingMode]);

  // Memoize content to prevent re-renders during transitions
  const content = useMemo(() => {
    switch (currentView) {
      case 'settings':
        return <SettingsView />;
      case 'moderation':
        return <AutoModView />;
      case 'live':
        return <LiveView />;
      case 'audit':
        return (
            <GlassPanel style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Audit Logs</h2>
                <p style={{ color: 'var(--color-text-dim)' }}>Coming Soon</p>
            </GlassPanel>
        );
      case 'database':
        return <DatabaseView />;
      case 'main':
      default:
        return selectedGroup ? <DashboardView /> : <GroupSelectionView />;
    }
  }, [currentView, selectedGroup]);

  // --- Unified Render Logic for Epic Transitions ---
  let currentScreen: React.ReactNode;
  let screenKey: string;

  if (isStorageConfigured === null) {
      currentScreen = <AutoLoginLoadingScreen />;
      screenKey = 'loading-storage';
  } else if (isStorageConfigured === false) {
      currentScreen = <SetupView onComplete={() => setIsStorageConfigured(true)} />;
      screenKey = 'setup';
  } else if ((isCheckingAutoLogin && status === 'logging-in')) {
      currentScreen = <AutoLoginLoadingScreen />;
      screenKey = 'loading-autologin';
  } else if (!isAuthenticated) {
      currentScreen = <LoginView />;
      screenKey = 'login';
  } else {
      // Main Authenticated App
      currentScreen = (
        <AppLayout>
          <TitleBar 
            onSettingsClick={() => setCurrentView('settings')}
            onLogoutClick={() => setIsLogoutConfirmOpen(true)}
          />

          {/* Main Content Render - Epic Transition */}
          <AnimatePresence mode="wait">
            <PageTransition key={currentView + (selectedGroup ? selectedGroup.id : 'home')}>
              <Suspense fallback={<ViewLoader />}>
                {content}
              </Suspense>
            </PageTransition>
          </AnimatePresence>

          {/* Neon Dock Navigation */}
          <NeonDock 
            currentView={currentView}
            onViewChange={handleViewChange}
            selectedGroup={selectedGroup}
            onGroupClick={() => {
                selectGroup(null);
                setCurrentView('main');
            }}
            isLiveMode={isLiveMode}
          />
          
          <GlobalModals 
            isLogoutConfirmOpen={isLogoutConfirmOpen}
            setIsLogoutConfirmOpen={setIsLogoutConfirmOpen}
            onLogoutConfirm={() => {
                logout(false);
                setIsLogoutConfirmOpen(false);
            }}
            isUpdateReady={isUpdateReady}
          />
        </AppLayout>
      );
      screenKey = 'app-layout';
  }

  return (
    <AnimatePresence mode="wait">
        <PageTransition key={screenKey}>
            {currentScreen}
        </PageTransition>
    </AnimatePresence>
  );
}

export default App;
