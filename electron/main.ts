import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs'; // Added for log rotation
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
const logger = log.scope('App');

// ========================================
// LOGGING & ERROR HANDLING
// ========================================

// LOG ROTATION LOGIC (Must run before log.initialize)
try {
  const userDataPath = app.getPath('userData');
  const logDir = path.join(userDataPath, 'logs');
  const logFile = path.join(logDir, 'latest.log');

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Rotate existing latest.log
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    const date = stats.mtime; // Use modification time (when the last session ended)

    // Format: YYYY-MM-DD_HH-mm-ss
    const timestamp = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0') + '_' +
      String(date.getHours()).padStart(2, '0') + '-' +
      String(date.getMinutes()).padStart(2, '0') + '-' +
      String(date.getSeconds()).padStart(2, '0');

    const archiveName = `log_${timestamp}.txt`;
    const archivePath = path.join(logDir, archiveName);

    fs.renameSync(logFile, archivePath);
    console.log(`[Startup] Archived previous log to ${archiveName}`);
  }
} catch (err) {
  console.error('[Startup] Failed to rotate logs:', err);
}

// Configure logging for production
// Force electron-log to use our specific path and filename
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/latest.log');
log.transports.file.fileName = 'latest.log';
log.transports.file.archiveLogFn = (oldLogFile) => {
  // Disable built-in rotation since we handle it manually on startup
  // This empty function prevents electron-log from renaming 'latest.log'
};

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'info' : 'warn';

logger.info('========================================');
logger.info(`VRChat Group Guard v${app.getVersion()} starting...`);
logger.info(`Electron: ${process.versions.electron}`);
logger.info(`Chrome: ${process.versions.chrome}`);
logger.info(`Node: ${process.versions.node}`);
logger.info(`Platform: ${process.platform} ${process.arch}`);
logger.info('========================================');

// Catch unhandled exceptions
// Catch unhandled exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);

  // Specific mitigation for the "verified:false" VRChat API error
  // This seems to be a non-fatal API response bubbling up as an error
  if (error.message && error.message.includes('"verified":false')) {
    logger.warn('Ignored "verified:false" error to prevent crash.');
    return;
  }

  dialog.showErrorBox('Critical Error', `An unexpected error occurred:\n\n${error.message}\n\nThe application will attempt to continue, but you may need to restart if features break.`);
  // app.quit(); // Don't quit, let the user decide or try to recover
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ========================================
// WINDOW MANAGEMENT
// ========================================

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  const windowConfig = {
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 800,
    frame: false, // Custom UI requires frameless
    backgroundColor: '#030014', // Match app background to avoid white flash
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for some native modules
      webSecurity: true, // Enable web security in production
      allowRunningInsecureContent: false,
    },
    title: 'VRChat Group Guard',
    titleBarStyle: 'hidden' as const,
    show: false, // Don't show until ready
  };

  mainWindow = new BrowserWindow(windowConfig);

  // Toggle DevTools with Ctrl+D
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'd' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Show window when ready to avoid flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links securely - only allow https
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    } else {
      logger.warn(`Blocked non-https external URL: ${url}`);
    }
    return { action: 'deny' };
  });

  // Prevent navigation to external URLs within the app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:5173' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      logger.warn(`Blocked navigation to external URL: ${navigationUrl}`);
    }
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    logger.info('Loading development server at http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    logger.info('Loading production build');
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// ========================================
// IPC HANDLERS
// ========================================

// IPC Logging Bridge
ipcMain.on('log', (_event, level, message) => {
  const validLevels = ['info', 'warn', 'error', 'debug'];
  if (validLevels.includes(level) && typeof log[level as keyof typeof log] === 'function') {
    (log[level as keyof typeof log] as (message: string) => void)(message);
  }
});

// Initialize Services
import { setupAuthHandlers } from './services/AuthService';
import { setupGroupHandlers } from './services/GroupService';
import { setupUserHandlers } from './services/UserService';
import { setupCredentialsHandlers } from './services/CredentialsService';
import { setupPipelineHandlers } from './services/PipelineService';
import { setupLogWatcherHandlers, logWatcherService } from './services/LogWatcherService';
import { startAutoModService } from './services/AutoModService';
import { setupAutoModHandlers } from './controllers/AutoModController';
import { setupStaffHandlers } from './services/StaffService';
import { setupInstanceHandlers } from './services/InstanceService';
import { setupOscHandlers, oscService } from './services/OscService';
import { setupOscAnnouncementHandlers } from './services/OscAnnouncementService';
import { setupDiscordWebhookHandlers } from './services/DiscordWebhookService';
import { setupReportHandlers } from './services/ReportService';
import { setupUserProfileHandlers } from './services/UserProfileService';
import { setupBulkFriendHandlers } from './services/BulkFriendService';
import { setupFriendshipHandlers } from './services/FriendshipIpc';

// ...
import { processService } from './services/ProcessService';

// Process Service API (Debug/Status)
ipcMain.handle('process:get-status', async () => {
  return {
    running: processService.isRunning
  };
});


import { storageService } from './services/StorageService';
import { discordBroadcastService } from './services/DiscordBroadcastService';
import { databaseService } from './services/DatabaseService';

// Storage API
ipcMain.handle('storage:get-status', () => {
  return {
    configured: storageService.isConfigured(),
    path: storageService.getDataDir(),
    defaultPath: storageService.getUnconfiguredDefaultPath(),
    lastPath: storageService.getLastConfiguredPath()
  };
});

ipcMain.handle('storage:select-folder', () => {
  return storageService.selectDirectory(mainWindow!);
});

ipcMain.handle('storage:set-path', (_event, path) => {
  return storageService.setLocation(path);
});

ipcMain.handle('storage:reconfigure', () => {
  return storageService.reconfigure();
});

// Initialize storage service
storageService.initialize();

discordBroadcastService.connect().catch(err => logger.error('Failed to connect Discord RPC:', err));


databaseService.initialize().catch(err => {
  logger.error('Failed to initialize database:', err);
});

import { watchlistService } from './services/WatchlistService';
watchlistService.initialize();

// Setup handlers
import { serviceEventBus } from './services/ServiceEventBus';

// Forward Service Events to Renderer
serviceEventBus.on('friend-update', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('friendship:update', data);
  }
});
setupAuthHandlers();
setupGroupHandlers();
setupUserHandlers();
setupCredentialsHandlers();
setupPipelineHandlers();
setupLogWatcherHandlers();
logWatcherService.start(); // Start robust watching immediately
setupAutoModHandlers();
setupStaffHandlers();
startAutoModService(); // Start the periodic join request processing loop

setupInstanceHandlers();
setupOscHandlers();
oscService.start();
setupOscAnnouncementHandlers();
setupDiscordWebhookHandlers();
setupReportHandlers();
setupUserProfileHandlers();
setupBulkFriendHandlers();
setupFriendshipHandlers();

import { settingsService, AppSettings } from './services/SettingsService';
settingsService.initialize();

ipcMain.handle('settings:get', () => {
  return settingsService.getSettings();
});

ipcMain.handle('settings:update', (_event, settings: Partial<AppSettings>) => {
  return settingsService.updateSettings(settings);
});

ipcMain.handle('settings:select-audio', () => {
  return settingsService.selectAudioFile(mainWindow!);
});

ipcMain.handle('settings:get-audio', (_event, path: string) => {
  return settingsService.getAudioData(path);
});

// Import to initialize (singleton)
import './services/InstanceLoggerService';

// Window Controls Handlers
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

// ========================================
// APP LIFECYCLE
// ========================================

app.whenReady().then(async () => {
  logger.info('App ready, creating window...');

  // Track update state
  let updateDownloaded = false;

  createWindow();

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow?.webContents.openDevTools();
  }

  // Check for updates (Production only)
  if (process.env.NODE_ENV !== 'development') {
    try {
      autoUpdater.logger = log;
      // @ts-expect-error - log types might mismatch slightly but it works
      autoUpdater.logger.transports.file.level = 'info';

      logger.info('Initializing auto-updater...');

      autoUpdater.on('checking-for-update', () => {
        logger.info('Checking for updates...');
      });

      autoUpdater.on('update-available', (info) => {
        logger.info('Update available:', info);
        mainWindow?.webContents.send('updater:update-available', info);
      });

      autoUpdater.on('update-not-available', (info) => {
        logger.info('Update not available:', info);
      });

      autoUpdater.on('error', (err) => {
        logger.error('Error in auto-updater:', err);
        mainWindow?.webContents.send('updater:error', err.message);
      });

      autoUpdater.on('download-progress', (progressObj) => {
        logger.info(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
        mainWindow?.webContents.send('updater:download-progress', progressObj);
      });

      // Check but don't force notify yet, we'll handle the UI
      autoUpdater.checkForUpdatesAndNotify();

      // When update is ready, tell the UI to show the modal
      autoUpdater.on('update-downloaded', (info) => {
        logger.info('Update downloaded:', info);
        updateDownloaded = true;
        // Small delay to ensure UI is ready if it happened on startup
        setTimeout(() => {
          mainWindow?.webContents.send('updater:update-downloaded', info);
        }, 2000);
      });
    } catch (err) {
      logger.error('Failed to check for updates:', err);
    }
  }

  // Handle explicit install request from UI
  ipcMain.handle('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });

  // Handle status check (in case UI loads after update is downloaded)
  ipcMain.handle('updater:check-status', async () => {
    // Return true if an update file exists in the downloaded cache
    // Note: This is an approximation. Ideally we track the state.
    // But autoUpdater doesn't expose a simple "isDownloaded" property.
    // We'll rely on the event for now for the push, but we can't easily poll without state tracking.
    // Let's add simple state tracking variable.
    return updateDownloaded;
  });



  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up before quit
app.on('before-quit', () => {
  logger.info('Application quitting...');
});

// Force exit in development mode to kill parent process
app.on('will-quit', () => {
  if (process.env.NODE_ENV === 'development') {
    logger.info('Development mode: forcing process exit to terminate dev servers');
    // Allow the quit to proceed, but ensure process exits completely
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }
});

