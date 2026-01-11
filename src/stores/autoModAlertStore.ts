import { create } from 'zustand';

export interface AutoModViolation {
  id: string; // unique ID
  userId: string;
  displayName: string;
  action: 'REJECT' | 'AUTO_BLOCK';
  reason: string;
  timestamp: number;
  skipped?: boolean;
}

interface AutoModAlertStore {
  alerts: AutoModViolation[];
  isEnabled: boolean;
  addAlert: (violation: Omit<AutoModViolation, 'id' | 'timestamp'>) => void;
  removeAlert: (id: string) => void;
  clearAll: () => void;
  toggleEnabled: () => void;
  setEnabled: (enabled: boolean) => void;
}

export const useAutoModAlertStore = create<AutoModAlertStore>((set) => ({
  alerts: [],
  isEnabled: true, // Default to true? User asked for toggle.
  
  addAlert: (violation) => set((state) => {
    if (!state.isEnabled) return {}; // Don't add if disabled
    
    // Play sound here? Ideally UI component handles sound to avoid side effects in store
    
    // Prevent duplicate alerts for same user within short time?
    // User asked: "popup needs to be able to update if multiple people have failed automod at once"
    // So we stack them.
    
    return {
      alerts: [
        ...state.alerts,
        {
          ...violation,
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now()
        }
      ]
    };
  }),

  removeAlert: (id) => set((state) => ({
    alerts: state.alerts.filter((a) => a.id !== id)
  })),

  clearAll: () => set({ alerts: [] }),
  
  toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
  setEnabled: (enabled) => set({ isEnabled: enabled })
}));
