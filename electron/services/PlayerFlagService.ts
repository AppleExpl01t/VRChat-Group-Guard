import { ipcMain } from 'electron';
import log from 'electron-log';
import { databaseService } from './DatabaseService';

const logger = log.scope('PlayerFlagService');

export interface PlayerFlag {
    id: string;
    label: string;
    description: string;
    type: 'negative' | 'positive';
    color: string;
}

export const PRESET_FLAGS: PlayerFlag[] = [
    // Negative Flags
    { id: 'nsfw', label: 'NSFW', description: 'Displays inappropriate content', type: 'negative', color: '#ff4444' },
    { id: 'trolling', label: 'Trolling', description: 'Intentionally annoying others', type: 'negative', color: '#ff4444' },
    { id: 'hate-speech', label: 'Hate Speech', description: 'Uses offensive/discriminatory language', type: 'negative', color: '#ff4444' },
    { id: 'threatening', label: 'Threatening', description: 'Makes threats against others', type: 'negative', color: '#ff4444' },
    { id: 'extremist', label: 'Extremist', description: 'Promotes extremist beliefs', type: 'negative', color: '#ff4444' },
    { id: 'child-safety', label: 'Child Safety', description: 'Threats against children', type: 'negative', color: '#ff0000' },
    { id: 'abusive', label: 'Abusive', description: 'Verbally or emotionally abusive', type: 'negative', color: '#ff4444' },
    { id: 'crasher', label: 'Crasher', description: 'Uses malicious avatars to crash clients', type: 'negative', color: '#ff0000' },
    { id: 'doxxer', label: 'Doxxer', description: 'Reveals private information about others', type: 'negative', color: '#ff0000' },
    { id: 'exploit-bug-abuse', label: 'Exploit/Bug Abuse', description: 'Abuses game exploits or bugs', type: 'negative', color: '#ff4444' },
    { id: 'earrape', label: 'Earrape', description: 'Uses excessively loud/harmful audio', type: 'negative', color: '#ff4444' },
    { id: 'stalking', label: 'Stalking', description: 'Follows users maliciously across instances', type: 'negative', color: '#ff6b6b' },
    { id: 'ripped-avatar', label: 'Ripped Assets', description: 'Uses stolen/ripped avatar or world assets', type: 'negative', color: '#ff6b6b' },
    { id: 'impersonation', label: 'Impersonation', description: 'Pretends to be staff or another user', type: 'negative', color: '#ff4444' },
    { id: 'malicious-osc', label: 'Malicious OSC', description: 'Uses OSC to disrupt or spam others', type: 'negative', color: '#ff4444' },
    { id: 'spamming', label: 'Spamming', description: 'Spams chat, invites, or notifications', type: 'negative', color: '#ff4444' },
    { id: 'catfishing', label: 'Catfishing', description: 'Deception regarding identity/intentions', type: 'negative', color: '#ff4444' },
    { id: 'scammer', label: 'Scammer', description: 'Known for fraudulent activities/scams', type: 'negative', color: '#ff4444' },
    { id: 'modified-client', label: 'Modified Client', description: 'Uses unauthorized client modifications', type: 'negative', color: '#ff0000' },

    // Positive Flags
    { id: 'streamer', label: 'Streamer', description: 'Content creator / Streamer', type: 'positive', color: '#00c853' },
    { id: 'youtuber', label: 'YouTuber', description: 'YouTube content creator', type: 'positive', color: '#00c853' },
    { id: 'playermod', label: 'PlayerMod', description: 'Known game moderator', type: 'positive', color: '#00c853' },
    { id: 'world-creator', label: 'World Creator', description: 'Known VRChat world creator', type: 'positive', color: '#00c853' },
    { id: 'avatar-creator', label: 'Avatar Creator', description: 'Known VRChat avatar creator', type: 'positive', color: '#00c853' },
    { id: 'event-host', label: 'Event Host', description: 'Organizes community events', type: 'positive', color: '#00c853' },
    { id: 'vouched', label: 'Vouched', description: 'Vouched for by staff or community', type: 'positive', color: '#00c853' },
    { id: 'donator', label: 'Donator', description: 'Community supporter / Donator', type: 'positive', color: '#00c853' },
    { id: 'artist', label: 'Artist', description: 'Known community artist', type: 'positive', color: '#00c853' },
    { id: 'helper', label: 'Helper', description: 'Helpful and active community member', type: 'positive', color: '#00c853' },
    { id: 'community-leader', label: 'Community Leader', description: 'Leads a VRChat group or community', type: 'positive', color: '#00c853' },
    { id: 'dj', label: 'DJ', description: 'Known VRChat DJ / Musician', type: 'positive', color: '#00c853' },
    { id: 'photographer', label: 'Photographer', description: 'Known VRChat photographer', type: 'positive', color: '#00c853' },
];

class PlayerFlagService {
    constructor() { }

    public async getPlayerFlags(userId: string): Promise<string[]> {
        try {
            const user = await databaseService.getScannedUser(userId);
            if (!user || !user.flags) return [];

            return JSON.parse(user.flags);
        } catch (error) {
            logger.error(`Failed to get flags for user ${userId}:`, error);
            return [];
        }
    }

    public async setPlayerFlags(userId: string, flagIds: string[]): Promise<boolean> {
        try {
            const prisma = databaseService.getClient();
            const flagsJson = JSON.stringify(flagIds);

            // We use raw query because prisma generate might not have finished successfully in all environments
            await prisma.$executeRawUnsafe(
                `UPDATE ScannedUser SET flags = ? WHERE id = ?`,
                flagsJson,
                userId
            );

            return true;
        } catch (error) {
            logger.error(`Failed to set flags for user ${userId}:`, error);
            return false;
        }
    }

    public getFlagDefinitions(): PlayerFlag[] {
        return PRESET_FLAGS;
    }

    public setupHandlers() {
        ipcMain.handle('playerFlags:getFlags', async (_, userId: string) => {
            return await this.getPlayerFlags(userId);
        });

        ipcMain.handle('playerFlags:setFlags', async (_, { userId, flagIds }: { userId: string, flagIds: string[] }) => {
            return await this.setPlayerFlags(userId, flagIds);
        });

        ipcMain.handle('playerFlags:getDefinitions', () => {
            return this.getFlagDefinitions();
        });
    }
}

export const playerFlagService = new PlayerFlagService();
