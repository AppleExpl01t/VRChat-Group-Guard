import React, { useEffect, useState, useMemo, useCallback, lazy, Suspense, startTransition } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { ConfirmationProvider } from './context/ConfirmationContext';
import { TitleBar } from './components/layout/TitleBar';
import { GlobalModals } from './components/layout/GlobalModals';
import { ToastContainer } from './components/ui/ToastContainer';
import { LoginView } from './features/auth/LoginView';
import { useAuthStore } from './stores/authStore';
import { useGroupStore } from './stores/groupStore';
import { AnimatePresence } from 'framer-motion';
import { NeonDock, type DockView } from './components/layout/NeonDock';
import { usePipelineInit } from './hooks/usePipelineInit';
import { useInstanceMonitorInit } from './hooks/useInstanceMonitorInit';
import { useAutoModNotifications } from './hooks/useAutoModNotifications';
import { SetupView } from './features/setup/SetupView';



import { PageTransition } from './components/layout/PageTransition';

// Lazy load heavy views for better performance
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));

const GroupSelectionView = lazy(() => import('./features/groups/GroupSelectionView').then(m => ({ default: m.GroupSelectionView })));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const DatabaseView = lazy(() => import('./features/database/DatabaseView').then(m => ({ default: m.DatabaseView })));
const AutoModView = lazy(() => import('./features/automod/AutoModView').then(m => ({ default: m.AutoModView })));
const LiveView = lazy(() => import('./features/live/LiveView').then(m => ({ default: m.LiveView })));
const AuditLogView = lazy(() => import('./features/audit/AuditLogView').then(m => ({ default: m.AuditLogView })));
const WatchlistView = lazy(() => import('./features/watchlist/WatchlistView').then(m => ({ default: m.WatchlistView })));
const InstanceGuardView = lazy(() => import('./features/instances/InstanceGuardView').then(m => ({ default: m.InstanceGuardView })));

import { ViewLoader } from './components/ui/ViewLoader';
import { AutoLoginLoadingScreen } from './features/auth/AutoLoginLoadingScreen';

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

  // Initialize AutoMod Notifications
  useAutoModNotifications();

  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

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
      }).catch(err => {
          console.error('Failed to check update status:', err);
      });

        const unsubscribe = window.electron.updater.onUpdateDownloaded(() => {
        setIsUpdateReady(true);
        setUpdateProgress(null); // Clear progress when ready
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unsubscribeProgress = window.electron.updater.onDownloadProgress((progressObj: any) => {
        setUpdateProgress(progressObj.percent);
      });
      
      return () => {
          unsubscribe();
          unsubscribeProgress();
      };
    }
  }, []);

  // Monitor Live Log state to toggle Live Mode UI
  // Note: This effect runs the live status check regardless of pipeline connection
  // because the log watcher operates independently of the VRChat API pipeline.
  // PERF FIX: Removed isLiveMode from deps to prevent re-subscription loops
  useEffect(() => {
    if (isRoamingMode) {
      // In roaming mode, always enable live mode
      // Deferred to avoid synchronous setState in effect body
      queueMicrotask(() => setIsLiveMode(true));
      return; // Don't set up listeners in roaming mode
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

    // 2. Listen for group changes
    let unsubscribeGroupChange: (() => void) | undefined;
    if (window.electron?.instance?.onGroupChanged) {
        unsubscribeGroupChange = window.electron.instance.onGroupChanged((groupId) => {
            if (!selectedGroup) {
                setIsLiveMode(false);
            } else {
                setIsLiveMode(groupId === selectedGroup.id);
            }
        });
    }

    // 3. Listen for game closed event
    let unsubscribeGameClosed: (() => void) | undefined;
    if (window.electron?.logWatcher?.onGameClosed) {
        unsubscribeGameClosed = window.electron.logWatcher.onGameClosed(() => {
            setIsLiveMode(false);
        });
    }

    return () => {
        unsubscribeGroupChange?.();
        unsubscribeGameClosed?.();
    };
  }, [selectedGroup, isRoamingMode]); // Removed isLiveMode - it was causing re-subscription loops

  // Redirect from Live view when Live mode ends (smooth transition)
  useEffect(() => {
    if (!isLiveMode && !isRoamingMode && currentView === 'live') {
      const t = setTimeout(() => {
        if (selectedGroup) {
          setCurrentView('main'); // Go to group dashboard
        } else {
          setCurrentView('main'); // Go to group selection
        }
      }, 100); // Small delay for smooth transition
      return () => clearTimeout(t);
    }
  }, [isLiveMode, isRoamingMode, currentView, selectedGroup]);

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
  // PERF FIX: Wrap in startTransition to keep UI responsive during navigation
  const handleViewChange = useCallback((view: DockView) => {
    // Exceptions for Live view in Roaming Mode
    if (view === 'live' && (isRoamingMode || selectedGroup)) {
        startTransition(() => setCurrentView('live'));
        return;
    }

    if ((view === 'moderation' || view === 'instances' || view === 'audit' || view === 'database' || view === 'live' || view === 'watchlist') && !selectedGroup) {
      // If trying to access group features without a group, go to group selection
      selectGroup(null);
      startTransition(() => setCurrentView('main'));
      return;
    }
    startTransition(() => setCurrentView(view));
  }, [selectedGroup, selectGroup, isRoamingMode]);

  // Memoize content to prevent re-renders during transitions
  const content = useMemo(() => {
    switch (currentView) {
      case 'settings':
        return <SettingsView />;
      case 'moderation':
        return <AutoModView />;
      case 'instances':
        return <InstanceGuardView />;
      case 'live':
        return <LiveView />;
      case 'audit':
        return <AuditLogView />;
      case 'watchlist':
        return <WatchlistView />;
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
        <ConfirmationProvider>
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
              updateProgress={updateProgress}
            />
          </AppLayout>
        </ConfirmationProvider>
      );
      screenKey = 'app-layout';
  }

  return (
    <>
        <ToastContainer />
        <AnimatePresence mode="wait">
            <PageTransition key={screenKey}>
                {currentScreen}
            </PageTransition>
        </AnimatePresence>
    </>
  );
}

export default App;
