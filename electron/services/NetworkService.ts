import log from 'electron-log';

const logger = log.scope('NetworkService');

export interface ExecutionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}


export class TokenBucket {
    private tokens: number;
    private lastRefill: number;
    private readonly capacity: number;
    private readonly refillRate: number; // tokens per ms

    private queue: Array<{ count: number; resolve: () => void }> = [];
    private timer: NodeJS.Timeout | null = null;

    /**
     * @param capacity Max burst size (e.g. 60)
     * @param refillRate Tokens per second (e.g. 1 for 60/min)
     */
    constructor(capacity: number, refillRate: number) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.lastRefill = Date.now();
        this.refillRate = refillRate / 1000;
    }

    private refill() {
        const now = Date.now();
        const delta = now - this.lastRefill;
        const newTokens = delta * this.refillRate;

        if (newTokens > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }

    private processQueue() {
        this.refill();

        while (this.queue.length > 0) {
            const next = this.queue[0]; // Peek
            if (this.tokens >= next.count) {
                this.tokens -= next.count;
                this.queue.shift(); // Dequeue
                next.resolve();
            } else {
                // Not enough tokens yet. Schedule retry.
                const missing = next.count - this.tokens;
                const waitMs = Math.ceil(missing / this.refillRate);

                if (this.timer) clearTimeout(this.timer);

                this.timer = setTimeout(() => {
                    this.timer = null;
                    this.processQueue();
                }, waitMs);

                return; // Stop processing
            }
        }
    }

    async consume(count: number = 1): Promise<void> {
        return new Promise<void>((resolve) => {
            this.queue.push({ count, resolve });
            this.processQueue();
        });
    }
}

export const networkService = {

    /**
     * Executes a single API operation with standardized error handling.
     * @param operation The async function to execute.
     * @param context A description of the operation for logging.
     * @returns ExecutionResult
     */
    execute: async <T>(operation: () => Promise<T>, context: string, retryConfig: { maxRetries: number; baseDelay: number } = { maxRetries: 3, baseDelay: 1000 }): Promise<ExecutionResult<T>> => {
        let attempt = 0;

        while (attempt <= retryConfig.maxRetries) {
            try {
                // if (attempt > 0) logger.debug(`[Network] Retry attempt ${attempt} for: ${context}`);
                const data = await operation();

                // Minimal validation for VRChat "error" responses that aren't thrown
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (data && (data as any).error) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    throw (data as any).error;
                }

                return { success: true, data };
            } catch (error: unknown) {
                const err = error as { message?: string; response?: { status?: number; data?: { error?: { message?: string } } } };
                const status = err.response?.status;
                const msg = err.response?.data?.error?.message || err.message || 'Unknown error';

                if (status === 401) {
                    logger.warn(`[Network] 401 Unauthorized during '${context}'`);
                    return { success: false, error: 'Not authenticated' };
                }

                if (status === 429) {
                    attempt++;
                    if (attempt <= retryConfig.maxRetries) {
                        const delay = retryConfig.baseDelay * Math.pow(2, attempt - 1);
                        logger.warn(`[Network] 429 Rate Limited during '${context}'. Retrying in ${delay}ms (Attempt ${attempt}/${retryConfig.maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    } else {
                        logger.warn(`[Network] 429 Rate Limited during '${context}'. Max retries reached.`);
                        return { success: false, error: 'Rate Limited (Max Retries)' };
                    }
                }

                logger.error(`[Network] Failed '${context}': ${msg}`, error);
                return { success: false, error: msg };
            }
        }
        return { success: false, error: 'Unknown retry error' };
    },

    /**
     * Executes a list of strategies in order. Returns the result of the first successful one.
     * If all fail, returns the error from the LAST strategy.
     * @param strategies List of async functions to try.
     * @param context Description for logging.
     */
    executeWithFallback: async <T>(strategies: (() => Promise<T>)[], context: string): Promise<ExecutionResult<T>> => {
        let lastError: string | undefined = 'No strategies provided';

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            const strategyName = `Strategy ${i + 1}`;

            try {
                // logger.debug(`[Network] ${context} - Attempting ${strategyName}`);
                const data = await strategy();

                // Validate internal error fields again just in case
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (data && (data as any).error) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    throw (data as any).error;
                }

                // If we get here, it succeeded
                // logger.debug(`[Network] ${context} - Success via ${strategyName}`);
                return { success: true, data };
            } catch (e: unknown) {
                const err = e as { message?: string };
                lastError = err.message || String(e);
                logger.warn(`[Network] ${context} - ${strategyName} failed: ${lastError}`);
                // Continue to next strategy
            }
        }

        logger.error(`[Network] ${context} - All ${strategies.length} strategies failed. Last error: ${lastError}`);
        return { success: false, error: lastError };
    },

    /**
     * Helper to safely stringify objects for logging, handling BigInts.
     */
    safeStringify: (obj: unknown): string => {
        try {
            return JSON.stringify(obj, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            );
        } catch {
            return String(obj);
        }
    }
};
