import { ipcMain } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import { logWatcherService, PlayerJoinedEvent, LocationEvent } from './LogWatcherService';
import { oscService } from './OscService';
import { vrchatApiService } from './VRChatApiService';
import { userProfileService } from './UserProfileService';

import { serviceEventBus } from './ServiceEventBus';

const logger = log.scope('OscAnnouncementService');

export interface GroupAnnouncementConfig {
    greetingEnabled: boolean;
    greetingMessage: string;
    greetingMessageMembers?: string; // Optional custom message for members
    greetingMessageRep?: string; // Optional custom message for users representing the group
    periodicEnabled: boolean;
    periodicMessage: string;
    periodicIntervalMinutes: number;
    displayDurationSeconds?: number;
}

export interface OscAnnouncementStore {
    [groupId: string]: GroupAnnouncementConfig;
}

const DEFAULT_GROUP_CONFIG: GroupAnnouncementConfig = {
    greetingEnabled: false,
    greetingMessage: "Welcome [User] to the instance! check the description for rules.",
    greetingMessageMembers: "",
    greetingMessageRep: "",
    periodicEnabled: false,
    periodicMessage: "🛡️ This instance is protected by Group Guard.",
    periodicIntervalMinutes: 15,
    displayDurationSeconds: 10
};

class OscAnnouncementService {
    private store: Store<{ announcements: OscAnnouncementStore }>;
    private activeGroupId: string | null = null;
    private activeGroupName: string = 'Group';
    private periodicTimer: NodeJS.Timeout | null = null;
    private clearMessageTimer: NodeJS.Timeout | null = null;
    private greetedPlayers: Set<string> = new Set();
    private currentPlayers: Set<string> = new Set(); // To track who is actually here if we want to be smart

    // Local cache for group names (populated via EventBus)
    private groupNames: Map<string, string> = new Map();

    constructor() {
        this.store = new Store<{ announcements: OscAnnouncementStore }>({
            name: 'osc-announcements',
            defaults: { announcements: {} }
        });
    }

    public start() {
        this.setupLogListeners();
        // Listen for group data updates to populate local name cache
        serviceEventBus.on('groups-updated', (data: { groups: unknown[] }) => {
            if (data && Array.isArray(data.groups)) {
                let updatedCount = 0;
                (data.groups as Array<{ id?: string; name?: string }>).forEach((g) => {
                    if (g && g.id && g.name) {
                        this.groupNames.set(g.id, g.name);
                        updatedCount++;
                    }
                });
                logger.info(`Updated local group name cache with ${updatedCount} entries.`);

                // If we are currently active in a group and just learned its name, update immediately
                if (this.activeGroupId && this.groupNames.has(this.activeGroupId)) {
                    const newName = this.groupNames.get(this.activeGroupId)!;
                    if (this.activeGroupName !== newName) {
                        this.activeGroupName = newName;
                        logger.info(`Passively updated active group name to: ${this.activeGroupName}`);
                    }
                }
            }
        });
        logger.info('OscAnnouncementService started');
    }

    private setupLogListeners() {
        logWatcherService.on('location', (event: LocationEvent) => {
            if (event.instanceId) {
                this.handleLocationChange(event.instanceId);
            }
        });

        serviceEventBus.on('player-joined', (event: PlayerJoinedEvent) => {
            this.handlePlayerJoined(event);
        });

        // Handle leaving to clean up sets and allow re-greeting on rejoin
        serviceEventBus.on('player-left', (event: { displayName: string; userId?: string }) => {
            this.currentPlayers.delete(event.displayName);
            // Clear from greeted set so they can be greeted again if they rejoin
            if (event.userId) {
                this.greetedPlayers.delete(event.userId);
            }
            this.greetedPlayers.delete(event.displayName);
        });
    }

    private handleLocationChange(instanceId: string) {
        // Extract Group ID: ~group(grp_...)
        // Use looser regex to match InstanceLoggerService implementation
        const groupMatch = instanceId.match(/~group\((grp_[a-f0-9-]+)\)/);
        const newGroupId = groupMatch ? groupMatch[1] : null;

        if (!newGroupId && instanceId.includes('~group')) {
            logger.warn(`Potential group ID mismatch. raw: ${instanceId}`);
        }

        if (this.activeGroupId !== newGroupId) {
            logger.info(`Location changed. Group: ${newGroupId || 'None'} (was ${this.activeGroupId || 'None'})`);
            this.activeGroupId = newGroupId;

            // Clean up old state
            this.stopPeriodicTimer();
            this.greetedPlayers.clear();
            this.currentPlayers.clear();

            // Setup new state if valid group
            if (this.activeGroupId) {
                this.updateGroupName(this.activeGroupId);
                this.startPeriodicTimer();
            }
        }
    }

    private groupNamePromise: Promise<void> | null = null;

    private async updateGroupName(groupId: string) {
        // 1. Fast Path: Local Cache
        if (this.groupNames.has(groupId)) {
            this.activeGroupName = this.groupNames.get(groupId)!;
            logger.info(`Resolved group name from local cache: ${this.activeGroupName}`);
            return;
        }

        // 2. Slow Path: API (via Promise to avoid race conditions)
        this.groupNamePromise = (async () => {
            try {
                // Now utilizes the VRChatApiService which checks its own cache first too!
                const result = await vrchatApiService.getGroupDetails(groupId, false, { includeRoles: false });
                if (result.success && result.data) {
                    this.activeGroupName = result.data.name;
                    this.groupNames.set(groupId, result.data.name); // Update local cache
                    logger.info(`Updated active group name from API to: ${this.activeGroupName}`);
                } else {
                    this.activeGroupName = 'Group'; // Fallback
                }
            } catch (e) {
                logger.warn(`Failed to fetch group name for ${groupId}`, e);
                this.activeGroupName = 'Group';
            }
        })();

        return this.groupNamePromise;
    }

    private handlePlayerJoined(event: PlayerJoinedEvent) {
        if (!event.isBackfill) {
            logger.info(`[handlePlayerJoined] Player: ${event.displayName}, ActiveGroup: ${this.activeGroupId}, isBackfill: ${event.isBackfill}`);
        } else {
            // logger.debug(`[handlePlayerJoined] Player: ${event.displayName}, ActiveGroup: ${this.activeGroupId}, isBackfill: ${event.isBackfill}`);
        }

        this.currentPlayers.add(event.displayName);

        if (!this.activeGroupId) {
            logger.debug(`[handlePlayerJoined] No active group, skipping greeting.`);
            return;
        }

        // Ignore backfilled players (those already in the instance when we joined)
        if (event.isBackfill) {
            logger.debug(`[handlePlayerJoined] Skipping greeting for backfilled player: ${event.displayName}`);
            return;
        }

        const config = this.getGroupConfig(this.activeGroupId);
        logger.debug(`[handlePlayerJoined] Config: greetingEnabled=${config?.greetingEnabled}, greetingMessage=${!!config?.greetingMessage}`);

        if (!config || !config.greetingEnabled || !config.greetingMessage) {
            logger.debug(`[handlePlayerJoined] Greeting disabled or no message, skipping.`);
            return;
        }

        // Use userId for deduping if available, otherwise fallback to name
        const trackingId = event.userId || event.displayName;

        if (this.greetedPlayers.has(trackingId)) {
            logger.debug(`Skipping greeting for ${event.displayName} (already greeted)`);
            return;
        }

        this.greetedPlayers.add(trackingId);

        // Add to queue instead of immediate timeout
        this.addToGreetingQueue(event);
    }

    private greetingQueue: PlayerJoinedEvent[] = [];
    private isProcessingQueue = false;

    private addToGreetingQueue(event: PlayerJoinedEvent) {
        this.greetingQueue.push(event);
        this.processGreetingQueue();
    }

    private async processGreetingQueue() {
        if (this.isProcessingQueue || this.greetingQueue.length === 0) return;

        this.isProcessingQueue = true;

        try {
            while (this.greetingQueue.length > 0) {
                // Peek at first item
                const event = this.greetingQueue[0];

                // Wait 5 seconds before processing (throttle)
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Verify we are still in the group and user is relevant
                if (!this.activeGroupId) {
                    this.greetingQueue.shift(); // discard
                    continue;
                }

                // Ensure player is still in the instance (if we are tracking current players)
                if (!this.currentPlayers.has(event.displayName)) {
                    logger.debug(`Player ${event.displayName} left before greeting, skipping.`);
                    this.greetingQueue.shift();
                    continue;
                }

                await this.performGreeting(event);

                // Remove processed item
                this.greetingQueue.shift();
            }
        } catch (err) {
            logger.error('Error processing greeting queue', err);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    private async performGreeting(event: PlayerJoinedEvent) {
        if (!this.activeGroupId) return;

        // Wait for group name if pending
        if (this.groupNamePromise) {
            await this.groupNamePromise;
        }

        const currentConfig = this.getGroupConfig(this.activeGroupId);
        if (!currentConfig?.greetingEnabled) return;

        let message = currentConfig.greetingMessage;

        try {
            const client = vrchatApiService.getClient();
            if (client && event.userId && this.activeGroupId) {
                // 1. Check Rep
                if (currentConfig.greetingMessageRep) {
                    try {
                        // This is now CACHED in UserProfileService!
                        const userGroups = await userProfileService.getUserGroups(event.userId);
                        const representingGroup = userGroups.find(g => g.groupId === this.activeGroupId && g.isRepresenting);
                        if (representingGroup) message = currentConfig.greetingMessageRep;
                    } catch { /* ignore */ }
                }

                // 2. Check Membership (only if not already rep)
                if (message === currentConfig.greetingMessage && currentConfig.greetingMessageMembers) {
                    try {
                        const memResponse = await client.getGroupMember({ path: { groupId: this.activeGroupId, userId: event.userId } });
                        if (memResponse && !memResponse.error) message = currentConfig.greetingMessageMembers;
                    } catch { /* ignore */ }
                }
            }
        } catch (e) {
            logger.warn('Failed to check greeting details', e);
        }

        const finalMessage = message
            .replace(/\[User\]/gi, event.displayName)
            .replace(/\[Group\]/gi, this.activeGroupName);

        this.sendOscMessage(finalMessage, currentConfig.displayDurationSeconds);
    }

    private startPeriodicTimer() {
        if (!this.activeGroupId) return;

        const config = this.getGroupConfig(this.activeGroupId);
        if (!config || !config.periodicEnabled || !config.periodicMessage || config.periodicIntervalMinutes <= 0) return;

        logger.info(`Starting periodic announcement every ${config.periodicIntervalMinutes}m for ${this.activeGroupId}`);

        this.periodicTimer = setInterval(async () => {
            if (!this.activeGroupId) {
                this.stopPeriodicTimer();
                return;
            }

            // Wait for name if still pending (unlikely after 15m but safe)
            if (this.groupNamePromise) {
                await this.groupNamePromise;
            }

            // Re-fetch config in case it changed during interval
            const currentConfig = this.getGroupConfig(this.activeGroupId);
            if (!currentConfig?.periodicEnabled) {
                this.stopPeriodicTimer();
                return;
            }

            const message = currentConfig.periodicMessage.replace(/\[Group\]/gi, this.activeGroupName);
            this.sendOscMessage(message, currentConfig.displayDurationSeconds);

        }, config.periodicIntervalMinutes * 60 * 1000);
    }

    private stopPeriodicTimer() {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
    }

    private sendOscMessage(text: string, durationSeconds?: number) {
        // Clear pending clear-timer
        if (this.clearMessageTimer) {
            clearTimeout(this.clearMessageTimer);
            this.clearMessageTimer = null;
        }

        // VRChat Chatbox Limit is 144 chars. 
        const SAFE_TEXT = text.substring(0, 144);
        logger.info(`Sending OSC announcement: "${SAFE_TEXT}"`);
        oscService.send('/chatbox/input', [SAFE_TEXT, true, false])
            .catch(e => logger.debug('Failed to send OSC announcement', e)); // Message, Instant, No Sound

        // Schedule clear if duration is set and > 0
        if (durationSeconds && durationSeconds > 0) {
            this.clearMessageTimer = setTimeout(() => {
                logger.info('Clearing OSC announcement (duration expired)');
                oscService.send('/chatbox/input', ["", true, false])
                    .catch(e => logger.debug('Failed to clear OSC announcement', e));
                this.clearMessageTimer = null;
            }, durationSeconds * 1000);
        }
    }

    // Public API for IPC
    public getGroupConfig(groupId: string): GroupAnnouncementConfig {
        const stored = this.store.get(`announcements.${groupId}`) || {};
        return { ...DEFAULT_GROUP_CONFIG, ...stored };
    }

    public setGroupConfig(groupId: string, config: Partial<GroupAnnouncementConfig>) {
        const current = this.getGroupConfig(groupId);
        const updated = { ...current, ...config };
        this.store.set(`announcements.${groupId}`, updated);

        // If this is the active group, restart timers
        if (this.activeGroupId === groupId) {
            this.stopPeriodicTimer();
            if (updated.periodicEnabled) {
                this.startPeriodicTimer();
            }
        }

        return updated;
    }
}

export const oscAnnouncementService = new OscAnnouncementService();

export function setupOscAnnouncementHandlers() {
    // Start the service listeners
    oscAnnouncementService.start();

    ipcMain.handle('osc:get-announcement-config', (_event, groupId: string) => {
        return oscAnnouncementService.getGroupConfig(groupId);
    });

    ipcMain.handle('osc:set-announcement-config', (_event, { groupId, config }: { groupId: string, config: Partial<GroupAnnouncementConfig> }) => {
        return oscAnnouncementService.setGroupConfig(groupId, config);
    });
}
