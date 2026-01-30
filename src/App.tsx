import React, { useEffect, useState, useMemo, useCallback, lazy, Suspense, startTransition, useRef } from 'react';
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
import { useUpdateStore } from './stores/updateStore';
import { useNotificationStore } from './stores/notificationStore';
import { useAppViewStore } from './stores/appViewStore';
import { PageTransition } from './components/layout/PageTransition';
import { ViewLoader } from './components/ui/ViewLoader';
import { AutoLoginLoadingScreen } from './features/auth/AutoLoginLoadingScreen';

// Lazy load heavy views for better performance
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const GroupSelectorView = lazy(() => import('./features/groups/GroupSelectorView').then(m => ({ default: m.GroupSelectorView })));
const SettingsView = lazy(() => import('./features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const DatabaseView = lazy(() => import('./features/database/DatabaseView').then(m => ({ default: m.DatabaseView })));
const AutoModView = lazy(() => import('./features/automod/AutoModView').then(m => ({ default: m.AutoModView })));
const LiveView = lazy(() => import('./features/live/LiveView').then(m => ({ default: m.LiveView })));
const AuditLogView = lazy(() => import('./features/audit/AuditLogView').then(m => ({ default: m.AuditLogView })));
const WatchlistView = lazy(() => import('./features/watchlist/WatchlistView').then(m => ({ default: m.WatchlistView })));
const InstanceGuardView = lazy(() => import('./features/instances/InstanceGuardView').then(m => ({ default: m.InstanceGuardView })));
const FriendshipManagerView = lazy(() => import('./views/FriendshipManagerView').then(m => ({ default: m.FriendshipManagerView })));

function App() {
  const { isAuthenticated, autoLogin, status, logout } = useAuthStore();
  const { selectedGroup, selectGroup, isRoamingMode } = useGroupStore();
  const { currentView, setView: setCurrentView } = useAppViewStore();

  const [isCheckingAutoLogin, setIsCheckingAutoLogin] = useState(true);
  const [isStorageConfigured, setIsStorageConfigured] = useState<boolean | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false); // Track if VRC is running basically

  // Initialize Pipeline WebSocket connection and event subscriptions
  usePipelineInit();

  // Initialize Live Log Watcher
  useInstanceMonitorInit(isAuthenticated);

  // Initialize AutoMod Notifications
  useAutoModNotifications();

  // Update state management
  const {
    updateDownloaded,
    updateInfo,
    setUpdateAvailable,
    setUpdateDownloaded,
    setDownloadProgress
  } = useUpdateStore();

  const addNotification = useNotificationStore(state => state.addNotification);
  const notifications = useNotificationStore(state => state.notifications);

  // Track if we've already shown the update notification
  const updateNotificationShownRef = useRef(false);

  // Listen for updates
  useEffect(() => {
    if (!window.electron?.updater) return;

    // Check initial status (in case we missed the event)
    window.electron.updater.checkStatus().then(downloaded => {
      if (downloaded) {
        setUpdateDownloaded();
      }
    }).catch(err => {
      console.error('Failed to check update status:', err);
    });

    // Listen for update available event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribeAvailable = window.electron.updater.onUpdateAvailable((info: any) => {
      setUpdateAvailable({
        version: info.version || 'New Version',
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    });

    // Listen for download progress
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribeProgress = window.electron.updater.onDownloadProgress((progressObj: any) => {
      setDownloadProgress(progressObj.percent);
    });

    // Listen for update downloaded event
    const unsubscribeDownloaded = window.electron.updater.onUpdateDownloaded(() => {
      setUpdateDownloaded();
    });

    return () => {
      unsubscribeAvailable();
      unsubscribeProgress();
      unsubscribeDownloaded();
    };
  }, [setUpdateAvailable, setDownloadProgress, setUpdateDownloaded]);

  // Show persistent update notification when update is downloaded
  useEffect(() => {
    if (!updateDownloaded || updateNotificationShownRef.current) return;

    // Check if we already have an update notification
    const hasUpdateNotification = notifications.some(n => n.type === 'update');
    if (hasUpdateNotification) return;

    updateNotificationShownRef.current = true;

    addNotification({
      type: 'update',
      title: 'Update Ready',
      message: updateInfo?.version
        ? `Version ${updateInfo.version} is ready to install.`
        : 'A new version is ready to install.',
      persistent: true,
      action: {
        label: 'Restart & Update',
        onClick: () => window.electron.updater.quitAndInstall()
      }
    });
  }, [updateDownloaded, updateInfo, addNotification, notifications]);

  // Monitor Live Log state to toggle Live Mode UI
  useEffect(() => {
    if (isRoamingMode) {
      queueMicrotask(() => setIsLiveMode(true));
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
  }, [selectedGroup, isRoamingMode]);

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
  }, [isLiveMode, isRoamingMode, currentView, selectedGroup, setCurrentView]);

  // Check storage configuration first
  useEffect(() => {
    const checkStorage = async () => {
      try {
        const status = await window.electron.storage.getStatus();
        setIsStorageConfigured(status.configured);
      } catch (err) {
        console.error('Failed to check storage status:', err);
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

  // 1. Auto-switch to Live View when entering Roaming Mode
  // INTENTIONAL: We only listen to isRoamingMode changes to prevent hijacking navigation
  // when the user moves to Settings or other views.
  useEffect(() => {
    if (isRoamingMode && currentView === 'main') {
      const t = setTimeout(() => setCurrentView('live'), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoamingMode, setCurrentView]); // Exclude currentView to prevent re-running on nav

  // 2. Safety Guard: Kick out of Live view if not allowed
  useEffect(() => {
    if (currentView === 'live' && !selectedGroup && !isRoamingMode) {
      const t = setTimeout(() => setCurrentView('main'), 0);
      return () => clearTimeout(t);
    }
  }, [currentView, selectedGroup, isRoamingMode, setCurrentView]);

  // Handle View Switching - memoized to prevent re-renders
  const handleViewChange = useCallback((view: DockView) => {
    if (view === 'live' && (isRoamingMode || selectedGroup)) {
      startTransition(() => setCurrentView('live'));
      return;
    }

    if ((view === 'moderation' || view === 'instances' || view === 'audit' || view === 'database' || view === 'live' || view === 'watchlist') && !selectedGroup && !isRoamingMode) {
      selectGroup(null);
      startTransition(() => setCurrentView('main'));
      return;
    }
    startTransition(() => setCurrentView(view));
  }, [selectedGroup, selectGroup, isRoamingMode, setCurrentView]);

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
      case 'friendship':  // New Friendship Manager View
        return <FriendshipManagerView />;

      case 'main':
      default:
        return selectedGroup ? <DashboardView /> : <GroupSelectorView />;
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
