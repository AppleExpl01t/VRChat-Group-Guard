/**
 * StaffService
 *
 * Manages staff whitelist for protecting users from AutoMod actions.
 * Staff members can be exempt from various moderation actions.
 */

import Store from 'electron-store';
import { ipcMain } from 'electron';
import log from 'electron-log';
import { windowService } from './WindowService';
import { getVRChatClient } from './AuthService';

const logger = log.scope('StaffService');

export interface StaffMember {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    addedAt: number;
    addedBy?: string;
    notes?: string;
}

export interface StaffProtectionSettings {
    skipAutoModScans: boolean;      // Skip AutoMod rule checks
    preventKicks: boolean;          // Prevent kick actions
    preventBans: boolean;           // Prevent ban actions
    allowAllInstances: boolean;     // Allow access to all instances (skip Instance Guard)
}

interface StaffStoreSchema {
    // Staff members per group: { groupId: StaffMember[] }
    staffMembers: Record<string, StaffMember[]>;
    // Protection settings per group: { groupId: StaffProtectionSettings }
    protectionSettings: Record<string, StaffProtectionSettings>;
}

const DEFAULT_PROTECTION_SETTINGS: StaffProtectionSettings = {
    skipAutoModScans: true,
    preventKicks: true,
    preventBans: true,
    allowAllInstances: true
};

class StaffService {
    private store: Store<StaffStoreSchema>;

    constructor() {
        this.store = new Store<StaffStoreSchema>({
            name: 'staff-data',
            defaults: {
                staffMembers: {},
                protectionSettings: {}
            }
        });
    }

    public initialize() {
        logger.info('Initializing StaffService...');
        this.setupHandlers();
    }

    // ============================================
    // STAFF MEMBER MANAGEMENT
    // ============================================

    public getStaffMembers(groupId: string): StaffMember[] {
        const allStaff = this.store.get('staffMembers');
        return allStaff[groupId] || [];
    }

    public async addStaffMember(
        groupId: string,
        userId: string,
        addedBy?: string,
        notes?: string
    ): Promise<StaffMember | null> {
        const allStaff = this.store.get('staffMembers');
        const groupStaff = allStaff[groupId] || [];

        // Check if already exists
        if (groupStaff.some(s => s.userId === userId)) {
            logger.info(`User ${userId} is already staff for group ${groupId}`);
            return groupStaff.find(s => s.userId === userId) || null;
        }

        // Try to fetch user info
        let userInfo: { displayName?: string; avatarUrl?: string } = {};
        try {
            const client = getVRChatClient();
            if (client) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (client as any).getUser({ path: { userId } });
                if (result.data) {
                    userInfo = {
                        displayName: result.data.displayName,
                        avatarUrl: result.data.currentAvatarThumbnailImageUrl || result.data.currentAvatarImageUrl
                    };
                }
            }
        } catch (e) {
            logger.warn(`Failed to fetch user info for ${userId}:`, e);
        }

        const staffMember: StaffMember = {
            userId,
            displayName: userInfo.displayName || userId,
            avatarUrl: userInfo.avatarUrl,
            addedAt: Date.now(),
            addedBy,
            notes
        };

        groupStaff.push(staffMember);
        allStaff[groupId] = groupStaff;
        this.store.set('staffMembers', allStaff);

        this.notifyUpdate(groupId);
        logger.info(`Added ${userId} as staff for group ${groupId}`);
        return staffMember;
    }

    public removeStaffMember(groupId: string, userId: string): boolean {
        const allStaff = this.store.get('staffMembers');
        const groupStaff = allStaff[groupId] || [];

        const filtered = groupStaff.filter(s => s.userId !== userId);
        if (filtered.length === groupStaff.length) {
            return false; // Not found
        }

        allStaff[groupId] = filtered;
        this.store.set('staffMembers', allStaff);

        this.notifyUpdate(groupId);
        logger.info(`Removed ${userId} from staff for group ${groupId}`);
        return true;
    }

    public updateStaffMember(groupId: string, userId: string, updates: Partial<StaffMember>): StaffMember | null {
        const allStaff = this.store.get('staffMembers');
        const groupStaff = allStaff[groupId] || [];

        const index = groupStaff.findIndex(s => s.userId === userId);
        if (index === -1) {
            return null;
        }

        groupStaff[index] = {
            ...groupStaff[index],
            ...updates,
            userId // Ensure userId can't be changed
        };

        allStaff[groupId] = groupStaff;
        this.store.set('staffMembers', allStaff);

        this.notifyUpdate(groupId);
        return groupStaff[index];
    }

    // ============================================
    // STAFF CHECK (Used by AutoMod and other services)
    // ============================================

    /**
     * Check if a user is staff for a given group
     */
    public isStaff(groupId: string, userId: string): boolean {
        const groupStaff = this.getStaffMembers(groupId);
        return groupStaff.some(s => s.userId === userId);
    }

    /**
     * Check if a user should be protected from a specific action
     */
    public shouldProtect(groupId: string, userId: string, action: keyof StaffProtectionSettings): boolean {
        if (!this.isStaff(groupId, userId)) {
            return false;
        }

        const settings = this.getProtectionSettings(groupId);
        return settings[action] === true;
    }

    // ============================================
    // PROTECTION SETTINGS
    // ============================================

    public getProtectionSettings(groupId: string): StaffProtectionSettings {
        const allSettings = this.store.get('protectionSettings');
        return allSettings[groupId] || { ...DEFAULT_PROTECTION_SETTINGS };
    }

    public setProtectionSettings(groupId: string, settings: Partial<StaffProtectionSettings>): StaffProtectionSettings {
        const allSettings = this.store.get('protectionSettings');
        const current = allSettings[groupId] || { ...DEFAULT_PROTECTION_SETTINGS };

        const updated = {
            ...current,
            ...settings
        };

        allSettings[groupId] = updated;
        this.store.set('protectionSettings', allSettings);

        this.notifyUpdate(groupId);
        logger.info(`Updated protection settings for group ${groupId}:`, updated);
        return updated;
    }

    // ============================================
    // HELPERS
    // ============================================

    private notifyUpdate(groupId: string) {
        windowService.broadcast('staff:update', {
            groupId,
            staffMembers: this.getStaffMembers(groupId),
            protectionSettings: this.getProtectionSettings(groupId)
        });
    }

    private setupHandlers() {
        // Get staff members for a group
        ipcMain.handle('staff:get-members', (_, groupId: string) => {
            return this.getStaffMembers(groupId);
        });

        // Add a staff member
        ipcMain.handle('staff:add-member', async (_, { groupId, userId, addedBy, notes }: {
            groupId: string;
            userId: string;
            addedBy?: string;
            notes?: string;
        }) => {
            const member = await this.addStaffMember(groupId, userId, addedBy, notes);
            return { success: !!member, member };
        });

        // Remove a staff member
        ipcMain.handle('staff:remove-member', (_, { groupId, userId }: { groupId: string; userId: string }) => {
            const removed = this.removeStaffMember(groupId, userId);
            return { success: removed };
        });

        // Update a staff member
        ipcMain.handle('staff:update-member', (_, { groupId, userId, updates }: {
            groupId: string;
            userId: string;
            updates: Partial<StaffMember>;
        }) => {
            const member = this.updateStaffMember(groupId, userId, updates);
            return { success: !!member, member };
        });

        // Check if a user is staff
        ipcMain.handle('staff:is-staff', (_, { groupId, userId }: { groupId: string; userId: string }) => {
            return this.isStaff(groupId, userId);
        });

        // Get protection settings
        ipcMain.handle('staff:get-settings', (_, groupId: string) => {
            return this.getProtectionSettings(groupId);
        });

        // Set protection settings
        ipcMain.handle('staff:set-settings', (_, { groupId, settings }: {
            groupId: string;
            settings: Partial<StaffProtectionSettings>;
        }) => {
            const updated = this.setProtectionSettings(groupId, settings);
            return { success: true, settings: updated };
        });

        // Search group members (for adding staff from group members)
        ipcMain.handle('staff:search-members', async (_, { groupId, query }: { groupId: string; query: string }) => {
            const client = getVRChatClient();
            if (!client) return { success: false, error: 'Not authenticated', members: [] };

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (client as any).searchGroupMembers({
                    path: { groupId },
                    query: { query, n: 20 }
                });
                if (result.error) throw result.error;
                return { success: true, members: result.data || [] };
            } catch (e) {
                logger.error('Failed to search group members:', e);
                return { success: false, error: (e as Error).message, members: [] };
            }
        });

        logger.info('Staff handlers registered.');
    }
}

export const staffService = new StaffService();
