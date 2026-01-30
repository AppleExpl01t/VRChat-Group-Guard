import { databaseService } from './DatabaseService';
import log from 'electron-log';
import { serviceEventBus } from './ServiceEventBus';
import { locationService } from './LocationService';

const logger = log.scope('TimeTrackingService');

/**
 * Service responsible for the "Heartbeat" mechanism of time tracking.
 * Instead of calculating "Join - Leave" duration (which fails on crash),
 * this service pulses every minute and increments counters for active users.
 */
class TimeTrackingService {
    private isInitialized = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_MS = 60 * 1000; // 1 Minute

    constructor() { }

    public initialize() {
        if (this.isInitialized) return;

        logger.info('Initializing TimeTrackingService...');
        this.isInitialized = true;
        this.startHeartbeat();
    }

    public shutdown() {
        this.stopHeartbeat();
        this.isInitialized = false;
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        logger.info('Starting Time Tracking Heartbeat (1 min interval)');

        // Initial beat after small delay
        setTimeout(() => this.pulsate(), 10000);

        this.heartbeatInterval = setInterval(() => {
            this.pulsate();
        }, this.HEARTBEAT_MS);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * The "Pulse": Increments time for all friends currently in the same instance.
     */
    private async pulsate() {
        if (!this.isInitialized) return;

        try {
            // 1. Get current instance context
            // We rely on LocationService to know who is "With Me"
            // Note: LocationService tracks where friends are. 
            // We need to know who is in the *same* instance as the current user.

            // Actually, `instanceMonitorStore` (via IPC or shared state) has the list of players in the CURRENT instance.
            // But we are in the main process. 
            // We can use the 'active players' list from `InstanceMonitorService` (if exposed) 
            // or simply ask LocationService for friends whose location matches ours? 
            // No, LocationService tracks friends *globally*.

            // Better approach: InstanceMonitorService maintains the list of `scannedEntities`.
            // We should get the list of active users from there.

            // Let's assume we can get active users via a request/getter.
            // For now, let's use a workaround: The `ScannedUser` table has `lastSeenAt`.
            // If `lastSeenAt` is within the last minute AND they are in the current group instance, we count them.
            // But that's passive.

            // Let's use the `serviceEventBus` to track active sessions? No, too stateful.
            // Best way: InstanceMonitor emits updates. 
            // Actually, we can just query the `instanceMonitor` via electron window? No.

            // Let's use the `DatabaseService` to find users seen in the last 60 seconds?
            // "Active" defined as: `lastSeenAt` > (now - 70s).
            // Updates to `ScannedUser` happen on log events (Join/Leave/Talk/Move).
            // If a user is just standing there silent, they might not update `ScannedUser`?
            // Correct. Scanner only updates on visual detection or log event.

            // Wait, `LiveView` polls? No, it's event driven.
            // BUT, `LogWatcher` receives player location updates? No, only self.

            // HYBRID LOGIC REFINEMENT:
            // Valid "Time Spent" requires the user to be in the same instance.
            // The app KNOWS who is in the instance via `currentInstanceEntities` in the renderer.
            // The Main Process might not have this state perfectly synced unless we explicitly send it.

            // ALTERNATIVE: Use `LocationService` for "Friends in same world".
            // If `currentUserLocation` == `friendLocation`.

            const myLocation = locationService.getSelfLocation(); // We'll need to implement this
            if (!myLocation || !myLocation.instanceId) return;

            const friends = locationService.getAllFriends();
            const friendsWithMe = friends.filter(f =>
                f.location === 'private' ? false : // Can't track private
                    f.location === myLocation.location // String match (world:instance)
            );

            if (friendsWithMe.length === 0) return;

            logger.debug(`[Heartbeat] Tracking time for ${friendsWithMe.length} friends...`);

            // Batch update DB
            await this.incrementTime(friendsWithMe.map(f => f.userId));

            // Emit live update event for UI
            serviceEventBus.emit('friend-stats-updated', {
                userIds: friendsWithMe.map(f => f.userId),
                addedMinutes: 1
            });

        } catch (e) {
            logger.error('[Heartbeat] Failed:', e);
        }
    }

    private async incrementTime(userIds: string[]) {
        const client = databaseService.getClient();
        const now = new Date();

        // Transaction for safety
        await (client as any).$transaction(
            userIds.map(userId =>
                // @ts-ignore
                (client as any).friendStats.upsert({
                    where: { userId },
                    create: {
                        userId,
                        displayName: 'Unknown', // Will be updated by enricher later
                        timeSpentMinutes: 1,
                        encounterCount: 1,
                        lastSeen: now,
                        lastHeartbeat: now
                    },
                    update: {
                        timeSpentMinutes: { increment: 1 },
                        lastSeen: now,
                        lastHeartbeat: now
                    }
                })
            )
        );
        logger.debug(`[Heartbeat] Incremented time for ${userIds.length} users.`);
    }

    /**
     * Retrieves aggregated stats for a user from the authoritative database.
     */
    public async getPlayerStats(userId: string) {
        if (!this.isInitialized) return null;
        try {
            const client = databaseService.getClient();
            // @ts-ignore
            const stats = await (client as any).friendStats.findUnique({
                where: { userId }
            });
            return stats;
        } catch (e) {
            logger.error(`Failed to get stats for ${userId}:`, e);
            return null;
        }
    }
}

export const timeTrackingService = new TimeTrackingService();
