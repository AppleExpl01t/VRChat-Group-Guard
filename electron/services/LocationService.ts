import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import { serviceEventBus } from './ServiceEventBus';
import { windowService } from './WindowService';

const logger = log.scope('LocationService');

export interface FriendLocation {
    userId: string;
    displayName: string;
    status: string; // 'active', 'busy', 'join me', 'offline'
    location: string; // 'wrld_...:12345' or 'offline'
    worldName?: string;
    lastUpdated: string; // ISO timestamp
    userIcon?: string;
    profilePicOverride?: string;
    currentAvatarThumbnailImageUrl?: string;
    statusDescription?: string;
    representedGroup?: string;
}

/**
 * Manages Friend Locations and Status.
 * Listens to VRChat Pipeline events via ServiceEventBus (or direct IPC if we hook it up).
 * Persists a "snapshot" of friend states so we have data on startup.
 */
class LocationService {
    private isInitialized = false;
    private snapshotPath: string | null = null;
    private friends = new Map<string, FriendLocation>();

    constructor() {
        // Setup listeners
        // Note: PipelineService emits via windowService.broadcast usually.
        // But we need to listen internally. 
        // We should add a listener to the IPC or just make PipelineService emit to a NodeJS event emitter too.
        // For now, let's assume we can listen to `serviceEventBus` if we bridge it, 
        // OR we can expose a method `updateFriendStatus` that PipelineService calls.

        // BETTER ARCHITECTURE: PipelineService should emit events to `serviceEventBus`.
        // I will need to update PipelineService to emit 'friend-update' to the bus.
    }

    public initialize(userDataDir: string) {
        this.snapshotPath = path.join(userDataDir, 'friend_locations.json');
        this.loadSnapshot();
        this.isInitialized = true;
        logger.info('LocationService initialized.');
    }

    public shutdown() {
        this.persistSnapshot();
        this.friends.clear();
        this.isInitialized = false;
    }

    /**
     * Called by PipelineService or other inputs when a friend updates.
     */
    public updateFriend(data: Partial<FriendLocation> & { userId: string }) {
        if (!this.isInitialized) return;

        const existing = this.friends.get(data.userId) || {
            userId: data.userId,
            displayName: data.displayName || 'Unknown',
            status: 'offline',
            location: 'offline',
            lastUpdated: new Date().toISOString()
        };

        const isNowOffline = data.status === 'offline';
        const statusChanged = data.status !== undefined && data.status !== existing.status;
        const locationChanged = data.location !== undefined && data.location !== existing.location;
        const descriptionChanged = data.statusDescription !== undefined && data.statusDescription !== existing.statusDescription;
        const groupChanged = data.representedGroup !== undefined && data.representedGroup !== existing.representedGroup;
        const avatarChanged = data.currentAvatarThumbnailImageUrl !== undefined && data.currentAvatarThumbnailImageUrl !== existing.currentAvatarThumbnailImageUrl;

        const updated: FriendLocation = {
            ...existing,
            ...data,
            // If marking as offline, explicitly clear the location
            location: isNowOffline ? 'offline' : (data.location || existing.location),
            // Preserve existing images if the new data doesn't have them
            userIcon: data.userIcon || existing.userIcon,
            profilePicOverride: data.profilePicOverride || existing.profilePicOverride,
            currentAvatarThumbnailImageUrl: data.currentAvatarThumbnailImageUrl || existing.currentAvatarThumbnailImageUrl,
            representedGroup: data.representedGroup || existing.representedGroup,
            lastUpdated: new Date().toISOString()
        };

        this.friends.set(data.userId, updated);

        // Emit state change event if something actually changed
        if (statusChanged || locationChanged || descriptionChanged || groupChanged || avatarChanged) {
            if (isNowOffline) {
                logger.info(`Friend ${updated.displayName} (${updated.userId}) went offline.`);
            } else if (locationChanged) {
                logger.info(`Friend ${updated.displayName} switched location to: ${updated.location}`);
            }

            serviceEventBus.emit('friend-state-changed', {
                friend: updated,
                previous: existing,
                change: {
                    status: statusChanged,
                    location: locationChanged,
                    statusDescription: descriptionChanged,
                    representedGroup: groupChanged,
                    avatar: avatarChanged
                }
            });
        }
    }

    /**
     * Bulk update from API (initial fetch)
     */
    public setFriends(friendsList: FriendLocation[]) {
        const newIds = new Set(friendsList.map(f => f.userId));

        // 1. Mark existing friends as offline if they are NOT in the new list (bulk update)
        for (const [userId, friend] of this.friends.entries()) {
            if (!newIds.has(userId) && friend.status !== 'offline') {
                logger.info(`Purging stale friend ${friend.displayName} (${userId}) - missing from online API list.`);

                const previous = { ...friend };
                friend.status = 'offline';
                friend.location = 'offline';
                friend.lastUpdated = new Date().toISOString();

                serviceEventBus.emit('friend-state-changed', {
                    friend: { ...friend },
                    previous,
                    change: { status: true, location: true, statusDescription: false, representedGroup: false, avatar: false }
                });
            }
        }

        // 2. Update/Add from the new list
        for (const f of friendsList) {
            const existing = this.friends.get(f.userId);
            const statusChanged = !existing || existing.status !== f.status;
            const locationChanged = !existing || existing.location !== f.location;
            const descriptionChanged = !existing || existing.statusDescription !== f.statusDescription;
            const groupChanged = !existing || existing.representedGroup !== f.representedGroup;
            const avatarChanged = !existing || existing.currentAvatarThumbnailImageUrl !== f.currentAvatarThumbnailImageUrl;

            if (statusChanged || locationChanged || descriptionChanged || groupChanged || avatarChanged) {
                serviceEventBus.emit('friend-state-changed', {
                    friend: f,
                    previous: existing,
                    change: { status: statusChanged, location: locationChanged, statusDescription: descriptionChanged, representedGroup: groupChanged, avatar: avatarChanged }
                });
            }
            this.friends.set(f.userId, f);
        }
        this.persistSnapshot();
    }

    public getAllFriends(): FriendLocation[] {
        return Array.from(this.friends.values());
    }

    private loadSnapshot() {
        if (!this.snapshotPath || !fs.existsSync(this.snapshotPath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8'));
            if (Array.isArray(data)) {
                for (const f of data) {
                    this.friends.set(f.userId, f);
                }
            }
        } catch (e) {
            logger.warn('Failed to load friend snapshot:', e);
        }
    }

    private persistSnapshot() {
        if (!this.snapshotPath) return;
        try {
            const data = Array.from(this.friends.values());
            fs.writeFileSync(this.snapshotPath, JSON.stringify(data, null, 2));
        } catch (e) {
            logger.error('Failed to save friend snapshot:', e);
        }
    }
}

export const locationService = new LocationService();
