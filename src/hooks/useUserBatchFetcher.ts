import { useState, useCallback, useRef } from 'react';
import type { VRChatUser } from '../types/electron';

export interface UserBatchFetcher {
    users: Map<string, VRChatUser>;
    loading: boolean;
    fetchUsers: (userIds: string[]) => Promise<void>;
}

export const useUserBatchFetcher = (): UserBatchFetcher => {
    const [users, setUsers] = useState<Map<string, VRChatUser>>(new Map());
    const [loading, setLoading] = useState(false);

    // We use a ref to track in-flight requests to avoid duplicate fetches
    const pendingRequests = useRef<Set<string>>(new Set());

    const fetchUsers = useCallback(async (userIds: string[]) => {
        // Filter out IDs we already have or are currently fetching
        const idsToFetch = userIds.filter(id =>
            id &&
            !users.has(id) &&
            !pendingRequests.current.has(id)
        );

        if (idsToFetch.length === 0) return;

        setLoading(true);

        // Mark as pending
        idsToFetch.forEach(id => pendingRequests.current.add(id));

        try {
            // Fetch sequentially for now to be gentle on rate limits, 
            // but in parallel batches of 5 could be better if needed.
            // Using a simple loop is safest for now.
            const newUsers = new Map<string, VRChatUser>();

            await Promise.allSettled(idsToFetch.map(async (id) => {
                try {
                    const result = await window.electron.getUser(id);
                    if (result.success && result.user) {
                        newUsers.set(id, result.user);
                    }
                } catch (e) {
                    console.warn(`Failed to fetch user ${id}`, e);
                } finally {
                    pendingRequests.current.delete(id);
                }
            }));

            if (newUsers.size > 0) {
                setUsers(prev => {
                    const next = new Map(prev);
                    newUsers.forEach((user, id) => next.set(id, user));
                    return next;
                });
            }
        } finally {
            setLoading(false);
        }
    }, [users]);

    return { users, loading, fetchUsers };
};
