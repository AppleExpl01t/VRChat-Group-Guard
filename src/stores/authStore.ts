import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  displayName: string;
  userIcon: string;
  bio?: string;
  status?: string;
  statusDescription?: string;
  tags?: string[];
  currentAvatarThumbnailImageUrl?: string;
  // Add other fields as needed
}

type AuthStatus = 'idle' | 'checking' | 'logging-in' | 'verifying-2fa';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  status: AuthStatus;
  user: User | null;
  requires2FA: boolean;
  error: string | null;
  rememberMe: boolean;

  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  checkSession: () => Promise<void>;
  autoLogin: () => Promise<{ success: boolean; requires2FA?: boolean }>;

  hasSavedCredentials: () => Promise<boolean>;
  loadSavedCredentials: () => Promise<{ username: string; password: string; authCookie?: string } | null>;
  logout: (clearSaved?: boolean) => Promise<void>;
  setRememberMe: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: false,
  status: 'idle',
  user: null,
  requires2FA: false,
  error: null,
  rememberMe: false,

  login: async (username, password, rememberMe) => {
    set({ isLoading: true, status: 'logging-in', error: null });
    try {
      const result = await window.electron.login({ username, password, rememberMe: rememberMe ?? get().rememberMe });
      
      if (result.success) {
        set({ 
          isAuthenticated: true, 
          user: result.user, 
          isLoading: false, 
          status: 'idle',
          requires2FA: false 
        });
      } else if (result.requires2FA) {
        set({ requires2FA: true, isLoading: false, status: 'idle', error: null });
      } else {
        set({ error: result.error || 'Login failed', isLoading: false, status: 'idle' });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      set({ error: error.message || 'Login failed', isLoading: false, status: 'idle' });
    }
  },

  verify2FA: async (code) => {
    set({ isLoading: true, status: 'verifying-2fa', error: null });
    try {
      const result = await window.electron.verify2fa({ code });
      if (result.success) {
        set({ 
          isAuthenticated: true, 
          user: result.user, 
          isLoading: false, 
          status: 'idle',
          requires2FA: false 
        });
      } else {
        set({ error: result.error || 'Invalid Code', isLoading: false, status: 'idle' });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      set({ error: error.message || 'Verification failed', isLoading: false, status: 'idle' });
    }
  },

  checkSession: async () => {
    set({ isLoading: true, status: 'checking' });
    try {
      const result = await window.electron.checkSession();
      if (result.isLoggedIn) {
        set({ isAuthenticated: true, user: result.user, isLoading: false, status: 'idle' });
      } else {
        set({ isAuthenticated: false, isLoading: false, status: 'idle' });
      }
    } catch {
      set({ isAuthenticated: false, isLoading: false, status: 'idle' });
    }
  },

  autoLogin: async () => {
    set({ isLoading: true, status: 'logging-in', error: null });
    try {
      const result = await window.electron.autoLogin();
      
      if (result.success) {
        set({ 
          isAuthenticated: true, 
          user: result.user, 
          isLoading: false, 
          status: 'idle',
          requires2FA: false 
        });
        return { success: true };
      } else if (result.requires2FA) {
        set({ requires2FA: true, isLoading: false, status: 'idle', error: null });
        return { success: false, requires2FA: true };
      } else if (result.noCredentials) {
        // No saved credentials - not an error, just show login screen
        set({ isLoading: false, status: 'idle', error: null });
        return { success: false };
      } else {
        // Session expired or restoration failed - just show login screen
        set({ isLoading: false, status: 'idle', error: null });
        return { success: false };
      }
    } catch (err: unknown) {
      // Catch any errors silently - just show login screen
      console.error('Auto-login error:', err);
      set({ isLoading: false, status: 'idle', error: null });
      return { success: false };
    }
  },
  
  hasSavedCredentials: async () => {
    try {
      return await window.electron.hasSavedCredentials();
    } catch {
      return false;
    }
  },

  loadSavedCredentials: async () => {
    try {
      return await window.electron.loadSavedCredentials();
    } catch {
      return null;
    }
  },

  logout: async (clearSaved = false) => {
    await window.electron.logout({ clearSaved });
    set({ isAuthenticated: false, user: null, requires2FA: false, rememberMe: false });
  },
  
  setRememberMe: (value) => {
    set({ rememberMe: value });
  }
}));
