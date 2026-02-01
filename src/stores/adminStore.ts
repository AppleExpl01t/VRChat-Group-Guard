import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AdminState {
  // Ritual Progress
  ritualStep: number; // 0: Not started, 1: Shield clicked 5x, 2: Icon clicked 5x, 3: Password entered
  shieldClickCount: number;
  iconClickCount: number;

  // Unlock State
  isAdminUnlocked: boolean;

  // Session
  adminSessionToken: string | null;
  adminUser: { id: number; username: string; role: 'owner' | 'admin' } | null;
  failedLoginAttempts: number;

  // Actions
  incrementShieldClick: () => void;
  incrementIconClick: () => void;
  completeRitual: () => void;
  resetAdminAccess: () => void;
  setAdminSession: (token: string | null, user?: { id: number; username: string; role: 'owner' | 'admin' } | null) => void;
  recordFailedLogin: () => void;
  resetFailedLogins: () => void;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      // Initial State
      ritualStep: 0,
      shieldClickCount: 0,
      iconClickCount: 0,
      isAdminUnlocked: false,
      adminSessionToken: null,
      adminUser: null,
      failedLoginAttempts: 0,

      // Increment Profile Click (Step 1 of Ritual - click user profile in TitleBar)
      incrementShieldClick: () => {
        const newCount = get().shieldClickCount + 1;
        set({ shieldClickCount: newCount });
        if (newCount >= 5 && get().ritualStep === 0) {
          set({ ritualStep: 1 });
          console.log('[Admin Ritual] Step 1 complete: Profile clicked 5 times');
        }
      },

      // Increment Icon Click (Step 2 of Ritual - only works after Step 1)
      incrementIconClick: () => {
        if (get().ritualStep < 1) return; // Must have completed step 1
        const newCount = get().iconClickCount + 1;
        set({ iconClickCount: newCount });
        if (newCount >= 5 && get().ritualStep === 1) {
          set({ 
            ritualStep: 2,
            isAdminUnlocked: true, // Auto-unlock button when Ritual completes
            shieldClickCount: 0,
            iconClickCount: 0,
          });
          console.log('[Admin Ritual] Complete! Admin button unlocked.');
        }
      },

      // Complete Ritual (Called after password entry)
      completeRitual: () => {
        set({
          ritualStep: 3,
          isAdminUnlocked: true,
          shieldClickCount: 0,
          iconClickCount: 0,
        });
        console.log('[Admin Ritual] Complete! Admin button unlocked.');
      },

      // Reset Admin Access (Hide button, require ritual again)
      resetAdminAccess: () => {
        set({
          ritualStep: 0,
          shieldClickCount: 0,
          iconClickCount: 0,
          isAdminUnlocked: false,
          adminSessionToken: null,
          adminUser: null,
          failedLoginAttempts: 0,
        });
        console.log('[Admin Ritual] Access reset. Button hidden.');
      },

      // Set Admin Session Token (After successful login)
      setAdminSession: (token, user = null) => {
        set({ adminSessionToken: token, adminUser: user, failedLoginAttempts: 0 });
      },

      // Record Failed Login (Lockout after 3)
      recordFailedLogin: () => {
        const attempts = get().failedLoginAttempts + 1;
        set({ failedLoginAttempts: attempts });
        if (attempts >= 3) {
          console.warn('[Admin Lockout] 3 failed attempts. Resetting access.');
          get().resetAdminAccess();
        }
      },

      // Reset Failed Logins (On successful login)
      resetFailedLogins: () => {
        set({ failedLoginAttempts: 0 });
      },
    }),
    {
      name: 'groupguard-admin-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist unlock state and session, not ritual progress
      partialize: (state) => ({
        isAdminUnlocked: state.isAdminUnlocked,
        adminSessionToken: state.adminSessionToken,
        adminUser: state.adminUser,
      }),
      // Handle corrupted storage data gracefully
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[AdminStore] Error rehydrating from storage:', error);
          // Clear corrupted data
          localStorage.removeItem('groupguard-admin-store');
        } else if (state) {
          console.log('[AdminStore] Hydrated:', { isAdminUnlocked: state.isAdminUnlocked });
        }
      },
      // Ensure proper merging even with partial/corrupted data
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }
        return {
          ...currentState,
          ...(persistedState as Partial<AdminState>),
        };
      },
    }
  )
);
