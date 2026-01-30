import Store from 'electron-store';
import { ipcMain } from 'electron';
import log from 'electron-log';
import { windowService } from './WindowService';
import { databaseService } from './DatabaseService';

const logger = log.scope('WatchlistService');

export type EntityType = 'user' | 'group' | 'avatar' | 'world';

export interface WatchedEntity {
  id: string; // usr_..., grp_...
  type: EntityType;
  displayName: string;
  tags: string[]; // IDs of tags or raw strings
  notes: string;
  priority: number; // -100 to 100
  critical: boolean; // Flag for high alert
  silent: boolean; // Flag for no notification
  createdAt: number;
  updatedAt: number;
}

export interface ModerationTag {
  id: string; // slug-style id
  label: string;
  description: string;
  color?: string; // Hex color
}

interface WatchlistStoreSchema {
  entities: Record<string, WatchedEntity>;
  tags: ModerationTag[];
}

class WatchlistService {
  private store: Store<WatchlistStoreSchema>;

  constructor() {
    this.store = new Store<WatchlistStoreSchema>({
      name: 'watchlist-data',
      defaults: {
        entities: {},
        tags: [
          { id: 'nuisance', label: 'Nuisance', description: 'General annoyance', color: '#FFA500' },
          { id: 'malicious', label: 'Malicious', description: 'Crasher or attacker', color: '#FF0000' },
          { id: 'community', label: 'Community', description: 'Safe or known user', color: '#00FF00' },
        ]
      }
    });
  }

  public initialize() {
    logger.info('Initializing WatchlistService...');
    this.setupHandlers();
  }

  // ============================================
  // ENTITY MANAGEMENT
  // ============================================

  public getEntity(id: string): WatchedEntity | undefined {
    // Entities are stored in a Record<string, WatchedEntity> for fast lookup
    return this.store.get('entities')[id];
  }

  public getEntities(): WatchedEntity[] {
    const map = this.store.get('entities');
    return Object.values(map);
  }

  public saveEntity(entity: Partial<WatchedEntity> & { id: string; type: EntityType }) {
    const map = this.store.get('entities');
    const existing = map[entity.id];

    // Merge or Create
    const now = Date.now();
    const updated: WatchedEntity = {
      id: entity.id,
      type: entity.type,
      displayName: entity.displayName || existing?.displayName || 'Unknown',
      tags: entity.tags || existing?.tags || [],
      notes: entity.notes || existing?.notes || '',
      priority: entity.priority ?? existing?.priority ?? 0,
      critical: entity.critical ?? existing?.critical ?? false,
      silent: entity.silent ?? existing?.silent ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    map[entity.id] = updated;
    this.store.set('entities', map);

    this.notifyUpdate();
    return updated;
  }

  public deleteEntity(id: string) {
    const map = this.store.get('entities');
    if (map[id]) {
      delete map[id];
      this.store.set('entities', map);
      this.notifyUpdate();
      return true;
    }
    return false;
  }

  // ============================================
  // TAG MANAGEMENT
  // ============================================

  public getTags(): ModerationTag[] {
    return this.store.get('tags');
  }

  public addTag(tag: ModerationTag) {
    const tags = this.store.get('tags');
    if (!tags.find(t => t.id === tag.id)) {
      tags.push(tag);
      this.store.set('tags', tags);
      this.notifyUpdate();
    }
  }

  public deleteTag(tagId: string) {
    const tags = this.store.get('tags');
    const filtered = tags.filter(t => t.id !== tagId);
    if (filtered.length !== tags.length) {
      this.store.set('tags', filtered);
      this.notifyUpdate();
    }
  }

  public saveTag(tag: ModerationTag) {
    const tags = this.store.get('tags');
    const index = tags.findIndex(t => t.id === tag.id);
    if (index !== -1) {
      tags[index] = tag;
    } else {
      tags.push(tag);
    }
    this.store.set('tags', tags);
    this.notifyUpdate();
  }

  // ============================================
  // HELPERS
  // ============================================

  private notifyUpdate() {
    windowService.broadcast('watchlist:update', {
      entities: this.getEntities(),
      tags: this.getTags()
    });
  }

  public importData(json: string) {
    try {
      const data = JSON.parse(json);
      // Basic validation could go here
      if (data.entities) this.store.set('entities', data.entities);
      if (data.tags) this.store.set('tags', data.tags);
      this.notifyUpdate();
      return true;
    } catch (e) {
      logger.error('Failed to import watchlist data', e);
      return false;
    }
  }

  public exportData() {
    return JSON.stringify(this.store.store, null, 2);
  }

  private setupHandlers() {
    // IPC Handlers
    ipcMain.handle('watchlist:get-entities', () => this.getEntities());
    ipcMain.handle('watchlist:get-entity', (_, id) => this.getEntity(id));
    ipcMain.handle('watchlist:save-entity', (_, entity) => this.saveEntity(entity));
    ipcMain.handle('watchlist:delete-entity', (_, id) => this.deleteEntity(id));

    ipcMain.handle('watchlist:get-tags', () => this.getTags());
    ipcMain.handle('watchlist:save-tag', (_, tag) => this.saveTag(tag));
    ipcMain.handle('watchlist:delete-tag', (_, id) => this.deleteTag(id));

    ipcMain.handle('watchlist:import', (_, json) => this.importData(json));
    ipcMain.handle('watchlist:export', () => this.exportData());

    // Search scanned users from database
    ipcMain.handle('watchlist:search-scanned-users', async (_, query: string) => {
      return databaseService.searchScannedUsers(query, 20);
    });

    ipcMain.handle('watchlist:get-scanned-user', async (_, userId: string) => {
      return databaseService.getScannedUser(userId);
    });
  }
}

export const watchlistService = new WatchlistService();

