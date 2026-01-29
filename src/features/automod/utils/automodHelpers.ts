// --- AutoMod Helper Utilities ---

/**
 * Get trust color based on user tags
 */
/**
 * Get trust color based on user tags
 */
export const getTrustColor = (tags: string[]): string => {
    if (tags?.some(t => t.includes('system_trust_veteran'))) return '#8142f5'; // Trusted (Purple)
    if (tags?.some(t => t.includes('system_trust_trusted'))) return '#ff7b00'; // Known (Orange)
    if (tags?.some(t => t.includes('system_trust_known'))) return '#2bcf5c'; // User (Green)
    if (tags?.some(t => t.includes('system_trust_basic'))) return '#1778ff'; // New (Blue)
    return '#cccccc'; // Visitor (Grey)
};

/**
 * Parse VRChat user tags into readable labels with colors
 */
export const parseUserTags = (tags: string[]): { label: string; color: string }[] => {
    if (!tags || !Array.isArray(tags)) return [];

    const result: { label: string; color: string }[] = [];

    // Trust levels
    if (tags.some(t => t === 'system_trust_veteran')) result.push({ label: 'Trusted', color: 'rgba(129, 66, 245, 0.3)' });
    if (tags.some(t => t === 'system_trust_trusted')) result.push({ label: 'Known', color: 'rgba(255, 123, 0, 0.3)' });
    if (tags.some(t => t === 'system_trust_known')) result.push({ label: 'User', color: 'rgba(43, 207, 92, 0.3)' });
    if (tags.some(t => t === 'system_trust_basic')) result.push({ label: 'New', color: 'rgba(23, 120, 255, 0.3)' });

    // Special tags
    if (tags.some(t => t === 'system_early_adopter')) result.push({ label: 'early adopter', color: 'rgba(236, 72, 153, 0.3)' });
    if (tags.some(t => t === 'system_supporter')) result.push({ label: 'supporter', color: 'rgba(34, 197, 94, 0.3)' });
    if (tags.some(t => t.includes('feedback_access'))) result.push({ label: 'feedback access', color: 'rgba(99, 102, 241, 0.3)' });
    if (tags.some(t => t.includes('world_access'))) result.push({ label: 'world access', color: 'rgba(99, 102, 241, 0.3)' });
    if (tags.some(t => t.includes('avatar_access'))) result.push({ label: 'avatar access', color: 'rgba(99, 102, 241, 0.3)' });

    // Language
    const langTag = tags.find(t => t.startsWith('language_'));
    if (langTag) {
        const lang = langTag.replace('language_', '');
        result.push({ label: `language ${lang}`, color: 'rgba(156, 163, 175, 0.3)' });
    }

    return result;
};
