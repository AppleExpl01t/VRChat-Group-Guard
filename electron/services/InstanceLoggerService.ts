import { BrowserWindow, ipcMain } from 'electron';
import { logWatcherService } from './LogWatcherService';
import log from 'electron-log';
import { databaseService } from './DatabaseService';
import { groupAuthorizationService } from './GroupAuthorizationService';

const logger = log.scope('InstanceLogger');

class InstanceLoggerService {
  private currentSessionId: string | null = null;
  private currentWorldId: string | null = null;
  private currentInstanceId: string | null = null;
  private currentLocationString: string | null = null;
  private currentWorldName: string | null = null;
  private currentGroupId: string | null = null;
  private allowedGroupIds: Set<string> | null = null;

  /**
   * Sets the list of group IDs that the user is authorized to moderate.
   * This synchronizes with the central GroupAuthorizationService.
   * 
   * @param groupIds Array of group IDs with moderation permissions
   */
  public setAllowedGroups(groupIds: string[]): void {
    this.allowedGroupIds = new Set(groupIds.filter(id => id && id.startsWith('grp_')));
    // Also update central authorization service
    groupAuthorizationService.setAllowedGroups(groupIds);
    logger.info(`[InstanceLogger] Allowed groups set: ${this.allowedGroupIds.size} groups`);
  }

  /**
   * Check if a group ID is allowed for this session
   */
  public isGroupAllowed(groupId: string): boolean {
    if (!this.allowedGroupIds) return false;
    return this.allowedGroupIds.has(groupId);
  }
  
  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    logWatcherService.on('location', (event) => this.handleLocationChange(event));
    logWatcherService.on('world-name', (event) => this.handleWorldNameChange(event));
    
    // Also listen for player events to log them to session
    logWatcherService.on('player-joined', (event) => this.logEvent('PLAYER_JOIN', event));
    logWatcherService.on('player-left', (event) => this.logEvent('PLAYER_LEFT', event));
  }

  public getCurrentWorldId() { return this.currentWorldId; }
  public getCurrentWorldName() { return this.currentWorldName; }
  public getCurrentInstanceId() { return this.currentInstanceId; }
  public getCurrentLocation() { return this.currentLocationString; }
  public getCurrentGroupId() { return this.currentGroupId; }

  private async handleLocationChange(event: { worldId: string; instanceId: string; location: string; timestamp: string }) {
    try {
      this.currentLocationString = event.location;
      this.currentWorldName = null; 

      // Close previous session if active
      if (this.currentSessionId) {
          await databaseService.updateSession(this.currentSessionId, { endTime: new Date(event.timestamp) });
          // Note: we don't nullify immediately if we are just switching, but here we are switching.
          // Wait, if we switch instance, we should nullify.
      }

      this.currentWorldId = event.worldId;
      this.currentInstanceId = event.instanceId;
      
      // Note: Recruitment cache clearing is handled by the 'close-instance' handler
      // when an instance is explicitly closed. We don't clear on location change
      // because users may rejoin the same instance.
      
      const groupMatch = event.location.match(/~group\((grp_[a-f0-9-]+)\)/);
      const groupId = groupMatch ? groupMatch[1] : null;

      this.currentGroupId = groupId;
      BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => {
          w.webContents.send('instance:group-changed', groupId);
      });

      if (!groupId) {
          logger.info('Skipping non-group instance:', event.location);
          this.currentSessionId = null;
          return;
      }

      if (this.allowedGroupIds && !this.allowedGroupIds.has(groupId)) {
          log.info(`[InstanceLogger] Skipping group ${groupId} - not in moderated list`);
          this.currentSessionId = null;
          return;
      }

      // Start new session
      // Use a consistent session ID format or just let CUID do it?
      // Legacy code used 'sess_timestamp'.
      // Prisma has 'id' (UUID) and 'sessionId' (unique string).
      // We'll generate sessionId manually to keep control.
      const sessionId = `sess_${Date.now()}`;
      this.currentSessionId = sessionId;
      
      await databaseService.createSession({
          sessionId: sessionId,
          worldId: event.worldId,
          instanceId: event.instanceId,
          location: event.location,
          groupId: groupId,
          startTime: new Date(event.timestamp),
          worldName: undefined
      });

      log.info(`[InstanceLogger] Started new session: ${sessionId}`);

      // Log initial Location Change
      await this.logEvent('LOCATION_CHANGE', {
          timestamp: event.timestamp,
          displayName: 'System',
          location: event.location
      });

    } catch (error) {
       log.error('[InstanceLogger] Failed to handle location change:', error);
    }
  }

  private async handleWorldNameChange(event: { name: string; timestamp: string }) {
      this.currentWorldName = event.name;
      
      if (!this.currentSessionId) return;

      // Update Session record
      await databaseService.updateSession(this.currentSessionId, { worldName: event.name });

      // Clean log for audit trail (optional but good)
      await this.logEvent('WORLD_NAME_UPDATE', {
          timestamp: event.timestamp,
          worldName: event.name,
          displayName: 'System'
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async logEvent(type: string, event: Record<string, any>) {
      if (!this.currentSessionId) return;

      try {
        await databaseService.createLogEntry({
            sessionId: this.currentSessionId,
            type: type,
            timestamp: new Date(event.timestamp || Date.now()),
            actorDisplayName: event.actorDisplayName || event.displayName || 'Self',
            actorUserId: event.userId, // might be undefined
            details: event // Log the whole event object as details
        });
      } catch (e) {
          logger.error('Failed to log event', e);
      }
  }

  // Public wrapper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public logEnrichedEvent(type: string, data: any) {
      this.logEvent(type, { ...data, timestamp: new Date().toISOString() });
  }

  // DB Accessors
  public async getSessions(groupIdFilter?: string) {
    try {
        const sessions = await databaseService.getSessions(groupIdFilter);
        // Serialize Dates to strings for IPC
        return sessions.map(s => ({
            ...s,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime?.toISOString() || null,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString()
        }));
    } catch (error) {
        log.error('[InstanceLogger] Failed to get sessions:', error);
        return [];
    }
  }

  public async getSessionEvents(filenameOrId: string) {
      // Logic: filename in legacy was the ID basically (or filename contained ID).
      // Here we expect sessionId.
      // If the frontend passes a filename (from legacy data?), we might need to handle it.
      // But we are resetting data. So assume sessionId.
      // If the arg ends with .jsonl, it's legacy.
      if (!filenameOrId || filenameOrId.endsWith('.jsonl')) {
          return []; // Setup doesn't support legacy files yet
      }

      try {
          const events = await databaseService.getSessionEvents(filenameOrId);
           return events.map(e => ({
            ...e,
            timestamp: e.timestamp.toISOString(),
            createdAt: e.createdAt.toISOString()
        }));
      } catch (error) {
          log.error('[InstanceLogger] Failed to get session events:', error);
          return null;
      }
  }

  public async clearSessions() {
      try {
          await databaseService.deleteAllSessions();
          return true;
      } catch (error) {
          logger.error('Failed to clear sessions:', error);
          return false;
      }
  }
}

export const instanceLoggerService = new InstanceLoggerService();

// IPC Handlers
ipcMain.handle('database:get-sessions', async (_, groupId) => {
    return instanceLoggerService.getSessions(groupId);
});
ipcMain.handle('database:get-session-events', async (_, sessionId) => {
    return instanceLoggerService.getSessionEvents(sessionId);
});
ipcMain.handle('database:clear-sessions', async () => {
    return instanceLoggerService.clearSessions();
});
ipcMain.handle('instance:get-current-group', async () => {
    return instanceLoggerService.getCurrentGroupId();
});
