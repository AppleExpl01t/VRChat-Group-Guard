import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SortOption = 'members' | 'instances' | 'age' | 'alphabetical';
type SortOrder = 'asc' | 'desc';

interface GroupPreferencesState {
  // Starred/pinned group (persisted as favorite)
  starredGroupId: string | null;
  setStarredGroupId: (groupId: string | null) => void;

  // Sorting preferences (also persisted)
  sortBy: SortOption;
  sortOrder: SortOrder;
  setSortBy: (sortBy: SortOption) => void;
  setSortOrder: (sortOrder: SortOrder) => void;
  toggleSortOrder: () => void;
}

export const useGroupPreferencesStore = create<GroupPreferencesState>()(
  persist(
    (set) => ({
      // Starred group - persists as user's favorite/main group
      starredGroupId: null,
      setStarredGroupId: (groupId) => set({ starredGroupId: groupId }),

      // Sorting preferences
      sortBy: 'alphabetical',
      sortOrder: 'asc',
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      toggleSortOrder: () => set((state) => ({
        sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc'
      })),
    }),
    {
      name: 'group-preferences-storage', // localStorage key
      // Persist all preferences
      partialize: (state) => ({
        starredGroupId: state.starredGroupId,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
    }
  )
);
