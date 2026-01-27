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
    suppressChatboxSounds: boolean;
}

const DEFAULT_CONFIG: OscConfig = {
    enabled: false,
    senderIp: '127.0.0.1',
    senderPort: 9000,
    receiverPort: 9001,
    suppressChatboxSounds: true
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
        // Lazy init: initClient() is now called via start()
    }

    private initClient() {
        if (this.config.enabled) {
            try {
                const { senderIp, senderPort } = this.config;
                logger.info(`Initializing OSC Client with IP: ${senderIp}, Port: ${senderPort}`);
                
                // Double check we don't have a lingering client
                if (this.client) {
                    logger.warn('Existing client found during init, closing it.');
                    this.stop();
                }

                this.client = new Client(senderIp, senderPort);
                logger.info(`OSC Client initialized successfully.`);
            } catch (e) {
                logger.error('Failed to initialize OSC client', e);
            }
        }
    }

    public start() {
        if (this.client) return; // Already running
        logger.info('[OscService] Starting service...');
        this.initClient();
    }

    public stop() {
        if (this.client) {
            try {
                this.client.close();
                logger.info('[OscService] Service stopped');
            } catch (e) {
                logger.warn('Error closing OSC client', e);
            }
            this.client = null;
        }
    }

    public getConfig(): OscConfig {
        return this.config;
    }

    public setConfig(newConfig: Partial<OscConfig>) {
        this.config = { ...this.config, ...newConfig };
        this.store.set('osc', this.config);
        
        // Always restart service to apply changes (start() checks enabled flag)
        this.stop();
        this.start();
        return this.config;
    }

    public send(address: string, args: unknown[]): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.config.enabled) {
                logger.debug('OSC Send skipped: Disabled');
                // For test button purposes, this should probably be an error if we explicitly tried to send
                reject(new Error("OSC is disabled in config"));
                return;
            }

            if (this.config.enabled && !this.client) {
                logger.warn('OSC Enabled but client not initialized. Attempting lazy start...');
                this.start();
            }

            if (!this.client) {
                logger.error(`OSC Send failed: Client not initialized. Enabled=${this.config.enabled}`);
                reject(new Error("OSC Client not initialized"));
                return;
            }

            try {
                // Sound Suppression Logic
                if (address === '/chatbox/input' && this.config.suppressChatboxSounds && args.length >= 3) {
                    // Argument 2 (index 2) controls the sound. false = no sound.
                    // VRChat OSC Schema: [text, instant, sound]
                    // We modify the copy of args to ensure we don't mutate input if it's reused
                    const newArgs = [...args];
                    newArgs[2] = false;
                    args = newArgs;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.client.send(address, ...(args as any[]), (err: Error | null) => {
                    if (err) {
                        logger.error(`OSC Send Error (${address}):`, err);
                        reject(err);
                    } else {
                        logger.debug(`OSC Message sent to ${address}`);
                        resolve(true);
                    }
                });
            } catch (e) {
                logger.error(`Failed to send OSC message to ${address}`, e);
                reject(e);
            }
        });
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

    ipcMain.handle('osc:send', (_event, { address, args }: { address: string, args: unknown[] }) => {
        return oscService.send(address, args);
    });
}
