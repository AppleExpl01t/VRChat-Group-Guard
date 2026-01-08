import { ipcMain } from 'electron';
import { Client } from 'node-osc';
import Store from 'electron-store';
import log from 'electron-log';

const logger = log.scope('OscService');

export interface OscConfig {
    enabled: boolean;
    senderIp: string;
    senderPort: number;
    receiverPort: number; // For future server use
}

const DEFAULT_CONFIG: OscConfig = {
    enabled: false,
    senderIp: '127.0.0.1',
    senderPort: 9000,
    receiverPort: 9001
};

class OscService {
    private client: Client | null = null;
    private store: Store<{ osc: OscConfig }>;
    private config: OscConfig;

    constructor() {
        this.store = new Store<{ osc: OscConfig }>({
            name: 'osc-config',
            defaults: { osc: DEFAULT_CONFIG }
        });
        this.config = this.store.get('osc');
        this.initClient();
    }

    private initClient() {
        if (this.client) {
            try {
                this.client.close();
            } catch (e) {
                logger.warn('Error closing OSC client', e);
            }
            this.client = null;
        }

        if (this.config.enabled) {
            try {
                logger.info(`Initializing OSC Client to ${this.config.senderIp}:${this.config.senderPort}`);
                this.client = new Client(this.config.senderIp, this.config.senderPort);
            } catch (e) {
                logger.error('Failed to initialize OSC client', e);
            }
        }
    }

    public getConfig(): OscConfig {
        return this.config;
    }

    public setConfig(newConfig: Partial<OscConfig>) {
        this.config = { ...this.config, ...newConfig };
        this.store.set('osc', this.config);
        this.initClient();
        return this.config;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public send(address: string, args: any[]) {
        if (!this.client || !this.config.enabled) {
             // Silently fail if disabled, or return false?
             // If expressly called while disabled, maybe warn.
             if (!this.config.enabled) logger.debug('OSC Send skipped: Disabled');
             return false;
        }

        try {
            this.client.send(address, ...args);
            return true;
        } catch (e) {
            logger.error(`Failed to send OSC message to ${address}`, e);
            return false;
        }
    }
}

export const oscService = new OscService();

export function setupOscHandlers() {
    ipcMain.handle('osc:get-config', () => {
        return oscService.getConfig();
    });

    ipcMain.handle('osc:set-config', (_event, config: Partial<OscConfig>) => {
        logger.info('Updating OSC Config', config);
        return oscService.setConfig(config);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcMain.handle('osc:send', (_event, { address, args }: { address: string, args: any[] }) => {
        return oscService.send(address, args);
    });
}
