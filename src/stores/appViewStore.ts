import { create } from 'zustand';

// Define the available views in the application
export type AppView = 'main' | 'moderation' | 'instances' | 'audit' | 'database' | 'settings' | 'live' | 'watchlist' | 'friendship';

interface AppViewState {
    currentView: AppView;
    setView: (view: AppView) => void;
}

export const useAppViewStore = create<AppViewState>((set) => ({
    currentView: 'main',
    setView: (view) => set({ currentView: view }),
}));
