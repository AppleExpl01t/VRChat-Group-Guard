
import { app, BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { EventEmitter } from 'events';
import Store from 'electron-store';
import { oscService } from './OscService';
import { discordBroadcastService } from './DiscordBroadcastService';
import { windowService } from './WindowService';
import { processService } from './ProcessService';
// Pure parsing utilities available in LogParserService for testing

import { serviceEventBus } from './ServiceEventBus';

const store = new Store();


// ============================================
// TYPES
// ============================================

export interface LogEvent {
  type: 'player-joined' | 'player-left' | 'location' | 'world-name' | 'destination';
  timestamp: string;
  data: Record<string, string>;
}

// ... existing types ...

export interface PlayerJoinedEvent {
  displayName: string;
  userId?: string;
  timestamp: string;
  isBackfill?: boolean;
}

export interface VoteKickEvent {
  target: string;
  initiator: string;
  timestamp: string;
  isBackfill?: boolean;
}

export interface VideoPlayEvent {
  url: string;
  requestedBy: string;
  timestamp: string;
  isBackfill?: boolean;
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
  pendingJoins: Map<string, { timer: NodeJS.Timeout; event: PlayerJoinedEvent }>;
}

// ============================================
// SERVICE
// ============================================

class LogWatcherService extends EventEmitter {
  private currentLogPath: string | null = null;
  private currentFileSize = 0;
  private watcherInterval: NodeJS.Timeout | null = null;
  private isWatching = false;
  private isHydrating = false; // Flag to suppress IPC during initial scan
  private isProcessing = false; // Prevent concurrent reads
  private hasAnnouncedConnection = false;

  // Inactivity and Persistence tracking
  private lastActivityTime = 0;
  private lastProcessedTimestamp = 0;
  private inactivityCheckInterval: NodeJS.Timeout | null = null;

  // Context Sync
  private seekingInstanceId: string | null = null;
  private seekingStartTime: number = 0;

  private state: WatcherState = {
    currentWorldId: null,
    currentWorldName: null,
    currentLocation: null,
    players: new Map(),
    pendingJoins: new Map<string, { timer: NodeJS.Timeout; event: PlayerJoinedEvent }>()
  };

  /**
   * Returns the list of currently tracked players in the instance.
   */
  public getPlayers(): PlayerJoinedEvent[] {
    return Array.from(this.state.players.values());
  }

  /**
   * DEDUPLICATION: Returns set of filenames that have been processed/tracked.
   */
  public getProcessedFiles(): Set<string> {
    const list = store.get('processed_logs', []) as string[];
    return new Set(list);
  }

  /**
   * DEDUPLICATION: Marks a file as processed.
   */
  public markFileAsProcessed(filename: string) {
    const list = store.get('processed_logs', []) as string[];
    if (!list.includes(filename)) {
      list.push(filename);
      // Limit size to prevent infinite growth (keep last 5000 logs ~150KB)
      if (list.length > 5000) list.shift();
      store.set('processed_logs', list);
    }
  }

  /**
   * Start watching. Validates directory, finds latest log, and starts trailing.
   * If callerWindow is provided, syncs current state to it immediately.
   */
  start(callerWindow?: BrowserWindow) {
    // ... existing start logic ...
    if (callerWindow && !callerWindow.isDestroyed()) {
      this.emitStateToWindow(callerWindow);
    }

    if (this.isWatching) {
      log.info('[LogWatcher] Service already running, synced state to requestor.');
      return;
    }

    this.isWatching = true;
    log.info('[LogWatcher] Starting service (Robust Mode)...');

    processService.startMonitoring(5000);
    processService.on('status-changed', (isRunning) => {
      if (!isRunning) {
        log.info('[LogWatcher] ProcessService reports VRChat closed. Clearing state.');
        this.handleGameClosed();
      } else {
        log.info('[LogWatcher] ProcessService reports VRChat running.');
      }
    });

    this.startFileWatcher();

    processService.checkProcess().then(isRunning => {
      if (!isRunning) {
        log.info('[LogWatcher] Initial check: Game NOT running. Enforcing closed state.');
        this.handleGameClosed();
      }
    });
  }

  private async startFileWatcher() {
    if (this.watcherInterval) return;

    // Reset state for new session
    this.currentFileSize = 0;
    this.state = { currentWorldId: null, currentWorldName: null, currentLocation: null, players: new Map(), pendingJoins: new Map() };

    this.findLatestLog();

    // SMART SYNC: Fetch current location from API
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetchCurrentLocationFromApi } = require('./AuthService');

    try {
      const apiLoc = await fetchCurrentLocationFromApi();
      if (apiLoc) {
        this.seekingInstanceId = apiLoc;
        this.seekingStartTime = Date.now();
        log.info(`[LogWatcher] Smart Sync: Force-anchoring context to API location: ${apiLoc}`);

        // IMMEDIATE STATE ANCHORING: Fix the state once and for all on startup
        const worldId = apiLoc.split(':')[0];
        this.state.currentWorldId = worldId;
        this.state.currentLocation = apiLoc;
        this.state.players.clear(); // Clear any potentially stale cached players

        // Inform the renderer immediately so the UI shows Roaming Mode right away
        this.emitToRenderer('log:location', { worldId, instanceId: apiLoc, location: apiLoc, timestamp: new Date().toISOString() });

        // SYNC INTER-SERVICE: Inform InstanceLoggerService so it can update currentGroupId
        this.emit('location', { worldId, instanceId: apiLoc, location: apiLoc, timestamp: new Date().toISOString() });

        // Trigger a background reconciliation to pull the current player list from API
        // This ensures the Roaming Card is fully populated even before the log catches up
        this.reconcileWithApi(apiLoc);
      }
    } catch (e) {
      log.warn('[LogWatcher] Smart Sync check failed', e);
    }

    // RESTORE STATE from Store
    const savedPath = store.get('lastLogPath');
    const savedTimestamp = store.get('lastLogTimestamp');

    if (this.currentLogPath && savedPath === this.currentLogPath) {
      log.info(`[LogWatcher] Resuming from saved state. Last Timestamp: ${new Date(savedTimestamp as number).toISOString()}`);
      this.lastProcessedTimestamp = savedTimestamp as number;
    } else {
      log.info('[LogWatcher] New log file or no saved state. Resetting persistence.');
      this.lastProcessedTimestamp = 0;
      if (this.currentLogPath) {
        store.set('lastLogPath', this.currentLogPath);
        store.set('lastLogTimestamp', 0);
      }
    }

    // Send animated OSC connection sequence if OSC is enabled
    if (!this.hasAnnouncedConnection) {
      this.hasAnnouncedConnection = true;
      oscService.start();

      const oscConfig = oscService.getConfig();
      if (oscConfig.enabled) {
        log.info('[LogWatcher] Sending OSC connection announcement sequence');
        oscService.send('/chatbox/input', ['Group Guard connected to VRChat successfully!', true, false]);
        setTimeout(() => {
          oscService.send('/chatbox/input', ['Initializing connection to VRChats logging service', true, true]);
          setTimeout(() => {
            oscService.send('/chatbox/input', ['VRChat Connected to Group Guard successfully!', true, false]);
          }, 2000);
        }, 1000);
      }
    }

    this.watcherInterval = setInterval(() => {
      this.checkLogPath();
      this.readNewContent();
    }, 1000);

    const checkActivity = async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { checkOnlineStatus } = require('./AuthService');

      // SEEK TIMEOUT CHECK (CRITICAL for reliability)
      if (this.seekingInstanceId) {
        if (Date.now() - this.seekingStartTime > 12000) {
          log.warn(`[LogWatcher] Smart Sync: Seek timeout for ${this.seekingInstanceId}. Forcing API state.`);

          const target = this.seekingInstanceId;
          this.seekingInstanceId = null;

          const worldId = target.split(':')[0];
          if (this.state.currentLocation !== target) {
            this.state.currentWorldId = worldId;
            this.state.currentLocation = target;
            this.emitToRenderer('log:location', { worldId, instanceId: target, location: target, timestamp: new Date().toISOString() });
          }

          this.reconcileWithApi(target);
        }
      }

      if (this.state.currentWorldId || this.state.currentLocation) {
        if (Date.now() - this.lastActivityTime > 300000) {
          try {
            const apiLoc = await fetchCurrentLocationFromApi();
            if (apiLoc && apiLoc !== this.state.currentLocation) {
              log.info(`[LogWatcher] Inactivity Sync: API reports DIFFERENT location (${apiLoc}). Updating state.`);

              const worldId = apiLoc.split(':')[0];
              this.state.currentWorldId = worldId;
              this.state.currentLocation = apiLoc;
              this.state.players.clear();

              const timestamp = new Date().toISOString();
              this.emitToRenderer('log:location', { worldId, instanceId: apiLoc, location: apiLoc, timestamp });
              this.reconcileWithApi(apiLoc);
            } else if (!apiLoc && this.state.currentLocation) {
              // Optional: Check if we should mark as offline, but ProcessService is better for this
              log.info('[LogWatcher] Inactivity Sync: API reports OFFLINE but state is active. Trusting ProcessService for exit.');
            }
          } catch { /* ignore */ }
        }
      }
    };

    this.inactivityCheckInterval = setInterval(checkActivity, 60000);
    setTimeout(checkActivity, 5000);
  }

  private stopFileWatcher() {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    oscService.stop();
  }

  stop() {
    this.isWatching = false;
    this.stopFileWatcher();

    processService.stopMonitoring();
    processService.removeAllListeners('status-changed');

    log.info('[LogWatcher] Service stopped');
  }

  private emitStateToWindow(window: BrowserWindow) {
    // Prevent partial syncs during hydration which cause UI duplicates
    if (this.isHydrating) {
      log.info('[LogWatcher] Skipping state sync - Hydration in progress');
      return;
    }

    log.info('[LogWatcher] Syncing state to renderer...');
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19).replace(/-/g, '.');

    if (this.state.currentWorldName) {
      window.webContents.send('log:world-name', { name: this.state.currentWorldName, timestamp });
    }
    if (this.state.currentWorldId) {
      window.webContents.send('log:location', {
        worldId: this.state.currentWorldId,
        instanceId: this.state.currentLocation, // Send full location as instanceId fallback
        location: this.state.currentLocation,
        timestamp
      });
    }

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
          this.currentFileSize = 0;
          this.state = { currentWorldId: null, currentWorldName: null, currentLocation: null, players: new Map(), pendingJoins: new Map() };

          // DEDUPLICATION: Mark this new live file as processed so Scanner ignores it
          this.markFileAsProcessed(latest.name);
        }
      }
    } catch (error) {
      log.error('[LogWatcher] Error searching for logs:', error);
    }
  }

  private checkLogPath() {
    this.findLatestLog();
  }

  private async readNewContent() {
    if (!this.currentLogPath || this.isProcessing) return;

    try {
      if (!fs.existsSync(this.currentLogPath)) return;

      const stat = fs.statSync(this.currentLogPath);
      if (stat.size > this.currentFileSize) {
        this.isProcessing = true;

        // Decide if this is hydration (first read of a non-empty file)
        const isInitialRead = this.currentFileSize === 0;
        if (isInitialRead) {
          this.isHydrating = true;
          log.info(`[LogWatcher] Initial hydration started for ${path.basename(this.currentLogPath)} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
        }

        const stream = fs.createReadStream(this.currentLogPath, {
          start: this.currentFileSize,
          end: stat.size
        });

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });

        let lineCount = 0;
        for await (const line of rl) {
          if (line.trim()) {
            this.parseLine(line.trim());
          }
          lineCount++;

          // Prevent blocking the event loop during huge initial scans
          if (this.isHydrating && lineCount % 2000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        this.currentFileSize = stat.size;

        if (this.isHydrating) {
          this.isHydrating = false;
          log.info(`[LogWatcher] Initial hydration complete. Processed ${lineCount} lines.`);
          // Sync final state to all windows
          BrowserWindow.getAllWindows().forEach(win => this.emitStateToWindow(win));
        }
      }
    } catch (err) {
      log.error('[LogWatcher] Error reading log:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private handleGameClosed() {
    if (!this.state.currentWorldId && !this.state.currentLocation) return;

    log.info('[LogWatcher] Game Closed Detected. Clearing state.');

    this.state.currentWorldId = null;
    this.state.currentWorldName = null;
    this.state.currentLocation = null;
    this.state.players.clear();

    this.emitToRenderer('log:game-closed', {});
    this.emit('game-closed', {});

    discordBroadcastService.setIdle();
  }

  // Helper to sync missing players from API
  private async reconcileWithApi(location: string) {
    // Lazy load dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetchInstancePlayers } = require('./AuthService');

    log.info(`[LogWatcher] Reconciling players for ${location} via API...`);
    const apiPlayers = await fetchInstancePlayers(location);

    // CONCURRENCY CHECK: Ensure we are still in the same world
    if (this.state.currentLocation !== location) {
      log.warn(`[LogWatcher] Reconcile aborted: Context changed during fetch (Req: ${location}, Curr: ${this.state.currentLocation})`);
      return;
    }

    let added = 0;
    for (const p of apiPlayers) {
      // Check by userId (preferred) or Display Name
      const exists = Array.from(this.state.players.values()).some(existing =>
        (existing.userId && existing.userId === p.id) ||
        existing.displayName === p.displayName
      );

      if (!exists) {
        const timestamp = new Date().toISOString();
        const event: PlayerJoinedEvent = {
          displayName: p.displayName,
          userId: p.id,
          timestamp,
          isBackfill: true // Mark as backfill so we don't spam notifications
        };
        this.state.players.set(p.displayName, event);
        this.state.pendingJoins.delete(p.displayName); // Clear any pending raw join
        this.emitToRenderer('log:player-joined', event);
        serviceEventBus.emit('player-joined', event);

        // SCORE CALIBRATION: Record Encounter (Reconciled from API)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { timeTrackingService } = require('./TimeTrackingService');
        timeTrackingService.recordEncounter(p.id);

        added++;
      }
    }
    if (added > 0) {
      log.info(`[LogWatcher] Reconcile complete. Added ${added} missing players from API.`);
      if (this.state.currentLocation && this.state.currentLocation.includes('~group(')) {
        discordBroadcastService.updateGroupStatus(this.state.currentWorldName || 'Group Instance', this.state.players.size);
      }
    } else {
      log.info('[LogWatcher] Reconcile complete. No missing players found.');
    }
  }

  private parseLine(line: string) {
    if (!line || !line.trim()) return;

    // Regex Definitions
    const reJoining = /(?:Joining|Entering)\s+(wrld_[a-zA-Z0-9-]+):([^\s]+)/;

    const reEntering = /Entering Room:\s+(.+)/;
    const reAvatar = /\[Avatar\] Loading Avatar:\s+(avtr_[a-f0-9-]{36})/;
    const reVoteKick = /A vote kick has been initiated against\s+(.+)\s+by\s+(.+?),\s+do you agree\?/;
    const reVideo = /Started video load for URL:\s+(.+?)(?:,\s+requested by\s+(.+))?$/;

    // SMART SYNC FILTER
    if (this.seekingInstanceId) {
      const getBaseId = (id: string) => id.split('~')[0];
      const targetBase = getBaseId(this.seekingInstanceId as string);

      const match = line.match(reJoining);

      if (match) {
        const logId = `${match[1]}:${match[2]}`;
        const logBase = getBaseId(logId);

        if (logBase === targetBase) {
          log.info(`[LogWatcher] Smart Sync: Target context found via regex! Resuming processing.`);
          this.seekingInstanceId = null;
          this.reconcileWithApi(logId);
        } else {
          log.info(`[LogWatcher] Smart Sync: User joined a DIFFERENT world (${logId}) while seeking ${this.seekingInstanceId}. Aborting seek and syncing to NEW world.`);
          this.seekingInstanceId = null; // Abort seek - the user moved!
          // Continue processing this line normally so it triggers the location change below
        }
      } else if (line.includes('Joining') || line.includes('Entering Room:')) {
        // Fallback or Abort: Any join/enter during seeking should probably abort if we can't match it
        // but it's safer to just let the regex handle it above. 
        // If we hit "Entering Room" and we are still seeking, it means we definitely missed the "Joining" match.
        if (line.includes('Entering Room:')) {
          log.info(`[LogWatcher] Smart Sync: Hit 'Entering Room' while seeking. Aborting seek to avoid state lag.`);
          this.seekingInstanceId = null;
        }
      } else if (line.includes(targetBase)) {
        // Fallback: simple string match
        log.info(`[LogWatcher] Smart Sync: Target context found via string match! Resuming processing.`);
        const target = this.seekingInstanceId;
        this.seekingInstanceId = null;
        this.reconcileWithApi(target as string);
      } else {
        // Skip logic
        if (line.includes('Joining') || line.includes('Entering')) return;
        return;
      }
    }

    const timestamp = line.substring(0, 19);

    // Activity Timing (Basic)
    let parsedTime = 0;
    try {
      const parts = timestamp.split(' ');
      if (parts.length === 2 && parts[0].includes('.')) {
        const dateStr = parts[0].replace(/\./g, '-');
        const timeStr = parts[1];
        const logDate = new Date(`${dateStr}T${timeStr}`);
        if (!isNaN(logDate.getTime())) {
          parsedTime = logDate.getTime();
          this.lastActivityTime = parsedTime;
        }
      }
    } catch { /* ignore */ }

    // isBackfill check for Notifications
    const isBackfill = this.lastActivityTime < this.lastProcessedTimestamp;

    // Actually update processed timestamp if this is newer
    if (parsedTime > this.lastProcessedTimestamp) {
      this.lastProcessedTimestamp = parsedTime;
      store.set('lastLogTimestamp', parsedTime); // persist
    }

    // 1. World Location
    const joinMatch = line.match(reJoining);
    if (joinMatch) {
      const worldId = joinMatch[1];
      const fullInstanceString = joinMatch[2];
      const instanceId = fullInstanceString;
      const location = `${worldId}:${fullInstanceString}`;

      log.info(`[LogWatcher] MATCH Joining: ${location}`);

      // DEBUG: Fetch API location to compare
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { fetchCurrentLocationFromApi } = require('./AuthService');
      fetchCurrentLocationFromApi().catch((err: unknown) => log.error('[DEBUG_COMPARE] Failed to fetch API location', err));

      if (this.state.currentLocation !== location) {
        log.info(`[LogWatcher] Location CHANGED to ${location}. Purging old instance cache.`);

        // FORCED PURGE: Completely clear presence state for the OLD world
        this.state.players.clear();
        this.state.currentWorldId = worldId;
        this.state.currentLocation = location;
        this.state.currentWorldName = null; // Clear name until the next 'Entering Room' entry

        // Inform UI to clear its local player list and update world
        this.emitToRenderer('log:location', { worldId, instanceId, location, timestamp });
        this.emit('location', { worldId, instanceId, location, timestamp });
        serviceEventBus.emit('location', { worldId, instanceId, location, timestamp });

        // INSTANT RECONCILE: Immediately pull the fresh user list from the API for the NEW instance
        // This is the "failsafe" to ensure the Roaming Card is correct even if logs are slow
        this.reconcileWithApi(location);

        if (location.includes('~group(')) {
          discordBroadcastService.updateGroupStatus("Group Instance", 0);
        } else {
          discordBroadcastService.setIdle();
        }
      }
    }

    // 2. Avatar
    const avatarMatch = line.match(reAvatar);
    if (avatarMatch) {
      this.emitToRenderer('log:avatar', { avatarId: avatarMatch[1], timestamp });
      this.emit('avatar', { avatarId: avatarMatch[1], timestamp });
    }

    // 3. Entering Room (Name)
    const enterMatch = line.match(reEntering);
    if (enterMatch) {
      const worldName = enterMatch[1].trim();
      this.state.currentWorldName = worldName;
      this.emitToRenderer('log:world-name', { name: worldName, timestamp });
      this.emit('world-name', { name: worldName, timestamp });
      if (this.state.currentLocation && this.state.currentLocation.includes('~group(')) {
        discordBroadcastService.updateGroupStatus(worldName, this.state.players.size);
      }
    }

    // 4. Player Joined
    if (line.includes('OnPlayerJoined')) {
      const rePrefix = /OnPlayerJoined\s+(?:\[[^\]]+\]\s*)?/;
      const match = line.match(rePrefix);
      if (match) {
        // Extract everything after the prefix
        const restOfLine = line.substring(match.index! + match[0].length);

        let displayName = restOfLine;
        let userId: string | undefined;

        // Check for ID at the end in format "Name (usr_xxx)"
        const lastParenIndex = restOfLine.lastIndexOf('(');
        if (lastParenIndex !== -1 && restOfLine.endsWith(')')) {
          const possibleId = restOfLine.substring(lastParenIndex + 1, restOfLine.length - 1);
          if (possibleId.startsWith('usr_')) {
            userId = possibleId;
            displayName = restOfLine.substring(0, lastParenIndex).trim();
          }
        }

        displayName = displayName.trim();

        // SANITIZATION: Strip "/ player=" and "(local)"
        if (displayName.startsWith('/ player=')) {
          displayName = displayName.substring(9).trim();
        }
        if (displayName.endsWith('(local)')) {
          displayName = displayName.substring(0, displayName.length - 7).trim();
        }

        // IGNORE: Internal VRChat debug message often confused for a player name
        if (displayName.includes('called, updating lock state')) {
          return;
        }

        if (displayName) {
          // Suppress historical logs during startup
          if (!this.isHydrating) {
            log.info(`[LogWatcher] MATCH Player Joined: ${displayName} (${userId || 'No ID'})`);
          }

          const playerEvent: PlayerJoinedEvent = { displayName, userId, timestamp, isBackfill };

          // DEDUPLICATION & EMISSION LOGIC
          // If we already have a detailed join (with userId), just update and emit.
          // If we have a raw join (no userId), wait 1.5s to see if a detailed one comes.

          if (userId) {
            // Detailed Join - Clear any pending raw join for this name
            if (this.state.pendingJoins.has(displayName)) {
              clearTimeout(this.state.pendingJoins.get(displayName)!.timer);
              this.state.pendingJoins.delete(displayName);
            }

            this.state.players.set(displayName, playerEvent);
            this.emitToRenderer('log:player-joined', playerEvent);
            serviceEventBus.emit('player-joined', playerEvent);

            // SCORE CALIBRATION: Record Encounter
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { timeTrackingService } = require('./TimeTrackingService');
            timeTrackingService.recordEncounter(userId);

            if (this.state.currentLocation && this.state.currentLocation.includes('~group(')) {
              discordBroadcastService.updateGroupStatus(this.state.currentWorldName || 'Group Instance', this.state.players.size);
            }
          } else {
            // Raw Join - Buffer it
            if (this.state.pendingJoins.has(displayName)) {
              clearTimeout(this.state.pendingJoins.get(displayName)!.timer);
            }

            const timer = setTimeout(() => {
              this.state.pendingJoins.delete(displayName);
              // If it's still not in the player map, emit it now as a raw join
              if (!this.state.players.has(displayName)) {
                this.state.players.set(displayName, playerEvent);
                this.emitToRenderer('log:player-joined', playerEvent);
                serviceEventBus.emit('player-joined', playerEvent);

                if (this.state.currentLocation && this.state.currentLocation.includes('~group(')) {
                  discordBroadcastService.updateGroupStatus(this.state.currentWorldName || 'Group Instance', this.state.players.size);
                }
              }
            }, 1500);

            this.state.pendingJoins.set(displayName, { timer, event: playerEvent });
          }
        }
      }
    }

    // 5. Player Left
    if (line.includes('OnPlayerLeft')) {
      const rePrefix = /OnPlayerLeft\s+/;
      const match = line.match(rePrefix);
      if (match) {
        // Extract everything after the prefix (name + optional ID)
        const restOfLine = line.substring(match.index! + match[0].length);

        let displayName = restOfLine;
        let userId: string | undefined;

        // Check for ID at the end in format "Name (usr_xxx)"
        const lastParenIndex = restOfLine.lastIndexOf('(');
        if (lastParenIndex !== -1 && restOfLine.endsWith(')')) {
          const possibleId = restOfLine.substring(lastParenIndex + 1, restOfLine.length - 1);
          if (possibleId.startsWith('usr_')) {
            userId = possibleId;
            displayName = restOfLine.substring(0, lastParenIndex).trim();
          }
        }

        displayName = displayName.trim();

        // SANITIZATION: Strip "/ player=" and "(local)"
        if (displayName.startsWith('/ player=')) {
          displayName = displayName.substring(9).trim();
        }
        if (displayName.endsWith('(local)')) {
          displayName = displayName.substring(0, displayName.length - 7).trim();
        }

        // IGNORE: Internal VRChat debug message often confused for a player name
        if (displayName.includes('called, updating lock state')) {
          return;
        }

        if (displayName) {
          // Suppress historical logs during startup
          if (!this.isHydrating) {
            log.info(`[LogWatcher] MATCH Player Left: ${displayName} (${userId || 'No ID'})`);
          }

          if (this.state.players.has(displayName)) {
            const entry = this.state.players.get(displayName)!;
            this.state.players.delete(displayName);
            // Prefer the ID from the log, but fallback to known ID from state
            const finalId = userId || entry.userId;
            const leaveEvent = { displayName, userId: finalId, timestamp, isBackfill };
            this.emitToRenderer('log:player-left', leaveEvent);
            serviceEventBus.emit('player-left', leaveEvent);

            if (this.state.currentLocation && this.state.currentLocation.includes('~group(')) {
              discordBroadcastService.updateGroupStatus(this.state.currentWorldName || 'Group Instance', this.state.players.size);
            }
          }
        }
      }
    }

    // 6. Vote Kick
    const voteMatch = line.match(reVoteKick);
    if (voteMatch) {
      const event: VoteKickEvent = { target: voteMatch[1].trim(), initiator: voteMatch[2].trim(), timestamp, isBackfill };
      this.emitToRenderer('log:vote-kick', event);
      this.emit('vote-kick', event);
    }

    // 7. Video Play
    const videoMatch = line.match(reVideo);
    if (videoMatch) {
      const event: VideoPlayEvent = { url: videoMatch[1].trim(), requestedBy: videoMatch[2] ? videoMatch[2].trim() : 'Unknown', timestamp, isBackfill };
      this.emitToRenderer('log:video-play', event);
      this.emit('video-play', event);
    }

    // 8. Notifications
    // Pattern: Received Notification: <Notification from username:(.+?), sender user id:(usr_[a-f0-9-]{36}) .+? type: ([a-zA-Z]+), id: (not_[a-f0-9-]{36}), .+? message: "(.+?)"
    if (line.includes('Received Notification:')) {
      const reNotify = /Received Notification: <Notification from username:(.+?), sender user id:(usr_[a-f0-9-]{36}).+?type:\s*([a-zA-Z]+), id:\s*(not_[a-f0-9-]{36}),.+?message:\s*"(.+?)"/;
      const match = line.match(reNotify);
      if (match) {
        const receiverMatch = line.match(/to\s+(usr_[a-f0-9-]{36})/); // sometimes "to usr_..." is present
        const event = {
          senderUsername: match[1],
          senderUserId: match[2],
          type: match[3],
          notificationId: match[4],
          message: match[5],
          receiverUserId: receiverMatch ? receiverMatch[1] : undefined,
          timestamp,
          isBackfill
        };
        this.emitToRenderer('log:notification', event);
        this.emit('notification', event);
      }
    }

    // 9. Avatar Loading/Switching (Behavior)
    // Pattern: [Behaviour] Switching (.+) to avatar (.+)
    if (line.includes('[Behaviour] Switching')) {
      const reSwitch = /\[Behaviour\] Switching\s+(.+?)\s+to avatar\s+(.+)/;
      const match = line.match(reSwitch);
      if (match) {
        const event = {
          displayName: match[1],
          avatarName: match[2],
          timestamp,
          isBackfill
        };
        this.emitToRenderer('log:avatar-switch', event);
        this.emit('avatar-switch', event);
      }
    }

    // 10. Sticker Spawn
    // Pattern: [StickersManager] User (usr_...) (...) spawned sticker (inv_...)
    if (line.includes('[StickersManager] User')) {
      const reSticker = /\[StickersManager\] User\s+(usr_[a-f0-9-]{36})\s+\((.+?)\)\s+spawned sticker\s+(inv_[a-f0-9-]{36})/;
      const match = line.match(reSticker);
      if (match) {
        const event = {
          userId: match[1],
          displayName: match[2],
          stickerId: match[3],
          timestamp,
          isBackfill
        };
        this.emitToRenderer('log:sticker-spawn', event);
        this.emit('sticker-spawn', event);
      }
    }
  }

  private emitToRenderer(channel: string, data: unknown) {
    // Prevent partial syncs during hydration which cause UI duplicates
    // CRITICAL: We MUST allow location updates through so the Roaming Mode card appears immediately.
    const ALWAYS_ALLOWED_CHANNELS = ['log:location', 'log:world-name', 'log:game-closed', 'log:cam-adjust', 'log:avatar', 'log:avatar-switch'];

    if (this.isHydrating && !ALWAYS_ALLOWED_CHANNELS.includes(channel)) {
      return;
    }
    windowService.broadcast(channel, data);
  }
}

export const logWatcherService = new LogWatcherService();

/**
 * Sets up IPC handlers for the log watcher service
 */
export function setupLogWatcherHandlers() {
  ipcMain.handle('log-watcher:start', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    logWatcherService.start(win || undefined);
    return { success: true };
  });

  ipcMain.handle('log-watcher:stop', () => {
    logWatcherService.stop();
    return { success: true };
  });
}
