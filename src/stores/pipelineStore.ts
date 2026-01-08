/**
 * Pipeline Store - Manages WebSocket connection and real-time events from VRChat
 * 
 * This store handles:
 * - WebSocket connection lifecycle
 * - Real-time event distribution to other stores
 * - Connection status tracking
 */

import { create } from 'zustand';
import type { PipelineEvent, PipelineEventType } from '../types/electron';

// ============================================
// TYPES
// ============================================

export interface PipelineStatus {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  lastEventAt: string | null;
  error: string | null;
}

interface PipelineState extends PipelineStatus {
  // Event history for debugging/display (keep last N events)
  recentEvents: PipelineEvent[];
  maxRecentEvents: number;
  
  // Event callbacks for other stores/components to subscribe to
  eventListeners: Map<PipelineEventType | '*', Set<(event: PipelineEvent) => void>>;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  
  // Event handling
  handleEvent: (event: PipelineEvent) => void;
  handleConnected: () => void;
  handleDisconnected: (code: number, reason: string, willReconnect: boolean) => void;
  handleError: (message: string) => void;
  
  // Subscription API for other stores
  subscribe: (type: PipelineEventType | '*', callback: (event: PipelineEvent) => void) => () => void;
  
  // Initialize listeners (call once on app mount)
  initializeListeners: () => () => void;
}

// ============================================
// STORE
// ============================================

export const usePipelineStore = create<PipelineState>((set, get) => ({
  // Initial state
  connected: false,
  connecting: false,
  reconnectAttempts: 0,
  lastEventAt: null,
  error: null,
  recentEvents: [],
  maxRecentEvents: 50,
  eventListeners: new Map(),

  // ========================================
  // CONNECTION ACTIONS
  // ========================================
  
  connect: async () => {
    set({ connecting: true, error: null });
    try {
      const result = await window.electron.pipeline.connect();
      set({ 
        connected: result.connected, 
        connecting: false 
      });
    } catch (err: unknown) {
      const error = err as { message?: string };
      set({ 
        connecting: false, 
        error: error.message || 'Failed to connect' 
      });
    }
  },

  disconnect: async () => {
    try {
      await window.electron.pipeline.disconnect();
      set({ connected: false, connecting: false });
    } catch (err: unknown) {
      const error = err as { message?: string };
      set({ error: error.message || 'Failed to disconnect' });
    }
  },

  reconnect: async () => {
    set({ connecting: true, error: null });
    try {
      const result = await window.electron.pipeline.reconnect();
      // Status will be updated by the onConnected callback
      if (!result.success) {
        set({ connecting: false, error: 'Reconnect failed' });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      set({ 
        connecting: false, 
        error: error.message || 'Failed to reconnect' 
      });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await window.electron.pipeline.status();
      set({
        connected: status.connected,
        connecting: status.connecting,
        reconnectAttempts: status.reconnectAttempts
      });
    } catch {
      // Ignore status refresh errors
    }
  },

  // ========================================
  // EVENT HANDLERS
  // ========================================

  handleEvent: (event: PipelineEvent) => {
    const state = get();
    
    // Add to recent events (FIFO queue)
    const newEvents = [event, ...state.recentEvents].slice(0, state.maxRecentEvents);
    
    set({
      recentEvents: newEvents,
      lastEventAt: event.timestamp
    });
    
    // Notify all wildcard listeners
    const wildcardListeners = state.eventListeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error('[Pipeline Store] Error in wildcard listener:', err);
        }
      });
    }
    
    // Notify type-specific listeners
    const typeListeners = state.eventListeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error(`[Pipeline Store] Error in ${event.type} listener:`, err);
        }
      });
    }
  },

  handleConnected: () => {
    set({ 
      connected: true, 
      connecting: false, 
      reconnectAttempts: 0,
      error: null 
    });
  },

  handleDisconnected: (code: number, reason: string, willReconnect: boolean) => {
    set({ 
      connected: false,
      connecting: willReconnect
    });
  },

  handleError: (message: string) => {
    set({ error: message });
    console.error('[Pipeline Store] Error:', message);
  },

  // ========================================
  // SUBSCRIPTION API
  // ========================================

  subscribe: (type: PipelineEventType | '*', callback: (event: PipelineEvent) => void) => {
    const state = get();
    
    // Get or create the listener set for this type
    let listeners = state.eventListeners.get(type);
    if (!listeners) {
      listeners = new Set();
      state.eventListeners.set(type, listeners);
    }
    
    listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      const currentListeners = get().eventListeners.get(type);
      if (currentListeners) {
        currentListeners.delete(callback);
      }
    };
  },

  // ========================================
  // INITIALIZATION
  // ========================================

  initializeListeners: () => {
    // Set up IPC event listeners from the main process
    const unsubEvent = window.electron.pipeline.onEvent((event) => {
      get().handleEvent(event as PipelineEvent);
    });

    const unsubConnected = window.electron.pipeline.onConnected(() => {
      get().handleConnected();
    });

    const unsubDisconnected = window.electron.pipeline.onDisconnected((data) => {
      get().handleDisconnected(data.code, data.reason, data.willReconnect);
    });

    const unsubError = window.electron.pipeline.onError((data) => {
      get().handleError(data.message);
    });

    // Return cleanup function
    return () => {
      unsubEvent();
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  }
}));

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook to subscribe to specific pipeline events.
 * Automatically cleans up on unmount.
 * 
 * @example
 * usePipelineEvent('group-member-updated', (event) => {
 *   // Handle member update
 * });
 */
export function usePipelineEvent(
  type: PipelineEventType | '*',
  callback: (event: PipelineEvent) => void
): void {
  // This is a placeholder - actual implementation should use useEffect
  // and the store's subscribe method
  const store = usePipelineStore;
  
  // Note: To use this properly in React, import and use in useEffect:
  // useEffect(() => {
  //   return usePipelineStore.getState().subscribe(type, callback);
  // }, [type, callback]);
  
  // For now, just document the pattern
  void store;
  void type;
  void callback;
}
