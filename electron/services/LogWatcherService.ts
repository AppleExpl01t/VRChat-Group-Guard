
import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { oscService } from './OscService';

// ============================================
// TYPES
// ============================================

export interface LogEvent {
  type: 'player-joined' | 'player-left' | 'location' | 'world-name' | 'destination';
  timestamp: string;
  data: Record<string, string>;
}

export interface PlayerJoinedEvent {
  displayName: string;
  userId?: string; 
  timestamp: string;
}

export interface LocationEvent {
  worldId: string;
  worldName?: string;
  instanceId?: string;
  location?: string;
  timestamp: string;
}

// ============================================
// STATE CACHE
// ============================================

interface WatcherState {
  currentWorldId: string | null;
  currentWorldName: string | null;
  currentLocation: string | null; // Full location string for proper tracking
  players: Map<string, PlayerJoinedEvent>; // keyed by displayName
}

// ============================================
// SERVICE
// ============================================

class LogWatcherService extends EventEmitter {
  private currentLogPath: string | null = null;
  private currentFileSize = 0;
  private watcherInterval: NodeJS.Timeout | null = null;
  private isWatching = false;
  private hasAnnouncedConnection = false; // Track if we've sent the connection message
  
  // State for late joiners
  private state: WatcherState = {
    currentWorldId: null,
    currentWorldName: null,
    currentLocation: null,
    players: new Map()
  };

  /**
   * Start watching. Validates directory, finds latest log, and starts trailing.
   * If callerWindow is provided, syncs current state to it immediately.
   */
  start(callerWindow?: BrowserWindow) {
    // If requested by a specific window, send it the current state immediately
    if (callerWindow && !callerWindow.isDestroyed()) {
        this.emitStateToWindow(callerWindow);
    }

    if (this.isWatching) {
        log.info('[LogWatcher] Service already running, synced state to requestor.');
        return;
    }

    this.isWatching = true;
    log.info('[LogWatcher] Starting service...');
    
    this.findLatestLog();
    
    // Send one-time OSC connection message if OSC is enabled
    if (!this.hasAnnouncedConnection) {
      this.hasAnnouncedConnection = true;
      const oscConfig = oscService.getConfig();
      if (oscConfig.enabled) {
        log.info('[LogWatcher] Sending OSC connection announcement');
        oscService.send('/chatbox/input', ['Group Guard is connected to VRChat', true, false]);
      }
    }
    
    this.watcherInterval = setInterval(() => {
      this.checkLogPath();
      this.readNewContent();
    }, 1000);
  }

  stop() {
    this.isWatching = false;
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
    log.info('[LogWatcher] Service stopped');
  }

  private emitStateToWindow(window: BrowserWindow) {
     log.info('[LogWatcher] Syncing state to renderer...');
     const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19).replace(/-/g, '.');

     if (this.state.currentWorldName) {
         window.webContents.send('log:world-name', { name: this.state.currentWorldName, timestamp });
     }
     if (this.state.currentWorldId) {
         window.webContents.send('log:location', { worldId: this.state.currentWorldId, timestamp });
     }
     
     // Send all known players
     for (const player of this.state.players.values()) {
         window.webContents.send('log:player-joined', player);
     }
  }

  private getLogDirectory(): string {
    const appData = app.getPath('appData');
    const localLow = path.join(appData, '..', 'LocalLow');
    return path.join(localLow, 'VRChat', 'VRChat');
  }

  private findLatestLog() {
    try {
      const logDir = this.getLogDirectory();
      if (!fs.existsSync(logDir)) {
        log.warn(`[LogWatcher] VRChat log directory not found: ${logDir}`);
        return;
      }

      const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('output_log_') && f.endsWith('.txt'))
        .map(f => {
          const fullPath = path.join(logDir, f);
          return {
            name: f,
            path: fullPath,
            stat: fs.statSync(fullPath)
          };
        })
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      if (files.length > 0) {
        const latest = files[0];
        if (latest.path !== this.currentLogPath) {
          log.info(`[LogWatcher] Found new log file: ${latest.name}`);
          this.currentLogPath = latest.path;
          // Always read from 0 on new file detection to build state
          this.currentFileSize = 0; 
          // Reset state for new log (new session)
          this.state = { currentWorldId: null, currentWorldName: null, currentLocation: null, players: new Map() };
        }
      }
    } catch (error) {
      log.error('[LogWatcher] Error searching for logs:', error);
    }
  }

  private checkLogPath() {
    this.findLatestLog();
  }

  private readNewContent() {
    if (!this.currentLogPath) return;

    try {
      if (!fs.existsSync(this.currentLogPath)) return;

      const stat = fs.statSync(this.currentLogPath);
      if (stat.size > this.currentFileSize) {
        const stream = fs.createReadStream(this.currentLogPath, {
          start: this.currentFileSize,
          end: stat.size
        });

        let buffer = '';
        stream.on('data', (chunk) => { buffer += chunk.toString(); });

        stream.on('end', () => {
          this.currentFileSize = stat.size;
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.trim()) this.parseLine(line.trim());
          }
        });
      }
    } catch (err) {
      log.error('[LogWatcher] Error reading log:', err);
    }
  }

  private parseLine(line: string) {
    // Timestamp check: yyyy.MM.dd HH:mm:ss
    const timestamp = line.substring(0, 19);
    
    // Regex Definitions (based on FCH / VRCX)
    // 1. Joining World: "Joining wrld_..."
    // Matches "Joining wrld_ID:instanceId~tag(val)..."
    // Use non-greedy for instance ID until next space or end of line?
    // Actually, VRChat log lines look like: "[Always] Joining wrld_xxx:12345~group(grp_xxx)"
    const reJoining = /Joining\s+(wrld_[a-zA-Z0-9-]+):([^\s]+)/;

    // 2. Player Joined: "OnPlayerJoined Name (usr_...)" - handles prefixes
    const rePlayerJoined = /OnPlayerJoined\s+(?:\[[^\]]+\]\s*)?([^\r\n(]+?)\s*\((usr_[a-f0-9-]{36})\)/;
    // 3. Player Left: "OnPlayerLeft Name (usr_...)" - Now flexible
    const rePlayerLeft = /OnPlayerLeft\s+([^\r\n(]+)(?:\s*\((usr_[a-f0-9-]{36})\))?/;
    // 4. Entering Room (World Name) - usually has [Behaviour]
    const reEntering = /\[Behaviour\] Entering Room: (.+)/;

    // 5. Avatar Change
    const reAvatar = /\[Avatar\] Loading Avatar:\s+(avtr_[a-f0-9-]{36})/;

    // ...

    // 1. World Location (Joining wrld_...)
    const joinMatch = line.match(reJoining);
    if (joinMatch) {
         const worldId = joinMatch[1];
        const fullInstanceString = joinMatch[2]; // Includes tags like 12345~group(...)
        // IMPORTANT: Use the FULL instance string for API calls (includes ~group, ~region, etc.)
        // The API needs this to identify group instances for permissions
        const instanceId = fullInstanceString; // Keep the full string!
        const location = `${worldId}:${fullInstanceString}`;
        
        log.info(`[LogWatcher] MATCH Joining: ${location}`);
        
        // CRITICAL: Check if FULL LOCATION changed (not just worldId!)
        // This ensures we track instance changes even within the same world
        if (this.state.currentLocation !== location) {
            log.info(`[LogWatcher] Location CHANGED from ${this.state.currentLocation} to ${location}`);
            
            // Clear players on ANY location change to prevent ghost players
            this.state.players.clear();
            
            this.state.currentWorldId = worldId;
            this.state.currentLocation = location;
            
            // Emit full location info - instanceId now includes all tags
            this.emitToRenderer('log:location', { worldId, instanceId, location, timestamp });
            this.emit('location', { worldId, instanceId, location, timestamp });
        }
    }

    // 5. Avatar Change
    const avatarMatch = line.match(reAvatar);
    if (avatarMatch) {
       const avatarId = avatarMatch[1];
       log.info(`[LogWatcher] MATCH Avatar: ${avatarId}`);
       this.emitToRenderer('log:avatar', { avatarId, timestamp });
       this.emit('avatar', { avatarId, timestamp });
    }

    // 2. World Name (Entering Room: ...)
    const enterMatch = line.match(reEntering);
    if (enterMatch) {
        const worldName = enterMatch[1].trim();
        log.info(`[LogWatcher] MATCH Entering Room: ${worldName}`);
        this.state.currentWorldName = worldName;
        this.emitToRenderer('log:world-name', { name: worldName, timestamp });
        this.emit('world-name', { name: worldName, timestamp });
    }

    // 3. Player Joined
    const playerJoinMatch = line.match(rePlayerJoined);
    if (playerJoinMatch) {
        const displayName = playerJoinMatch[1].trim();
        const userId = playerJoinMatch[2];
        
        log.info(`[LogWatcher] MATCH Player Joined: ${displayName} (${userId})`);
        
        const playerEvent: PlayerJoinedEvent = { displayName, userId, timestamp };
        this.state.players.set(displayName, playerEvent);
        this.emitToRenderer('log:player-joined', playerEvent);
        this.emit('player-joined', playerEvent);
    }

    // 4. Player Left
    const playerLeftMatch = line.match(rePlayerLeft);
    if (playerLeftMatch) {
        const displayName = playerLeftMatch[1].trim();
        const userId = playerLeftMatch[2]; // Optional now
        
        log.info(`[LogWatcher] MATCH Player Left: ${displayName} ${userId ? `(${userId})` : ''}`);
        
        // Remove from map if exists
        if (this.state.players.has(displayName)) {
             const entry = this.state.players.get(displayName)!;
             this.state.players.delete(displayName);
             // Use stored ID if available (preferred) over captured one
             const finalId = entry.userId || userId;
             this.emitToRenderer('log:player-left', { displayName, userId: finalId, timestamp });
             this.emit('player-left', { displayName, userId: finalId, timestamp });
        }
    }
  }

  private emitToRenderer(channel: string, data: unknown) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }
  public getPlayers(): PlayerJoinedEvent[] {
      return Array.from(this.state.players.values());
  }
}

export const logWatcherService = new LogWatcherService();

export function setupLogWatcherHandlers() {
  ipcMain.handle('log-watcher:start', (event) => {
    // Pass the sender window so we can sync state specifically to it
    const win = BrowserWindow.fromWebContents(event.sender);
    logWatcherService.start(win || undefined);
    return { success: true };
  });

  ipcMain.handle('log-watcher:stop', () => {
    logWatcherService.stop();
    return { success: true };
  });
  
  // Removed global auto-start to ensure we sync on request
}
