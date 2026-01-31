/**
 * UserProfileService
 * 
 * Comprehensive user profile fetching service matching VRCX capabilities.
 * Retrieves all publicly available user data from the VRChat API.
 */

import { ipcMain, app } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { getAuthCookieStringAsync } from './AuthService';
import { vrchatApiService } from './VRChatApiService';
import { networkService } from './NetworkService';
import { getTrustRank, type TrustRank } from './EntityEnrichmentService';

import { LRUCache } from 'lru-cache';

const logger = log.scope('UserProfileService');

// Cache configuration
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const userGroupsCache = new LRUCache<string, UserGroup[]>({
    max: 500,
    ttl: CACHE_TTL_MS
});

// ============================================
// TYPES - Complete VRChat User Profile
// ============================================

export interface VRChatBadge {
    badgeId: string;
    badgeName: string;
    badgeDescription: string;
    badgeImageUrl: string;
    showcased: boolean;
    hidden?: boolean;
}

export interface VRChatUserProfile {
    // Core Identity
    id: string;
    displayName: string;
    bio: string;
    bioLinks: string[];
    pronouns: string;
    userIcon: string;
    profilePicOverride: string;
    profilePicOverrideThumbnail: string;

    // Trust & Verification
    tags: string[];
    developerType: string;
    ageVerificationStatus: string;
    ageVerified: boolean;
    badges: VRChatBadge[];

    // Avatar
    currentAvatarImageUrl: string;
    currentAvatarThumbnailImageUrl: string;
    currentAvatarTags: string[];
    allowAvatarCopying: boolean;

    // Presence & Location
    status: string;
    statusDescription: string;
    state: string;
    location: string;
    worldId: string;
    instanceId: string;
    travelingToWorld: string;
    travelingToInstance: string;
    travelingToLocation: string;
    platform: string;
    last_platform: string;
    last_login: string;
    last_activity: string;
    last_mobile: string | null;

    // Social
    isFriend: boolean;
    friendKey: string;
    friendRequestStatus: string;
    note: string | null;

    // Account Info
    date_joined: string;
}

export interface EnrichedUserProfile extends VRChatUserProfile {
    // Computed fields (VRCX-style, prefixed with $)
    $trustLevel: TrustRank;
    $trustClass: string;
    $isVRCPlus: boolean;
    $isModerator: boolean;
    $isTroll: boolean;
    $isProbableTroll: boolean;
    $languages: { key: string; value: string }[];
    $fetchedAt: number;
}

export interface MutualCounts {
    friends: number;
    groups: number;
}

export interface MutualFriend {
    id: string;
    displayName: string;
    currentAvatarThumbnailImageUrl?: string;
    status?: string;
}

export interface MutualGroup {
    id: string;
    name: string;
    iconUrl?: string;
    memberCount?: number;
}

export interface UserFeedback {
    id: string;
    type: string;
    reason?: string;
    createdAt: string;
}

// User's public group memberships (from GET /users/{userId}/groups)
export interface UserGroup {
    id: string;           // Group membership ID (gmem_...)
    groupId: string;      // Actual group ID (grp_...)
    name: string;
    shortCode: string;
    discriminator: string;
    description: string;
    iconId?: string;
    iconUrl?: string;
    bannerId?: string;
    bannerUrl?: string;
    privacy: string;
    ownerId: string;
    memberCount: number;
    memberVisibility: string;
    isRepresenting: boolean;
    mutualGroup: boolean;
    lastPostCreatedAt?: string;
    lastPostReadAt?: string;
}

export interface FullUserProfileData {
    profile: EnrichedUserProfile;
    mutualCounts?: MutualCounts;
    mutualFriends?: MutualFriend[];
    mutualGroups?: MutualGroup[];
    userGroups?: UserGroup[];  // All public groups the user belongs to
    feedback?: UserFeedback[];
}

// Language mappings from VRChat config
const LANGUAGE_MAP: Record<string, string> = {
    eng: 'English',
    kor: 'Korean',
    rus: 'Russian',
    spa: 'Spanish',
    por: 'Portuguese',
    zho: 'Chinese',
    deu: 'German',
    jpn: 'Japanese',
    fra: 'French',
    swe: 'Swedish',
    nld: 'Dutch',
    pol: 'Polish',
    dan: 'Danish',
    nor: 'Norwegian',
    ita: 'Italian',
    tha: 'Thai',
    fin: 'Finnish',
    hun: 'Hungarian',
    ces: 'Czech',
    tur: 'Turkish',
    ara: 'Arabic',
    ron: 'Romanian',
    vie: 'Vietnamese',
    ukr: 'Ukrainian',
    ase: 'American Sign Language',
    bfi: 'British Sign Language',
    dse: 'Dutch Sign Language',
    fsl: 'French Sign Language',
    kvk: 'Korean Sign Language'
};

// Trust class mapping for CSS
const TRUST_CLASS_MAP: Record<TrustRank, string> = {
    'Visitor': 'x-tag-untrusted',
    'New User': 'x-tag-basic',
    'User': 'x-tag-basic',
    'Known': 'x-tag-known',
    'Trusted': 'x-tag-trusted',
    'Veteran': 'x-tag-veteran',
    'Legend': 'x-tag-legend',
    'Unknown': 'x-tag-unknown'
};

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

class UserProfileService {
    private notesPath: string | null = null;
    private notesCache = new Map<string, string>(); // userId -> note
    private isNotesInitialized = false;

    constructor() {
        this.initializeNotes();
    }

    private initializeNotes() {
        try {
            const userData = app.getPath('userData');
            this.notesPath = path.join(userData, 'user_notes.json');

            if (fs.existsSync(this.notesPath)) {
                const content = fs.readFileSync(this.notesPath, 'utf8');
                const data = JSON.parse(content);
                // Migrate object to Map
                Object.entries(data).forEach(([key, value]) => {
                    this.notesCache.set(key, String(value));
                });
                logger.info(`[UserProfile] Loaded ${this.notesCache.size} notes.`);
            }
            this.isNotesInitialized = true;
        } catch (e) {
            logger.error('[UserProfile] Failed to initialize notes:', e);
        }
    }

    private saveNotes() {
        if (!this.notesPath) return;
        try {
            const obj = Object.fromEntries(this.notesCache);
            fs.writeFileSync(this.notesPath, JSON.stringify(obj, null, 2));
        } catch (e) {
            logger.error('[UserProfile] Failed to save notes:', e);
        }
    }

    public async setUserNote(userId: string, note: string) {
        if (!userId) return;

        // If empty, delete
        if (!note || !note.trim()) {
            this.notesCache.delete(userId);
        } else {
            this.notesCache.set(userId, note.trim());
        }

        this.saveNotes();
    }
    /**
     * Get comprehensive user profile with computed fields
     */
    async getFullProfile(userId: string): Promise<EnrichedUserProfile | null> {
        // Use centralized service (with caching)
        const result = await vrchatApiService.getUser(userId);

        if (!result.success || !result.data) {
            logger.error(`Failed to fetch profile for ${userId}:`, result.error);
            return null;
        }

        // VRCUser needs to be cast to VRChatUserProfile because VRCUser is a subset/variant 
        // effectively compatible for our enrichment needs, but let's be safe.
        // In reality, VRChatApiService returns the full object from the API.
        const profileData = result.data as unknown as VRChatUserProfile;

        return this.enrichProfile(profileData);
    }

    /**
     * Get mutual counts (friends and groups in common)
     */
    async getMutualCounts(userId: string): Promise<MutualCounts | null> {
        const cookie = await getAuthCookieStringAsync();
        if (!cookie) {
            throw new Error('Not authenticated');
        }

        const result = await networkService.execute(async () => {
            logger.debug(`Fetching mutual counts for: ${userId}`);
            const response = await fetch(`https://api.vrchat.cloud/api/1/users/${userId}/mutuals`, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            // DEBUG: Log raw response to understand API structure
            logger.info(`[DEBUG] mutualCounts raw response for ${userId}: ${JSON.stringify(data)}`);
            return data as MutualCounts;
        }, `getMutualCounts:${userId}`);

        if (!result.success) {
            logger.warn(`Failed to fetch mutual counts for ${userId}:`, result.error);
            return null;
        }

        return result.data || null;
    }

    /**
     * Get list of mutual friends
     */
    async getMutualFriends(userId: string, n = 50): Promise<MutualFriend[]> {
        const cookie = await getAuthCookieStringAsync();
        if (!cookie) {
            throw new Error('Not authenticated');
        }

        const result = await networkService.execute(async () => {
            logger.debug(`Fetching mutual friends for: ${userId}`);
            const response = await fetch(`https://api.vrchat.cloud/api/1/users/${userId}/mutuals/friends?n=${n}`, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json() as MutualFriend[];
        }, `getMutualFriends:${userId}`);

        if (!result.success || !result.data) {
            logger.warn(`Failed to fetch mutual friends for ${userId}`);
            return [];
        }

        return Array.isArray(result.data) ? result.data : [];
    }

    /**
     * Get list of mutual groups
     */
    async getMutualGroups(userId: string, n = 50): Promise<MutualGroup[]> {
        const cookie = await getAuthCookieStringAsync();
        if (!cookie) {
            throw new Error('Not authenticated');
        }

        const result = await networkService.execute(async () => {
            logger.debug(`Fetching mutual groups for: ${userId}`);
            const response = await fetch(`https://api.vrchat.cloud/api/1/users/${userId}/mutuals/groups?n=${n}`, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json() as MutualGroup[];
        }, `getMutualGroups:${userId}`);

        if (!result.success || !result.data) {
            logger.warn(`Failed to fetch mutual groups for ${userId}`);
            return [];
        }

        return Array.isArray(result.data) ? result.data : [];
    }

    /**
     * Get user feedback/reports (if accessible)
     */
    async getUserFeedback(userId: string): Promise<UserFeedback[]> {
        const cookie = await getAuthCookieStringAsync();
        if (!cookie) {
            throw new Error('Not authenticated');
        }

        const result = await networkService.execute(async () => {
            logger.debug(`Fetching feedback for: ${userId}`);
            const response = await fetch(`https://api.vrchat.cloud/api/1/users/${userId}/feedback?n=100`, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json() as UserFeedback[];
        }, `getUserFeedback:${userId}`);

        if (!result.success || !result.data) {
            logger.warn(`Failed to fetch feedback for ${userId} (may require permissions)`);
            return [];
        }

        return Array.isArray(result.data) ? result.data : [];
    }

    /**
     * Get all public groups a user belongs to
     */
    async getUserGroups(userId: string): Promise<UserGroup[]> {
        const cookie = await getAuthCookieStringAsync();
        if (!cookie) {
            throw new Error('Not authenticated');
        }

        // Check cache first
        const cached = userGroupsCache.get(userId);
        if (cached) {
            logger.debug(`Returning cached user groups for: ${userId}`);
            return cached;
        }

        const result = await networkService.execute(async () => {
            logger.debug(`Fetching user groups for: ${userId}`);
            const response = await fetch(`https://api.vrchat.cloud/api/1/users/${userId}/groups`, {
                method: 'GET',
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'VRChat Group Guard/1.0'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json() as UserGroup[];
        }, `getUserGroups:${userId}`);

        // Cache successful results
        if (result.success && result.data && Array.isArray(result.data)) {
            userGroupsCache.set(userId, result.data);
        }

        if (!result.success || !result.data) {
            logger.warn(`Failed to fetch user groups for ${userId}`);
            return [];
        }

        return Array.isArray(result.data) ? result.data : [];
    }

    /**
     * Get all available data for a user (comprehensive fetch)
     */
    async getCompleteUserData(userId: string): Promise<FullUserProfileData | null> {
        logger.info(`========================================`);
        logger.info(`[UserProfile] Starting complete data fetch for: ${userId}`);
        logger.info(`========================================`);

        const profile = await this.getFullProfile(userId);
        if (!profile) {
            logger.error(`[UserProfile] ❌ Failed to fetch base profile`);
            return null;
        }

        // Log all profile fields
        logger.info(`[UserProfile] ✅ Base Profile Retrieved:`);
        logger.info(`  ├─ displayName: ${profile.displayName}`);
        logger.info(`  ├─ id: ${profile.id}`);
        logger.info(`  ├─ bio: ${profile.bio ? `${profile.bio.substring(0, 50)}...` : '(empty)'}`);
        logger.info(`  ├─ bioLinks: ${profile.bioLinks?.length || 0} links`);
        logger.info(`  ├─ pronouns: ${profile.pronouns || '(none)'}`);
        logger.info(`  ├─ status: ${profile.status}`);
        logger.info(`  ├─ statusDescription: ${profile.statusDescription || '(none)'}`);
        logger.info(`  ├─ state: ${profile.state}`);
        logger.info(`  ├─ location: ${profile.location || '(hidden)'}`);
        logger.info(`  ├─ platform: ${profile.platform || profile.last_platform || '(unknown)'}`);
        logger.info(`  ├─ isFriend: ${profile.isFriend}`);
        logger.info(`  ├─ date_joined: ${profile.date_joined}`);
        logger.info(`  ├─ last_login: ${profile.last_login}`);
        logger.info(`  ├─ ageVerificationStatus: ${profile.ageVerificationStatus || '(none)'}`);
        logger.info(`  ├─ developerType: ${profile.developerType || 'none'}`);
        logger.info(`  ├─ tags: ${profile.tags?.length || 0} tags`);
        logger.info(`  ├─ badges: ${profile.badges?.length || 0} badges`);
        logger.info(`  ├─ userIcon: ${profile.userIcon ? 'Yes' : 'No'}`);
        logger.info(`  ├─ profilePicOverride: ${profile.profilePicOverride ? 'Yes' : 'No'}`);
        logger.info(`  └─ currentAvatarThumbnailImageUrl: ${profile.currentAvatarThumbnailImageUrl ? 'Yes' : 'No'}`);

        // Log computed fields
        logger.info(`[UserProfile] ✅ Computed Fields:`);
        logger.info(`  ├─ $trustLevel: ${profile.$trustLevel}`);
        logger.info(`  ├─ $isVRCPlus: ${profile.$isVRCPlus}`);
        logger.info(`  ├─ $isModerator: ${profile.$isModerator}`);
        logger.info(`  ├─ $isTroll: ${profile.$isTroll}`);
        logger.info(`  ├─ $isProbableTroll: ${profile.$isProbableTroll}`);
        logger.info(`  └─ $languages: ${profile.$languages?.map(l => l.value).join(', ') || '(none)'}`);

        // Fetch additional data in parallel
        logger.info(`[UserProfile] Fetching extended data (mutuals, groups, feedback)...`);
        const [mutualCounts, mutualFriends, mutualGroups, userGroups, feedback] = await Promise.all([
            this.getMutualCounts(userId).catch((e) => { logger.warn(`  └─ mutualCounts failed: ${e}`); return null; }),
            this.getMutualFriends(userId).catch((e) => { logger.warn(`  └─ mutualFriends failed: ${e}`); return []; }),
            this.getMutualGroups(userId).catch((e) => { logger.warn(`  └─ mutualGroups failed: ${e}`); return []; }),
            this.getUserGroups(userId).catch((e) => { logger.warn(`  └─ userGroups failed: ${e}`); return []; }),
            this.getUserFeedback(userId).catch((e) => { logger.warn(`  └─ feedback failed: ${e}`); return []; })
        ]);

        // Log extended data results
        logger.info(`[UserProfile] ✅ Extended Data Results:`);
        logger.info(`  ├─ mutualCounts: ${mutualCounts ? `friends=${mutualCounts.friends}, groups=${mutualCounts.groups}` : '(failed/unavailable)'}`);
        logger.info(`  ├─ mutualFriends: ${mutualFriends.length} found`);
        logger.info(`  ├─ mutualGroups: ${mutualGroups.length} found`);
        logger.info(`  ├─ userGroups: ${userGroups.length} public groups`);
        logger.info(`  └─ feedback: ${feedback.length} entries`);

        if (profile) {
            const localNote = this.notesCache.get(userId);
            if (localNote) {
                profile.note = localNote;
                logger.info(`[UserProfile] Note merged for ${userId}`);
            }
        }

        return {
            profile,
            mutualCounts: mutualCounts || undefined,
            mutualFriends: mutualFriends.length > 0 ? mutualFriends : undefined,
            mutualGroups: mutualGroups.length > 0 ? mutualGroups : undefined,
            userGroups: userGroups.length > 0 ? userGroups : undefined,
            feedback: feedback.length > 0 ? feedback : undefined
        };
    }

    /**
     * Add computed fields to a raw profile (VRCX-style enrichment)
     */
    enrichProfile(profile: VRChatUserProfile): EnrichedUserProfile {
        const tags = profile.tags || [];

        // Trust level
        const trustLevel = getTrustRank(tags);
        const trustClass = TRUST_CLASS_MAP[trustLevel] || 'x-tag-unknown';

        // VRC+ status
        const isVRCPlus = tags.includes('system_supporter');

        // Moderator check
        const isModerator = tags.some(t =>
            t.includes('admin_moderator') ||
            t.includes('admin_') ||
            t === 'system_legend'
        );

        // Troll flags
        const isTroll = tags.includes('system_troll');
        const isProbableTroll = tags.includes('system_probable_troll');

        // Extract languages from tags
        const languages: { key: string; value: string }[] = [];
        for (const tag of tags) {
            if (tag.startsWith('language_')) {
                const langCode = tag.replace('language_', '');
                const langName = LANGUAGE_MAP[langCode] || langCode;
                languages.push({ key: langCode, value: langName });
            }
        }

        return {
            ...profile,
            $trustLevel: trustLevel,
            $trustClass: trustClass,
            $isVRCPlus: isVRCPlus,
            $isModerator: isModerator,
            $isTroll: isTroll,
            $isProbableTroll: isProbableTroll,
            $languages: languages,
            $fetchedAt: Date.now()
        };
    }
}

// Singleton instance
export const userProfileService = new UserProfileService();

// ============================================
// IPC HANDLERS
// ============================================

export function setupUserProfileHandlers() {
    logger.info('Initializing UserProfileService handlers...');

    ipcMain.handle('userProfile:getFullProfile', async (_event, userId: string) => {
        try {
            const profile = await userProfileService.getFullProfile(userId);
            return { success: true, profile };
        } catch (error) {
            const err = error as Error;
            logger.error('getFullProfile error:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('userProfile:getCompleteData', async (_event, userId: string) => {
        try {
            const data = await userProfileService.getCompleteUserData(userId);
            return { success: true, data };
        } catch (error) {
            const err = error as Error;
            logger.error('getCompleteData error:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('userProfile:getMutualCounts', async (_event, userId: string) => {
        try {
            const counts = await userProfileService.getMutualCounts(userId);
            return { success: true, counts };
        } catch (error) {
            const err = error as Error;
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('userProfile:getMutualFriends', async (_event, userId: string) => {
        try {
            const friends = await userProfileService.getMutualFriends(userId);
            return { success: true, friends };
        } catch (error) {
            const err = error as Error;
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('userProfile:getMutualGroups', async (_event, userId: string) => {
        try {
            const groups = await userProfileService.getMutualGroups(userId);
            return { success: true, groups };
        } catch (error) {
            const err = error as Error;
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('userProfile:setUserNote', async (_event, userId: string, note: string) => {
        try {
            await userProfileService.setUserNote(userId, note);
            return { success: true };
        } catch (error) {
            const err = error as Error;
            return { success: false, error: err.message };
        }
    });

    logger.info('UserProfileService handlers initialized');
}
