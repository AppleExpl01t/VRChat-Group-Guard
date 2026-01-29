import React from 'react';
import { getTrustColor } from '../../features/automod/utils/automodHelpers';

interface TrustRankBadgeProps {
    tags?: string[];
    fallbackRank?: string; // e.g., from 'rank' field if available
}

export const TrustRankBadge: React.FC<TrustRankBadgeProps> = ({ tags, fallbackRank }) => {
    if (!tags) {
        if (!fallbackRank) return null;
        // If we only have a raw rank string, try to color it
        // This is a comprehensive fallback mapping
        let color = '#cccccc'; // Visitor (Grey)
        const lower = fallbackRank.toLowerCase();
        if (lower.includes('veteran')) color = '#8142f5';
        else if (lower.includes('trust') || lower.includes('purple')) color = '#8142f5'; // Trusted (Purple)
        else if (lower.includes('known') || lower.includes('orange')) color = '#ff7b00'; // Known (Orange)
        else if (lower.includes('user') || lower.includes('green')) color = '#2bcf5c'; // User (Green)
        else if (lower.includes('new') || lower.includes('blue')) color = '#1778ff'; // New (Blue)

        return (
            <span style={{
                color: color,
                fontSize: '0.65rem',
                fontWeight: 700,
                border: `1px solid ${color}`,
                padding: '0.1rem 0.3rem',
                borderRadius: '4px',
                textTransform: 'uppercase',
                marginLeft: '0.5rem',
                letterSpacing: '0.05em'
            }}>
                {fallbackRank}
            </span>
        );
    }

    const color = getTrustColor(tags);
    let label = 'Visitor';

    // Determine label from tags same way as color
    if (tags.some(t => t.includes('system_trust_veteran'))) label = 'Trusted';
    else if (tags.some(t => t.includes('system_trust_trusted'))) label = 'Trusted';
    else if (tags.some(t => t.includes('system_trust_known'))) label = 'Known';
    else if (tags.some(t => t.includes('system_trust_basic'))) label = 'New User'; // Correct VRC term
    else if (tags.some(t => t.includes('system_trust_user'))) label = 'User'; // Actually 'User' is 'system_trust_known'?? 
    // Wait, let's double check standard tags.
    // system_trust_basic = New User (Blue)
    // system_trust_known = User (Green) !! Wait, user is green.
    // system_trust_trusted = Known (Orange)
    // system_trust_veteran = Trusted (Purple)
    // Let's correct the mapping based on standard VRChat Colors/Ranks logic commonly used
    // Grey: Visitor
    // Blue: New User (system_trust_basic)
    // Green: User (system_trust_known) -> Wait, usually it is:
    //   Visitor (Grey)
    //   New User (Blue) -> system_trust_basic
    //   User (Green) -> system_trust_known
    //   Known User (Orange) -> system_trust_trusted
    //   Trusted User (Purple) -> system_trust_veteran

    // Let's refine based on the helper helper which seems to use 'user', 'known', 'trusted'
    if (tags.some(t => t.includes('system_trust_veteran'))) label = 'Trusted';
    else if (tags.some(t => t.includes('system_trust_trusted'))) label = 'Known';
    else if (tags.some(t => t.includes('system_trust_known'))) label = 'User';
    else if (tags.some(t => t.includes('system_trust_basic'))) label = 'New';

    return (
        <span style={{
            color: color,
            fontSize: '0.65rem',
            fontWeight: 700,
            border: `1px solid ${color}`,
            padding: '0.1rem 0.3rem',
            borderRadius: '4px',
            textTransform: 'uppercase',
            marginLeft: '0.5rem',
            letterSpacing: '0.05em',
            display: 'inline-flex',
            alignItems: 'center',
            height: '16px'
        }}>
            {label}
        </span>
    );
};

export const AgeVerifiedBadge: React.FC<{ isVerified?: boolean }> = ({ isVerified }) => {
    if (!isVerified) return null;

    return (
        <span
            title="18+ Verified"
            style={{
                background: 'rgba(239, 68, 68, 0.2)', // Red-ish tint for 18+ usually, or we can use Gold?
                // VRChat usually uses a specific icon. Let's use a simple text badge.
                color: '#ef4444',
                border: '1px solid #ef4444',
                fontSize: '0.6rem',
                fontWeight: 800,
                borderRadius: '3px',
                padding: '0 0.2rem',
                marginRight: '0.4rem',
                display: 'inline-flex',
                alignItems: 'center',
                height: '16px',
                cursor: 'help'
            }}
        >
            18+
        </span>
    );
};

export const UserBadges: React.FC<{ tags?: string[]; isAgeVerified?: boolean; id?: string }> = ({ tags, isAgeVerified }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <AgeVerifiedBadge isVerified={isAgeVerified} />
            <TrustRankBadge tags={tags} />
        </div>
    );
};
