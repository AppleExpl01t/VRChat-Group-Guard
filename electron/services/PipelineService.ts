/**
 * VRChat Pipeline WebSocket Service
 * 
 * Connects to VRChat's real-time WebSocket API for live event streaming.
 * Based on: https://vrchat.community/websocket
 * Reference: VRCX implementation (reference repos/VRCX/src/service/websocket.js)
 * 
 * Events supported:
 * - Notifications (invites, friend requests)
 * - Friend status changes (online, offline, location)
 * - User updates (current user profile changes)
 * - Group events (member updates, role changes, join/leave)
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import WebSocket from 'ws';
import { vrchatApiService } from './VRChatApiService';
import { processGroupJoinNotification } from './AutoModService';
import { windowService } from './WindowService';
import { serviceEventBus } from './ServiceEventBus';

// ============================================
// CONSTANTS
// ============================================

const PIPELINE_URL = 'wss://pipeline.vrchat.cloud';
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const AUTO_RECONNECT_INTERVAL = 10 * 60 * 1000; // 10 minutes

// ============================================
// STATE
// ============================================

let webSocket: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let periodicReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastMessageData = '';
let isConnecting = false;
let isManualDisconnect = false;

// ============================================
// TYPES
// ============================================

/** Pipeline event types from VRChat WebSocket API */
export type PipelineEventType =
  // Notification Events
  | 'notification'
  | 'notification-v2'
  | 'notification-v2-update'
  | 'notification-v2-delete'
  | 'see-notification'
  | 'hide-notification'
  | 'response-notification'
  | 'clear-notification'
  // Friend Events
  | 'friend-add'
  | 'friend-delete'
  | 'friend-online'
  | 'friend-active'
  | 'friend-offline'
  | 'friend-update'
  | 'friend-location'
  // User Events
  | 'user-update'
  | 'user-location'
  | 'user-badge-assigned'
  | 'user-badge-unassigned'
  | 'content-refresh'
  // Group Events
  | 'group-joined'
  | 'group-left'
  | 'group-member-updated'
  | 'group-role-updated';

interface PipelineMessage {
  type: PipelineEventType;
  content: unknown;
  err?: string;
}

interface PipelineEvent {
  type: PipelineEventType;
  content: Record<string, unknown>;
  timestamp: string;
}

// ============================================
// AUTH TOKEN FETCHING
// ============================================

/**
 * Fetches the auth token required for WebSocket connection.
 * VRChat requires a call to GET /auth to retrieve the WebSocket token.
 */
async function fetchAuthToken(): Promise<string | null> {
  try {
    const client = vrchatApiService.getClient();
    if (!client) {
      log.warn('[Pipeline] No VRChat client available for auth token fetch');
      return null;
    }

    // The VRChat SDK should have a method to get auth info
    // Looking at VRCX, they call: request('auth', { method: 'GET' })
    // which returns { ok: true, token: "authcookie_..." }

    // Try using the SDK's internal methods
    const clientAny = client as unknown as Record<string, unknown>;

    // Strategy 1: Try getAuth if available
    if (typeof clientAny.getAuth === 'function') {
      log.debug('[Pipeline] Using getAuth method');
      const response = await (clientAny.getAuth as () => Promise<{ data?: { ok?: boolean; token?: string } }>)();
      const data = response?.data;
      if (data?.ok && data?.token) {
        log.info('[Pipeline] Got auth token via getAuth');
        return data.token;
      }
    }

    // Strategy 2: Try direct API call if client supports it
    if (typeof clientAny.get === 'function') {
      log.debug('[Pipeline] Using client.get for auth endpoint');
      const response = await (clientAny.get as (path: string) => Promise<{ data?: { ok?: boolean; token?: string } }>)('auth');
      const data = response?.data;
      if (data?.ok && data?.token) {
        log.info('[Pipeline] Got auth token via client.get');
        return data.token;
      }
    }

    // Strategy 3: Try to extract from the client's cookie jar
    // The auth token for WebSocket is the same as the auth cookie value
    if (clientAny.jar || clientAny.cookieJar) {
      log.debug('[Pipeline] Attempting to extract token from cookie jar');
      const jar = (clientAny.jar || clientAny.cookieJar) as {
        getCookiesSync?: (url: string) => Array<{ key?: string; name?: string; value?: string }>;
        _jar?: { getCookiesSync?: (url: string) => Array<{ key?: string; name?: string; value?: string }> };
      };

      let cookies: Array<{ key?: string; name?: string; value?: string }> = [];

      if (typeof jar.getCookiesSync === 'function') {
        cookies = jar.getCookiesSync('https://api.vrchat.cloud');
      } else if (jar._jar && typeof jar._jar.getCookiesSync === 'function') {
        cookies = jar._jar.getCookiesSync('https://api.vrchat.cloud');
      }

      const authCookie = cookies.find(c => (c.key || c.name) === 'auth');
      if (authCookie?.value) {
        // The token format is "authcookie_..." which is the cookie value
        log.info('[Pipeline] Got auth token from cookie jar');
        return `authcookie_${authCookie.value}`;
      }
    }

    // Strategy 4: Manual fetch using node-fetch or similar
    // This is a fallback - we make a direct HTTP request to the auth endpoint
    log.debug('[Pipeline] Fallback: Making direct HTTP request to /auth');

    // Get cookies from the client to include in the request
    // This requires the client to expose its cookie handling

    log.warn('[Pipeline] Could not obtain auth token - all strategies exhausted');
    return null;

  } catch (error: unknown) {
    const err = error as { message?: string };
    log.error('[Pipeline] Failed to fetch auth token:', err.message);
    return null;
  }
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

/**
 * Connects to the VRChat Pipeline WebSocket.
 */
async function connectWebSocket(): Promise<boolean> {
  if (webSocket !== null || isConnecting) {
    log.debug('[Pipeline] Already connected or connecting');
    return false;
  }

  if (!vrchatApiService.isAuthenticated()) {
    log.warn('[Pipeline] Cannot connect - not authenticated');
    return false;
  }

  isConnecting = true;
  isManualDisconnect = false;

  try {
    const token = await fetchAuthToken();

    if (!token) {
      log.error('[Pipeline] Cannot connect - no auth token available');
      isConnecting = false;
      return false;
    }

    const url = `${PIPELINE_URL}/?authToken=${token}`;
    log.info('[Pipeline] Connecting to VRChat Pipeline WebSocket...');

    const socket = new WebSocket(url, {
      headers: {
        'User-Agent': 'VRChatGroupGuard/1.0.0 (admin@groupguard.app)'
      }
    });

    socket.onopen = () => {
      log.info('[Pipeline] WebSocket connected successfully');
      isConnecting = false;
      reconnectAttempts = 0;
      webSocket = socket;

      // Notify renderer that pipeline is connected
      emitToRenderer('pipeline:connected', { connected: true });

      // Start periodic auto-reconnect timer
      startPeriodicReconnect();
    };

    socket.onclose = (event: WebSocket.CloseEvent) => {
      log.info(`[Pipeline] WebSocket closed: code=${event.code}, reason=${event.reason}`);

      // Stop periodic timer on close
      stopPeriodicReconnect();

      if (webSocket === socket) {
        webSocket = null;
      }

      isConnecting = false;

      // Notify renderer
      emitToRenderer('pipeline:disconnected', {
        code: event.code,
        reason: event.reason,
        willReconnect: !isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      });

      // Auto-reconnect if not manually disconnected
      if (!isManualDisconnect && vrchatApiService.isAuthenticated()) {
        scheduleReconnect();
      }
    };

    socket.onerror = (error: WebSocket.ErrorEvent) => {
      log.error('[Pipeline] WebSocket error:', error.message || 'Unknown error');
      emitToRenderer('pipeline:error', { message: error.message || 'WebSocket error' });
    };

    socket.onmessage = (event: WebSocket.MessageEvent) => {
      try {
        handleMessage(event.data.toString());
      } catch (err: unknown) {
        const error = err as { message?: string };
        log.error('[Pipeline] Error handling message:', error.message);
      }
    };

    return true;

  } catch (error: unknown) {
    const err = error as { message?: string };
    log.error('[Pipeline] Connection error:', err.message);
    isConnecting = false;
    scheduleReconnect();
    return false;
  }
}

/**
 * Schedules a reconnection attempt with exponential backoff.
 */
function scheduleReconnect(): void {
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.warn('[Pipeline] Max reconnect attempts reached, giving up');
    emitToRenderer('pipeline:reconnect-failed', {
      attempts: reconnectAttempts
    });
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts, 5); // Cap at 25s

  log.info(`[Pipeline] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (vrchatApiService.isAuthenticated() && !webSocket && !isConnecting && !isManualDisconnect) {
      connectWebSocket();
    }
  }, delay);
}

/**
 * Disconnects the WebSocket.
 */
function disconnectWebSocket(): void {
  isManualDisconnect = true;

  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (webSocket !== null) {
    log.info('[Pipeline] Disconnecting WebSocket...');
    try {
      webSocket.close(1000, 'Manual disconnect');
    } catch (err) {
      log.warn('[Pipeline] Error closing WebSocket:', err);
    }
    webSocket = null;
  }

  reconnectAttempts = 0;
  isConnecting = false;
}

/**
 * Starts the periodic auto-reconnect timer.
 */
function startPeriodicReconnect(): void {
  stopPeriodicReconnect(); // Ensure no duplicates

  log.info(`[Pipeline] Starting periodic auto-reconnect timer (${AUTO_RECONNECT_INTERVAL / 1000 / 60}m)`);

  periodicReconnectTimer = setTimeout(() => {
    log.info('[Pipeline] Triggering scheduled auto-reconnection for stability...');
    forceReconnect().catch(err => {
      log.error('[Pipeline] Scheduled auto-reconnect failed:', err);
    });
  }, AUTO_RECONNECT_INTERVAL);
}

/**
 * Stops the periodic auto-reconnect timer.
 */
function stopPeriodicReconnect(): void {
  if (periodicReconnectTimer) {
    clearTimeout(periodicReconnectTimer);
    periodicReconnectTimer = null;
  }
}

/**
 * Forces a reconnection (disconnect -> connect).
 */
export async function forceReconnect(): Promise<boolean> {
  log.info('[Pipeline] Force reconnect initiated');

  // We don't want the standard "onclose" reconnection logic to fire,
  // so we treat it as a manual disconnect initially, then reset.
  disconnectWebSocket();

  // Reset state for a fresh connection
  isManualDisconnect = false;
  reconnectAttempts = 0;

  // Small optional delay to ensure socket creates cleanly?
  // Usually immediate is fine, but a tiny tick helps.
  await new Promise(resolve => setTimeout(resolve, 100));

  const success = await connectWebSocket();
  return success;
}

// ============================================
// MESSAGE HANDLING
// ============================================

/**
 * Handles incoming WebSocket messages.
 */
function handleMessage(data: string): void {
  // Dedupe identical messages (VRChat sometimes sends duplicates)
  if (lastMessageData === data) {
    return;
  }
  lastMessageData = data;

  let message: PipelineMessage;

  try {
    message = JSON.parse(data);

    // VRChat double-encodes content as a JSON string
    if (typeof message.content === 'string') {
      try {
        message.content = JSON.parse(message.content);
      } catch {
        // Content is not JSON, keep as string
      }
    }
  } catch {
    log.warn('[Pipeline] Failed to parse message:', data.substring(0, 100));
    return;
  }

  // Handle errors from the pipeline
  if (message.err) {
    log.error('[Pipeline] Server error:', message.err);
    emitToRenderer('pipeline:server-error', { error: message.err });
    return;
  }

  // Log the event
  log.debug(`[Pipeline] Event: ${message.type}`, JSON.stringify(message.content).substring(0, 200));

  // Create a standardized event
  const event: PipelineEvent = {
    type: message.type,
    content: message.content as Record<string, unknown>,
    timestamp: new Date().toISOString()
  };

  // Emit to renderer
  emitToRenderer('pipeline:event', event);

  // Emit to internal Service Bus for Backend Services (FriendshipManager)
  // We map pipeline events to service bus events if needed, or generic 'pipeline-event'
  // But for now let's just emit specific ones we care about
  if (['friend-online', 'friend-offline', 'friend-location', 'friend-update'].includes(event.type)) {
    serviceEventBus.emit('friend-update', event);
  }

  // Handle specific event types that may need additional processing
  handleSpecificEvent(event);
}

/**
 * Handles specific event types that may need server-side processing.
 */
function handleSpecificEvent(event: PipelineEvent): void {
  switch (event.type) {
    case 'group-member-updated':
      log.info('[Pipeline] Group member updated:', event.content);
      break;

    case 'group-role-updated':
      log.info('[Pipeline] Group role updated:', event.content);
      break;

    case 'group-joined':
    case 'group-left':
      log.info(`[Pipeline] Group ${event.type}:`, event.content);
      break;

    case 'notification':
    case 'notification-v2':
      log.info('[Pipeline] Notification received:', event.content);
      // Process group join request notifications via AutoMod
      processGroupJoinNotification(event.content as {
        type?: string;
        senderUserId?: string;
        senderUsername?: string;
        details?: { groupId?: string; groupName?: string };
      }).catch(err => log.error('[Pipeline] AutoMod notification processing error:', err));
      break;

    case 'friend-online':
    case 'friend-offline':
    case 'friend-location':
      log.debug(`[Pipeline] Friend ${event.type}:`, event.content);
      break;

    case 'user-update':
      log.info('[Pipeline] Current user updated:', event.content);
      break;

    default:
      // Other events are just forwarded to renderer
      break;
  }
}

// ============================================
// IPC BRIDGE
// ============================================

/**
 * Emits an event to all renderer windows.
 */
function emitToRenderer(channel: string, data: unknown): void {
  windowService.broadcast(channel, data);
}

/**
 * Sets up IPC handlers for the Pipeline service.
 */
export function setupPipelineHandlers(): void {
  // Connect to pipeline
  ipcMain.handle('pipeline:connect', async () => {
    log.info('[Pipeline] Connect requested');
    const success = await connectWebSocket();
    return { success, connected: webSocket !== null };
  });

  // Disconnect from pipeline
  ipcMain.handle('pipeline:disconnect', () => {
    log.info('[Pipeline] Disconnect requested');
    disconnectWebSocket();
    return { success: true };
  });

  // Get connection status
  ipcMain.handle('pipeline:status', () => {
    return {
      connected: webSocket !== null && webSocket.readyState === WebSocket.OPEN,
      connecting: isConnecting,
      reconnectAttempts
    };
  });

  // Force reconnect
  ipcMain.handle('pipeline:reconnect', async () => {
    log.info('[Pipeline] Reconnect requested via IPC');
    const success = await forceReconnect();
    return { success };
  });
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Call this when the user logs in to auto-connect to the pipeline.
 */
export function onUserLoggedIn(): void {
  log.info('[Pipeline] User logged in, connecting to pipeline...');
  // Small delay to ensure auth is fully set up
  setTimeout(async () => {
    await connectWebSocket();
    // AutoMod gatekeeper processing is now triggered by GroupService
    // when group authorization is initialized

    // Initialize FriendshipService (VRCX-style tracking)
    const currentUserId = getCurrentUserId();
    if (currentUserId) {
      // Dynamic import to avoid cycles if necessary, or using the imported instance
      // Assuming we import it at the top level: import { friendshipService } from './FriendshipService';
      await friendshipService.initialize(currentUserId);
    } else {
      log.warn('[Pipeline] User logged in but ID missing, skipping FriendshipService init');
    }
  }, 1000);
}

import { friendshipService } from './FriendshipService';
import { getCurrentUserId } from './AuthService';

// ...

/**
 * Call this when the user logs out to disconnect from the pipeline.
 */
export function onUserLoggedOut(): void {
  log.info('[Pipeline] User logged out, disconnecting from pipeline');
  disconnectWebSocket();
  friendshipService.shutdown().catch(err => log.error('[Pipeline] FriendshipService shutdown failed:', err));
}

/**
 * Check if the pipeline is currently connected.
 */
export function isPipelineConnected(): boolean {
  return webSocket !== null && webSocket.readyState === WebSocket.OPEN;
}
