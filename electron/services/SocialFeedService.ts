import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { serviceEventBus } from './ServiceEventBus';

const logger = log.scope('SocialFeedService');

export interface SocialFeedEntry {
    id: string; // Unique ID (timestamp + random)
    type: 'online' | 'offline' | 'location' | 'status' | 'add' | 'remove' | 'notification' | 'avatar';
    userId: string;
    displayName: string;
    timestamp: string;
    details?: string; // Location name, or status message
    data?: Record<string, unknown>; // Extra data
}

/**
 * Manages the "Social Feed" (VRCX-style feed of friend activities).
 * Persists data to `social_feed.jsonl`.
 */
class SocialFeedService {
    private isInitialized = false;
    private dbPath: string | null = null;

    // Cache for last status to avoid spamming "Location" updates if they are identical
    // or to ignore rapid online/offline toggles
    private lastStatus = new Map<string, string>();

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        serviceEventBus.on('friend-state-changed', (payload) => {
            if (!this.isInitialized) return;
            this.handleStateChange(payload);
        });
    }

    public initialize(userDataDir: string) {
        this.dbPath = path.join(userDataDir, 'social_feed.jsonl');
        this.isInitialized = true;
        this.lastStatus.clear();
        logger.info(`SocialFeedService initialized. DB: ${this.dbPath}`);
    }

    public shutdown() {
        this.isInitialized = false;
        this.dbPath = null;
        this.lastStatus.clear();
    }

    private handleStateChange(payload: { friend: any; previous: any; change: { status: boolean; location: boolean; statusDescription: boolean; representedGroup: boolean; avatar: boolean } }) {
        const { friend, previous, change } = payload;
        const userId = friend.userId;
        const displayName = friend.displayName;
        const timestamp = new Date().toISOString();

        if (!userId) return;

        let feedType: SocialFeedEntry['type'] | null = null;
        let details = '';

        if (change.status) {
            if (friend.status === 'offline') {
                feedType = 'offline';
                details = 'Went Offline';
            } else if (!previous || previous.status === 'offline') {
                feedType = 'online';
                details = 'Came Online';
            } else {
                // Status color/text change (e.g. Active -> Join Me)
                feedType = 'status';
                details = `Status changed to ${friend.status.charAt(0).toUpperCase() + friend.status.slice(1)}`;
            }
        } else if (change.statusDescription && friend.status !== 'offline') {
            feedType = 'status';
            details = `Status message: ${friend.statusDescription || 'Cleared'}`;
        } else if (change.representedGroup && friend.status !== 'offline') {
            feedType = 'status';
            details = `Now representing: ${friend.representedGroup || 'No Group'}`;
        } else if (change.avatar && friend.status !== 'offline') {
            feedType = 'avatar';
            details = 'Switched Avatar';
        }

        // Location change (only if not newly offline)
        if (change.location && friend.status !== 'offline') {
            feedType = 'location';
            details = friend.worldName || friend.location || 'Private World';

            // Map "Private World" to something nicer if it's just 'private'
            if (details === 'private') details = 'Private World';
        }

        if (feedType) {
            const entry: SocialFeedEntry = {
                id: `${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
                type: feedType,
                userId,
                displayName,
                timestamp,
                details,
                data: friend
            };
            this.appendEntry(entry);
        }
    }

    private appendEntry(entry: SocialFeedEntry) {
        if (!this.dbPath) return;
        try {
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(this.dbPath, line);
            serviceEventBus.emit('social-feed-entry-added', { entry });
        } catch (e) {
            logger.error('Failed to append social feed:', e);
        }
    }

    public async getRecentEntries(limit = 100): Promise<SocialFeedEntry[]> {
        if (!this.dbPath || !fs.existsSync(this.dbPath)) return [];
        try {
            const content = await fs.promises.readFile(this.dbPath, 'utf-8');
            const lines = content.trim().split('\n');
            return lines
                .slice(-limit)
                .map(line => {
                    try { return JSON.parse(line) as SocialFeedEntry; } catch { return null; }
                })
                .filter((e): e is SocialFeedEntry => e !== null)
                .reverse();
        } catch (e) {
            logger.error('Failed to read social feed:', e);
            return [];
        }
    }
}

export const socialFeedService = new SocialFeedService();
