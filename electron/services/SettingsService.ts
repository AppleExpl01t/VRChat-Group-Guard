import { dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';

const logger = log.scope('SettingsService');

export interface AppSettings {
    audio: {
        notificationSoundPath: string | null;
        volume: number;
    };
    notifications: {
        enabled: boolean; // Master toggle
        types: {
            join: boolean;
            leave: boolean;
            automod: boolean;
            friend: boolean;
        };
        behavior: {
            desktop: boolean; // Windows Toast
            sound: boolean;   // Play Sound
            taskbarFlash: boolean;
        };
    };
}

const defaultSettings: AppSettings = {
    audio: {
        notificationSoundPath: null, // null means default
        volume: 0.6
    },
    notifications: {
        enabled: true,
        types: {
            join: true,
            leave: true,
            automod: true,
            friend: true
        },
        behavior: {
            desktop: true,
            sound: true,
            taskbarFlash: true
        }
    }
};

class SettingsService {
    private store: Store<AppSettings>;

    constructor() {
        this.store = new Store<AppSettings>({
            name: 'app-settings',
            defaults: defaultSettings
        });
    }

    public initialize() {
        logger.info('Settings Service Initialized');
        // Validate paths?
    }

    public getSettings(): AppSettings {
        return this.store.store;
    }

    public updateSettings(settings: Partial<AppSettings>) {
        this.store.set(settings);
        return this.store.store;
    }

    public async selectAudioFile(window: BrowserWindow): Promise<{ path: string; name: string; data?: string } | null> {
        const result = await dialog.showOpenDialog(window, {
            properties: ['openFile'],
            filters: [
                { name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);

        try {
            // Read file and convert to base64 for immediate preview/usage without CSP issues
            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = `data:audio/${path.extname(filePath).slice(1)};base64,${fileBuffer.toString('base64')}`;

            return {
                path: filePath,
                name: fileName,
                data: base64Data
            };
        } catch (error) {
            logger.error(`Failed to read audio file: ${filePath}`, error);
            throw new Error(`Failed to read audio file: ${error}`);
        }
    }

    public getAudioData(filePath: string): string | null {
        if (!filePath) return null;
        try {
            if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                return `data:audio/${path.extname(filePath).slice(1)};base64,${fileBuffer.toString('base64')}`;
            }
            return null;
        } catch (error) {
            logger.error(`Failed to load audio: ${filePath}`, error);
            return null;
        }
    }
}

export const settingsService = new SettingsService();
