import { EventEmitter } from 'events';
import log from 'electron-log';

const logger = log.scope('ServiceEventBus');

export type ServiceEventType =
    | 'groups-updated'
    | 'groups-raw'
    | 'groups-cache-ready'
    | 'auth-changed' // Add more as needed
    | 'group-verified'
    | 'friend-update'
    | 'friend-state-changed'
    | 'social-feed-entry-added'
    | 'friendship-relationship-changed'
    | 'player-joined'
    | 'player-left'
    | 'location'
    | 'friend-stats-updated';

export interface ServiceEventPayloads {
    'location': {
        location: string;
        worldId?: string;
        instanceId?: string;
        worldName?: string;
        timestamp?: string
    };
    'friend-stats-updated': { userIds: string[]; addedMinutes: number };
    'groups-updated': { groups: { id: string;[key: string]: unknown }[] };
    'groups-raw': { groups: { id: string;[key: string]: unknown }[]; userId: string };
    'groups-cache-ready': { groupIds: string[] };
    'auth-changed': { userId: string | null };
    'group-verified': { group: { id: string;[key: string]: unknown } };
    'friend-update': { type: string; content: Record<string, unknown>; timestamp: string };
    'friend-state-changed': {
        friend: any;
        previous: any;
        change: {
            status: boolean;
            location: boolean;
            statusDescription: boolean;
            representedGroup: boolean;
            avatar: boolean;
        };
    };
    'social-feed-entry-added': { entry: any };
    'player-joined': {
        displayName: string;
        userId?: string;
        timestamp: string;
        isBackfill?: boolean;
    };
    'player-left': {
        displayName: string;
        userId?: string;
        timestamp: string;
        isBackfill?: boolean;
    };
    'friendship-relationship-changed': { event: any };
}

class ServiceEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(20); // Allow more listeners than default
    }

    public emit<K extends keyof ServiceEventPayloads>(event: K, payload: ServiceEventPayloads[K]): boolean {
        logger.debug(`Emitting event: ${event}`);
        return super.emit(event, payload);
    }

    public on<K extends keyof ServiceEventPayloads>(event: K, listener: (payload: ServiceEventPayloads[K]) => void): this {
        return super.on(event, listener);
    }

    public off<K extends keyof ServiceEventPayloads>(event: K, listener: (payload: ServiceEventPayloads[K]) => void): this {
        return super.off(event, listener);
    }
}

export const serviceEventBus = new ServiceEventBus();
