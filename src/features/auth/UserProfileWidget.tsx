import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { GlassPanel } from '../../components/ui/GlassPanel';

const getTrustRank = (tags: string[] = []) => {
  if (tags.includes('admin_moderator')) return { label: 'Admin', color: '#ff0000' };
  if (tags.includes('system_trust_veteran')) return { label: 'Trusted', color: '#8134ef' };
  if (tags.includes('system_trust_trusted')) return { label: 'Known', color: '#ff7b00' };
  if (tags.includes('system_trust_known')) return { label: 'User', color: '#2bcf5c' };
  if (tags.includes('system_trust_basic')) return { label: 'New User', color: '#1778ff' };
  return { label: 'Visitor', color: '#cccccc' };
};

const getStatusColor = (status: string = 'offline') => {
  switch (status) {
    case 'active': return '#2bcf5c'; // Green
    case 'join me': return '#4287f5'; // Blue
    case 'busy': return '#ab1a1a'; // Red
    default: return '#cccccc';
  }
};

export const UserProfileWidget: React.FC = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  const trustRank = getTrustRank(user.tags);
  const statusColor = getStatusColor(user.status);

  return (
    <GlassPanel style={{
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1rem',
      background: 'var(--color-surface-card)',
      border: '1px solid var(--border-color)',
      textAlign: 'center'
    }}>
      {/* Avatar with Status Activity Ring */}
      <div style={{ position: 'relative' }}>
        <img 
          src={user.userIcon || user.currentAvatarThumbnailImageUrl} 
          alt="Avatar"
          style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '20px',
            objectFit: 'cover',
            border: `3px solid ${trustRank.color}`,
            boxShadow: `0 0 20px ${trustRank.color}40`
          }} 
        />
        <div style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: statusColor,
          border: '3px solid var(--color-surface-card)'
        }} />
      </div>

      <div style={{ width: '100%', overflow: 'hidden' }}>
        <h3 style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.1rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: 'var(--color-text-main)'
        }}>
          {user.displayName}
        </h3>
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <span style={{ 
            fontSize: '0.7rem', 
            background: trustRank.color, 
            color: 'white', 
            padding: '2px 8px', 
            borderRadius: '4px',
            fontWeight: 600,
            textShadow: '0 0 2px rgba(0,0,0,0.5)'
          }}>
            {trustRank.label}
          </span>
          <span style={{
            fontSize: '0.7rem',
            color: statusColor,
            fontWeight: 600,
            background: 'var(--color-surface-overlay)',
            padding: '2px 8px',
            borderRadius: '4px',
            textTransform: 'capitalize'
          }}>
            {user.status || 'Offline'}
          </span>
        </div>

        {/* Full Status Description */}
        {user.statusDescription && (
           <div style={{
             fontSize: '0.85rem',
             color: 'var(--color-primary)',
             background: 'var(--color-surface-elevated)',
             padding: '0.5rem',
             borderRadius: '8px',
             lineHeight: '1.4',
             fontStyle: 'italic',
             marginBottom: '0.5rem',
             wordBreak: 'break-word'
           }}>
             "{user.statusDescription}"
           </div>
        )}

        {user.bio && (
           <div style={{
             marginTop: '0.5rem',
             fontSize: '0.75rem',
             color: 'var(--color-text-dim)',
             lineHeight: '1.3',
             display: '-webkit-box',
             WebkitLineClamp: 3,
             WebkitBoxOrient: 'vertical',
             overflow: 'hidden'
           }}>
             {user.bio}
           </div>
        )}
      </div>
    </GlassPanel>
  );
};
