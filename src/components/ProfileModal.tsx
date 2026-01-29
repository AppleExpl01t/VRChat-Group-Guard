import React, { useState } from 'react';

type ProfileType = 'user' | 'world' | 'group';

interface ProfileData {
    type: ProfileType;
    id: string;
    name?: string;
}

interface ProfileModalProps {
    profile: ProfileData | null;
    onClose: () => void;
    openUserProfile?: (id: string, name?: string) => void;
    openWorldProfile?: (id: string, name?: string) => void;
    openGroupProfile?: (id: string, name?: string) => void;
}

import { UserProfileModal } from './modals/UserProfileModal';
import { WorldProfileModal } from './modals/WorldProfileModal';
import { GroupProfileModal } from './modals/GroupProfileModal';

export const ProfileModal: React.FC<ProfileModalProps> = ({
    profile,
    onClose,
    openUserProfile,
    openWorldProfile,
    openGroupProfile
}) => {
    if (!profile) return null;

    if (profile.type === 'user') {
        return <UserProfileModal
            userId={profile.id}
            onClose={onClose}
            openWorldProfile={openWorldProfile}
            openGroupProfile={openGroupProfile}
        />;
    }

    if (profile.type === 'world') {
        return <WorldProfileModal
            worldId={profile.id}
            onClose={onClose}
        />;
    }

    if (profile.type === 'group') {
        return <GroupProfileModal
            groupId={profile.id}
            onClose={onClose}
            openUserProfile={openUserProfile}
        />;
    }

    return null;
};

// Hook for managing profile modal state
export const useProfileModal = () => {
    const [profile, setProfile] = useState<ProfileData | null>(null);

    const openUserProfile = (userId: string, name?: string) => {
        setProfile({ type: 'user', id: userId, name });
    };

    const openWorldProfile = (worldId: string, name?: string) => {
        setProfile({ type: 'world', id: worldId, name });
    };

    const openGroupProfile = (groupId: string, name?: string) => {
        setProfile({ type: 'group', id: groupId, name });
    };

    const closeProfile = () => {
        setProfile(null);
    };

    return {
        profile,
        openUserProfile,
        openWorldProfile,
        openGroupProfile,
        closeProfile
    };
};
