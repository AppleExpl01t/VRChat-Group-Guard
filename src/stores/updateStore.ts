import { create } from 'zustand';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateStore {
  // State
  updateAvailable: boolean;
  updateDownloaded: boolean;
  updateInfo: UpdateInfo | null;
  downloadProgress: number | null;
  error: string | null;
  
  // Actions
  setUpdateAvailable: (info: UpdateInfo) => void;
  setUpdateDownloaded: () => void;
  setDownloadProgress: (percent: number | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  // Initial state
  updateAvailable: false,
  updateDownloaded: false,
  updateInfo: null,
  downloadProgress: null,
  error: null,
  
  // Actions
  setUpdateAvailable: (info) => set({
    updateAvailable: true,
    updateInfo: info,
    error: null
  }),
  
  setUpdateDownloaded: () => set({
    updateDownloaded: true,
    downloadProgress: null
  }),
  
  setDownloadProgress: (percent) => set({
    downloadProgress: percent
  }),
  
  setError: (error) => set({
    error,
    downloadProgress: null
  }),
  
  reset: () => set({
    updateAvailable: false,
    updateDownloaded: false,
    updateInfo: null,
    downloadProgress: null,
    error: null
  })
}));
