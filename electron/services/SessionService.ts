/**
 * SessionService
 * 
 * Centralized service for VRChat session and cookie management.
 * Handles Keyv-based session persistence and cookie extraction from the VRChat SDK client.
 */

import log from 'electron-log';
import path from 'path';
import { storageService } from './StorageService';

const logger = log.scope('SessionService');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Keyv = require('keyv').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KeyvFile = require('keyv-file').default;

// ============================================
// TYPES
// ============================================

interface CookieLike {
  key?: string;
  name?: string;
  value?: string;
}

interface CookieJarLike {
  getCookiesSync?: (url: string) => CookieLike[];
  _jar?: CookieJarLike;
}

// ============================================
// SESSION STORE (Singleton)
// ============================================

let sessionStore: InstanceType<typeof Keyv> | null = null;

/**
 * Get the Keyv session store instance (lazy initialized singleton).
 * Used by VRChat SDK for cookie persistence.
 */
export function getSessionStore(): InstanceType<typeof Keyv> {
  if (!sessionStore) {
    // Store sessions in the configured data directory
    const userDataPath = storageService.getDataDir();

    // MIGRATION: Move session file to session/ subfolder
    const sessionDir = path.join(userDataPath, 'session');

    // Ensure session directory exists
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs'); // Lazy import fs if not at top level, or assume it is available. 
    // Actually, SessionService didn't import fs before. We need to check imports.
    // Looking at the file content, fs is NOT imported. I should use require('fs') safely or rely on fs-extra if available, but standard fs is fine.

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const oldFilePath = path.join(userDataPath, 'vrchat-session.json');
    const newFilePath = path.join(sessionDir, 'vrchat-session.json');

    if (fs.existsSync(oldFilePath) && !fs.existsSync(newFilePath)) {
      try {
        fs.renameSync(oldFilePath, newFilePath);
        logger.info('Migrated vrchat-session.json to session/ subfolder.');
      } catch (e) {
        logger.error('Failed to migrate session file:', e);
      }
    }

    const filePath = newFilePath;
    logger.info(`Session store path: ${filePath}`);

    const store = new KeyvFile({ filename: filePath });

    // WORKAROUND: Keyv v5+ crashes if store.opts.url is undefined during _checkIterableAdapter
    // We patch the store to satisfy Keyv's internal check
    if (!store.opts) store.opts = {};
    if (!store.opts.url) store.opts.url = 'file://';

    sessionStore = new Keyv({ store, namespace: 'vrchat' });

    // WORKAROUND 2: VRChat library might re-wrap our Keyv instance if it detects a version/instance mismatch.
    // This wrapper will check our instance's .opts.url, so we must ensure it exists.
    if (sessionStore.opts) {
      sessionStore.opts.url = 'file://';
    } else {
      sessionStore.opts = { url: 'file://' };
    }

    sessionStore.on('error', (err: Error) => {
      logger.error('Session store error:', err);
    });
  }
  return sessionStore;
}

/**
 * Clear the Keyv session store (removes all persisted VRChat cookies).
 * Used during logout or credential clearing.
 */
export async function clearSessionStore(): Promise<void> {
  try {
    const store = getSessionStore();
    await store.clear();
    logger.info('Session store cleared');
  } catch (error) {
    logger.error('Failed to clear session store:', error);
    throw error;
  }
}

// ============================================
// COOKIE EXTRACTION
// ============================================

/**
 * Extract auth cookie from VRChat SDK client instance.
 * Tries multiple strategies to locate the auth cookie in different SDK versions.
 * 
 * @param client - The VRChat SDK client instance
 * @returns The auth cookie string or undefined if not found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractAuthCookie(client: any): string | undefined {
  try {
    const clientAny = client;

    // DEBUG: Log client structure to find cookie storage
    logger.debug('[Cookie Debug] Client keys:', Object.keys(clientAny || {}));
    if (clientAny.api) {
      logger.debug('[Cookie Debug] api keys:', Object.keys(clientAny.api || {}));
      if (clientAny.api.defaults) {
        logger.debug('[Cookie Debug] api.defaults keys:', Object.keys(clientAny.api.defaults || {}));
        if (clientAny.api.defaults.headers) {
          logger.debug('[Cookie Debug] api.defaults.headers:', JSON.stringify(clientAny.api.defaults.headers, null, 2));
        }
      }
    }

    // Strategy 1: Axios Defaults (Most reliable for this SDK version)
    if (clientAny.api && clientAny.api.defaults && clientAny.api.defaults.headers) {
      const defaults = clientAny.api.defaults.headers;
      if (defaults.cookie) return defaults.cookie as string;
      if (defaults.common && defaults.common.cookie) return defaults.common.cookie as string;
      if (defaults.Cookie) return defaults.Cookie as string;
    }

    // Strategy 2: Cookie Jar (if present)
    const jar = clientAny.jar || clientAny.cookieJar || clientAny.cookies || clientAny.api?.defaults?.jar || clientAny.axios?.defaults?.jar;

    if (jar) {
      // Collect all cookies for VRChat domains
      const urlsToTry = [
        'https://api.vrchat.cloud',
        'https://vrchat.com'
      ];

      const uniqueCookies = new Map<string, string>();

      // Helper to extract from tough-cookie style jar
      const processCookie = (c: CookieLike) => {
        const key = c.key || c.name;
        const value = c.value;
        if (key && value) uniqueCookies.set(key, value);
      };

      const getCookiesFromJar = (j: CookieJarLike, url: string) => {
        if (typeof j.getCookiesSync === 'function') return j.getCookiesSync(url);
        if (j._jar && typeof j._jar.getCookiesSync === 'function') return j._jar.getCookiesSync(url);
        return [];
      };

      urlsToTry.forEach(url => {
        try {
          const found = getCookiesFromJar(jar, url);
          if (Array.isArray(found)) found.forEach(processCookie);
        } catch { /* ignore */ }
      });

      // Also check if jar itself is just an array of cookies
      if (Array.isArray(jar)) jar.forEach(processCookie);

      if (uniqueCookies.size > 0) {
        const parts: string[] = [];
        uniqueCookies.forEach((val, key) => parts.push(`${key}=${val}`));
        return parts.join('; ');
      }
    }

    // Strategy 3: Check client internal state for stored auth token
    // VRChat SDK v2 sometimes stores auth in _cookies or internal state
    if (clientAny._cookies) {
      logger.debug('Found _cookies on client');
      if (typeof clientAny._cookies === 'string') return clientAny._cookies;
      if (Array.isArray(clientAny._cookies)) {
        return clientAny._cookies.join('; ');
      }
    }

    // Check for auth token in client state
    if (clientAny.auth || clientAny._auth) {
      const auth = clientAny.auth || clientAny._auth;
      if (typeof auth === 'string') return `auth=${auth}`;
      if (auth?.token) return `auth=${auth.token}`;
    }

    return undefined;
  } catch (e) {
    logger.warn('Failed to extract auth cookie', e);
    return undefined;
  }
}

// ============================================
// SERVICE EXPORT
// ============================================

export const sessionService = {
  getSessionStore,
  clearSessionStore,
  extractAuthCookie
};
