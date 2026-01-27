/**
 * QuickstartService
 *
 * Manages saved worlds for quick instance launching.
 * Stores world IDs per group and provides API for launching instances.
 */

import Store from 'electron-store';
import { ipcMain } from 'electron';
import log from 'electron-log';
import { getVRChatClient, getCurrentUserId } from './AuthService';
import { networkService } from './NetworkService';
import { windowService } from './WindowService';

const logger = log.scope('QuickstartService');

export interface SavedWorld {
    worldId: string;
    name?: string;
    authorName?: string;
    imageUrl?: string;
    addedAt: number;
}

export interface LaunchOptions {
    worldId: string;
    type: 'group' | 'group+' | 'groupPublic';
    region: 'us' | 'use' | 'eu' | 'jp';
    ageGate: boolean;
    queueEnabled: boolean;
    roleIds: string[];
}

interface QuickstartStoreSchema {
    // Saved worlds per group: { groupId: SavedWorld[] }
    savedWorlds: Record<string, SavedWorld[]>;
}

class QuickstartService {
    private store: Store<QuickstartStoreSchema>;

    constructor() {
        this.store = new Store<QuickstartStoreSchema>({
            name: 'quickstart-data',
            defaults: {
                savedWorlds: {}
            }
        });
    }

    public initialize() {
        logger.info('Initializing QuickstartService...');
        this.setupHandlers();
    }

    // ============================================
    // SAVED WORLDS MANAGEMENT
    // ============================================

    public getSavedWorlds(groupId: string): SavedWorld[] {
        const allWorlds = this.store.get('savedWorlds');
        return allWorlds[groupId] || [];
    }

    public async addSavedWorld(groupId: string, worldId: string): Promise<SavedWorld | null> {
        const allWorlds = this.store.get('savedWorlds');
        const groupWorlds = allWorlds[groupId] || [];

        // Check if already exists
        if (groupWorlds.some(w => w.worldId === worldId)) {
            logger.info(`World ${worldId} already saved for group ${groupId}`);
            return groupWorlds.find(w => w.worldId === worldId) || null;
        }

        // Try to fetch world info
        let worldInfo: { name?: string; authorName?: string; imageUrl?: string } = {};
        try {
            const client = getVRChatClient();
            if (client) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (client as any).getWorld({ path: { worldId } });
                if (result.data) {
                    worldInfo = {
                        name: result.data.name,
                        authorName: result.data.authorName,
                        imageUrl: result.data.imageUrl || result.data.thumbnailImageUrl
                    };
                }
            }
        } catch (e) {
            logger.warn(`Failed to fetch world info for ${worldId}:`, e);
        }

        const savedWorld: SavedWorld = {
            worldId,
            name: worldInfo.name,
            authorName: worldInfo.authorName,
            imageUrl: worldInfo.imageUrl,
            addedAt: Date.now()
        };

        groupWorlds.push(savedWorld);
        allWorlds[groupId] = groupWorlds;
        this.store.set('savedWorlds', allWorlds);

        this.notifyUpdate(groupId);
        return savedWorld;
    }

    public removeSavedWorld(groupId: string, worldId: string): boolean {
        const allWorlds = this.store.get('savedWorlds');
        const groupWorlds = allWorlds[groupId] || [];

        const filtered = groupWorlds.filter(w => w.worldId !== worldId);
        if (filtered.length === groupWorlds.length) {
            return false; // Not found
        }

        allWorlds[groupId] = filtered;
        this.store.set('savedWorlds', allWorlds);

        this.notifyUpdate(groupId);
        return true;
    }

    // ============================================
    // INSTANCE LAUNCHING
    // ============================================

    public async launchInstance(groupId: string, options: LaunchOptions): Promise<{ success: boolean; error?: string; instanceId?: string }> {
        const client = getVRChatClient();
        if (!client) {
            return { success: false, error: 'Not authenticated' };
        }

        const currentUserId = getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'No current user' };
        }

        return networkService.execute(async () => {
            logger.info(`[QuickstartService] Creating instance for world ${options.worldId} in group ${groupId}`);

            // Map type to VRChat API format
            let instanceType: string;
            let groupAccessType: string | undefined;

            switch (options.type) {
                case 'group':
                    instanceType = 'group';
                    groupAccessType = 'members';
                    break;
                case 'group+':
                    instanceType = 'group';
                    groupAccessType = 'plus';
                    break;
                case 'groupPublic':
                    instanceType = 'group';
                    groupAccessType = 'public';
                    break;
                default:
                    instanceType = 'group';
                    groupAccessType = 'members';
            }

            // Build request body
            const body: Record<string, unknown> = {
                worldId: options.worldId,
                type: instanceType,
                region: options.region,
                ownerId: groupId,
                groupAccessType,
                queueEnabled: options.queueEnabled
            };

            // Only include ageGate if true (the API may require 18+ verification)
            if (options.ageGate) {
                body.ageGate = true;
            }

            // Include roleIds if specified
            if (options.roleIds && options.roleIds.length > 0) {
                body.roleIds = options.roleIds;
            }

            logger.debug(`[QuickstartService] Instance creation body:`, JSON.stringify(body));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (client as any).createInstance({ body });

            if (result.error) {
                throw new Error((result.error as { message?: string }).message || 'Failed to create instance');
            }

            const instanceId = result.data?.instanceId || result.data?.id;
            logger.info(`[QuickstartService] Instance created successfully: ${instanceId}`);

            return { success: true, instanceId };
        }, `quickstart:launch:${options.worldId}`).then(res => {
            if (res.success) {
                return { success: true, instanceId: res.data?.instanceId };
            }
            return { success: false, error: res.error || 'Failed to create instance' };
        });
    }

    // ============================================
    // HELPERS
    // ============================================

    private notifyUpdate(groupId: string) {
        windowService.broadcast('quickstart:update', {
            groupId,
            savedWorlds: this.getSavedWorlds(groupId)
        });
    }

    private setupHandlers() {
        // Get saved worlds for a group
        ipcMain.handle('quickstart:get-worlds', (_, groupId: string) => {
            return this.getSavedWorlds(groupId);
        });

        // Add a world to saved worlds
        ipcMain.handle('quickstart:add-world', async (_, { groupId, worldId }: { groupId: string; worldId: string }) => {
            const world = await this.addSavedWorld(groupId, worldId);
            return { success: !!world, world };
        });

        // Remove a world from saved worlds
        ipcMain.handle('quickstart:remove-world', (_, { groupId, worldId }: { groupId: string; worldId: string }) => {
            const removed = this.removeSavedWorld(groupId, worldId);
            return { success: removed };
        });

        // Launch an instance
        ipcMain.handle('quickstart:launch-instance', async (_, { groupId, options }: { groupId: string; options: LaunchOptions }) => {
            return this.launchInstance(groupId, options);
        });

        // Get group roles (forwarded to groups handler)
        ipcMain.handle('quickstart:get-roles', async (_, groupId: string) => {
            const client = getVRChatClient();
            if (!client) return { success: false, error: 'Not authenticated', roles: [] };

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (client as any).getGroupRoles({ path: { groupId } });
                if (result.error) throw result.error;
                return { success: true, roles: result.data || [] };
            } catch (e) {
                logger.error('Failed to get group roles:', e);
                return { success: false, error: (e as Error).message, roles: [] };
            }
        });

        logger.info('Quickstart handlers registered.');
    }
}

export const quickstartService = new QuickstartService();
