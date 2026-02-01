import React, { useEffect, memo, useState, useMemo, useCallback } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { usePoller } from '../../hooks/usePoller';
import { useInstanceMonitorStore, type LiveEntity } from '../../stores/instanceMonitorStore';
import { useGroupPreferencesStore } from '../../stores/groupPreferencesStore';
import { NeonButton } from '../../components/ui/NeonButton';

import { motion, AnimatePresence } from 'framer-motion';
import { useMouseGlow } from '../../hooks/useMouseGlow';
import { ParticleDissolveImage } from '../../components/ui/ParticleDissolveImage';
import { Star } from 'lucide-react';
import styles from './GroupSelectorView.module.css';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { StatTile } from '../dashboard/components/StatTile';

// Memoized animation variants (stable references)
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

// Subcomponent for individual cards to isolate hooks
const GroupCard = memo(({
  group,
  isLive,
  isLarge,
  isStarred,
  onStarToggle,
  onClick
}: {
  group: any,
  isLive: boolean,
  isLarge: boolean,
  isStarred: boolean,
  onStarToggle: (e: React.MouseEvent) => void,
  onClick: () => void
}) => {
  const glow = useMouseGlow();

  return (
    <motion.div variants={itemVariants} layout>
      {/* eslint-disable react-compiler/react-compiler -- useMouseGlow uses refs for DOM event handling, not for render output */}
      <div
        ref={glow.setRef}
        className={`${styles.cardPanel} ${isLarge ? styles.cardLarge : styles.cardCompact} ${isLive ? styles.cardLive : ''} ${isStarred ? styles.cardStarred : ''}`}
        onClick={onClick}
        onMouseMove={glow.onMouseMove}
        onMouseLeave={glow.onMouseLeave}
        style={glow.style}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Star Button */}
        <button
          className={`${styles.starButton} ${isStarred ? styles.starButtonActive : ''}`}
          onClick={onStarToggle}
          aria-label={isStarred ? "Unpin group" : "Pin as main group"}
          title={isStarred ? "Unpin group" : "Pin as main group"}
        >
          <Star size={isLarge ? 18 : 14} fill={isStarred ? "currentColor" : "none"} />
        </button>

        {/* Background Banner */}
        <AnimatePresence>
          {isLarge && group.bannerUrl && (
            <motion.div
              className={styles.banner}
              style={{ backgroundImage: `url(${group.bannerUrl})` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
          {isLarge && !group.bannerUrl && (
            <motion.div
              className={styles.bannerFallback}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        {/* Live Badge */}
        {isLive ? (
          <motion.div
            layoutId={`live-${group.id}`}
            className={styles.liveBadge}
          >
            LIVE
          </motion.div>
        ) : group.activeInstanceCount && group.activeInstanceCount > 0 ? (
          <motion.div
            className={styles.liveBadge}
            style={{
              background: 'var(--color-secondary)',
              color: 'white',
              width: 'auto',
              padding: '0 8px'
            }}
          >
            {group.activeInstanceCount} active
          </motion.div>
        ) : null}

        {/* Icon */}
        {group.iconUrl ? (
          <motion.img
            layoutId={`icon-${group.id}`}
            src={group.iconUrl}
            className={styles.groupIcon}
            alt=""
          />
        ) : (
          <motion.div
            layoutId={`icon-${group.id}`}
            className={styles.groupIconPlaceholder}
          >
            {group.shortCode || group.name.substring(0, 2).toUpperCase()}
          </motion.div>
        )}

        {/* Content */}
        <motion.div
          className={isLarge ? styles.overlayContent : undefined}
        >
          <motion.div className={styles.groupName} layoutId={`name-${group.id}`} title={group.name}>
            {group.name}
          </motion.div>

          {isLarge && (
            <div className={styles.metaRow}>
              <span className={styles.shortCode}>{group.shortCode}</span>
              <div className={styles.statsStack}>
                <span className={styles.instanceCount}>
                  {group.activeInstanceCount || 0} {(group.activeInstanceCount === 1) ? 'Instance' : 'Instances'}
                </span>
                <span className={styles.memberCount}>
                  {group.memberCount} {group.memberCount === 1 ? 'Member' : 'Members'}
                </span>
              </div>
            </div>
          )}
        </motion.div>

      </div>
    </motion.div>
  );
});

// Roaming Card similar subcomponent
const RoamingCard = memo(({
  currentWorldName,
  instanceImageUrl,
  activeUserCount,
  isLarge,
  onClick
}: {
  currentWorldName: string | null,
  instanceImageUrl: string | null,
  activeUserCount: number,
  isLarge: boolean,
  onClick: () => void
}) => {
  const glow = useMouseGlow();

  return (
    <motion.div variants={itemVariants} layout>
      {/* eslint-disable react-compiler/react-compiler -- useMouseGlow uses refs for DOM event handling, not for render output */}
      <div
        ref={glow.setRef}
        className={`${styles.cardPanel} ${isLarge ? styles.cardLarge : styles.cardCompact} ${styles.cardRoaming}`}
        onClick={onClick}
        onMouseMove={glow.onMouseMove}
        onMouseLeave={glow.onMouseLeave}
        style={{ ...glow.style }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Background Banner with Particle Dissolve Effect */}
        {isLarge && (
          <ParticleDissolveImage
            src={instanceImageUrl}
            alt={currentWorldName || 'World'}
            className={styles.banner}
            particleCount={100}
            duration={1000}
            style={{ position: 'absolute', inset: 0 }}
          />
        )}
        {!isLarge && instanceImageUrl && (
          <div
            className={styles.banner}
            style={{ backgroundImage: `url(${instanceImageUrl})` }}
          />
        )}

        {/* Roaming Badge & User Count Container */}
        <div
          style={{
            position: 'absolute',
            top: isLarge ? 12 : 6,
            left: isLarge ? 12 : 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: isLarge ? 'flex-start' : 'center',
            gap: isLarge ? '4px' : '2px',
            pointerEvents: 'none',
            width: isLarge ? 'auto' : '100%',
            padding: isLarge ? 0 : '0 6px'
          }}
        >
          <motion.div
            layoutId="roaming-badge"
            className={styles.liveBadge}
            style={{
              position: 'relative', // Override absolute from class
              top: 'auto',
              left: 'auto',
              right: 'auto',
              background: '#22c55e',
              color: 'black',
              fontWeight: 900,
              margin: 0,
              boxShadow: '0 0 10px rgba(34, 197, 94, 0.4)'
            }}
          >
            ROAMING
          </motion.div>

          {/* Live User Count */}
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              padding: isLarge ? '2px 8px' : '1px 6px',
              borderRadius: '12px',
              color: '#fff',
              fontSize: isLarge ? '0.7rem' : '0.6rem',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            <span style={{ width: isLarge ? '6px' : '4px', height: isLarge ? '6px' : '4px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            {activeUserCount} Users
          </motion.div>
        </div>


        {/* Content */}
        <motion.div
          className={styles.overlayContent}
        >
          {isLarge && (
            <div className={styles.metaRow} style={{ alignItems: 'flex-end', marginTop: 'auto' }}>
              <motion.div className={styles.groupName} layoutId="name-roaming" style={{ flex: 1, padding: 0 }}>
                {currentWorldName || 'Unknown World'}
              </motion.div>
              <span className={styles.memberCount} style={{ color: '#86efac', marginBottom: '2px', flexShrink: 0, marginLeft: '1rem' }}>
                Viewing Live Data
              </span>
            </div>
          )}
          {!isLarge && (
            <motion.div className={styles.groupName} layoutId="name-roaming">
              {currentWorldName || 'Unknown World'}
            </motion.div>
          )}
        </motion.div>
      </div >
    </motion.div >
  );
});

export const GroupSelectorView: React.FC = memo(() => {
  const {
    myGroups,
    // totalGroupsToLoad, // Removed: Property does not exist
    fetchMyGroups,
    fetchAllGroupsInstances,
    selectGroup,
    enterRoamingMode,
    isLoading,
    error
  } = useGroupStore();
  const { currentWorldId, currentWorldName, instanceImageUrl, currentGroupId, updateLiveScan } = useInstanceMonitorStore();



  const [isLarge, setIsLarge] = useState(window.innerWidth > 1100);

  // Persistent sorting & starred group from store
  const {
    sortBy,
    sortOrder,
    starredGroupId,
    setSortBy,
    toggleSortOrder,
    setStarredGroupId
  } = useGroupPreferencesStore();

  // Handle starring a group
  const handleStarToggle = useCallback((groupId: string) => (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    const newStarred = starredGroupId === groupId ? null : groupId;
    setStarredGroupId(newStarred);
  }, [starredGroupId, setStarredGroupId]);

  // Sorted and pinned groups
  const sortedGroups = useMemo(() => {
    const groups = [...myGroups];

    // Sort function
    groups.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'members':
          comparison = (a.memberCount || 0) - (b.memberCount || 0);
          break;
        case 'instances':
          comparison = (a.activeInstanceCount || 0) - (b.activeInstanceCount || 0);
          break;
        case 'age':
          // Fall back to id comparison since createdAt is not available
          comparison = a.id.localeCompare(b.id);
          break;
        case 'alphabetical':
        default:
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Move starred group to front (ignores sorting)
    if (starredGroupId) {
      const starredIndex = groups.findIndex(g => g.id === starredGroupId);
      if (starredIndex > 0) {
        const [starredGroup] = groups.splice(starredIndex, 1);
        groups.unshift(starredGroup);
      }
    }

    return groups;
  }, [myGroups, sortBy, sortOrder, starredGroupId]);

  // Derived Stats
  const totalGroups = myGroups.length;
  const activeInstances = myGroups.reduce((acc, g) => acc + (g.activeInstanceCount || 0), 0);

  // Calculate active users in current roaming instance
  const { liveScanResults } = useInstanceMonitorStore();
  const roamingActiveUserCount = useMemo(() => {
    if (!liveScanResults) return 0;
    return liveScanResults.filter(e => e.status !== 'left' && e.status !== 'kicked').length;
  }, [liveScanResults]);

  const roamingActive = currentWorldId && (!currentGroupId || !myGroups.some(g => g.id === currentGroupId));

  // Function to refresh roaming instance data (Matches Live Ops logic)
  const performRoamingScan = useCallback(async () => {
    if (!roamingActive) return;
    try {
      const results = await window.electron.instance.scanSector();
      updateLiveScan(results as LiveEntity[]);
    } catch (err) {
      console.error('[RoamingScan] Failed to refresh user count:', err);
    }
  }, [roamingActive, updateLiveScan]);

  // Responsive Check
  useEffect(() => {
    const handleResize = () => setIsLarge(window.innerWidth > 1100);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchMyGroups();
    if (roamingActive) {
      performRoamingScan();
    }
  }, [fetchMyGroups, roamingActive, performRoamingScan]);

  // Polling for live instance counts (every 20 seconds) while on this view
  usePoller(() => {
    fetchAllGroupsInstances();
    if (roamingActive) {
      performRoamingScan();
    }
  }, 20000);

  // Loading/Error states (simplified for layout match, or keep)
  if (isLoading && myGroups.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <motion.h2
          className="text-gradient"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          Scanning Group Frequencies...
        </motion.h2>
        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
          Establishing secure link to VRChat API...<br />

        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2 style={{ color: '#ef4444' }}>Connection Error</h2>
        <GlassPanel style={{ maxWidth: '600px', margin: '1rem auto' }}>
          <pre style={{ margin: 0, overflow: 'visible', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: '#fca5a5' }}>
            {error}
          </pre>
        </GlassPanel>
        <NeonButton onClick={() => fetchMyGroups()} style={{ marginTop: '1rem' }}>Retry</NeonButton>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header Section - Matches Dashboard Layout */}
      <GlassPanel className={styles.headerPanel}>
        <div className={styles.titleSection}>
          <h1 className={`${styles.title} text-gradient`}>
            SELECT GROUP
          </h1>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div className={styles.subtitle}>
              NETWORK OVERVIEW
            </div>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <StatTile
            label="TOTAL GROUPS"
            value={totalGroups}
            color="var(--color-primary)"
          />
          <StatTile
            label="ACTIVE INSTANCES"
            value={activeInstances}
            color={activeInstances > 0 ? "var(--color-success)" : "var(--color-text-dim)"}
            // Optional: Add glow or pulse if active
            headerRight={activeInstances > 0 && (
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"></span>
            )}
          />
          {roamingActive && (
            <StatTile
              label="STATUS"
              value="ROAMING"
              color="var(--color-accent)"
            />
          )}
        </div>
      </GlassPanel>

      {/* Sorting Controls */}
      <div className={styles.sortControls}>
        <div className={styles.sortLabel}>
          <span>SORT BY</span>
        </div>
        <div className={styles.sortButtons}>
          <button
            className={`${styles.sortButton} ${sortBy === 'alphabetical' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('alphabetical')}
          >
            <span>NAME</span>
          </button>
          <button
            className={`${styles.sortButton} ${sortBy === 'members' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('members')}
          >
            <span>MEMBERS</span>
          </button>
          <button
            className={`${styles.sortButton} ${sortBy === 'instances' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('instances')}
          >
            <span>ACTIVE</span>
          </button>
          <button
            className={`${styles.sortButton} ${sortBy === 'age' ? styles.sortButtonActive : ''}`}
            onClick={() => setSortBy('age')}
          >
            <span>JOINED</span>
          </button>
        </div>
        <button
          className={styles.sortOrderButton}
          onClick={toggleSortOrder}
          title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          <span>{sortOrder === 'asc' ? 'ASC' : 'DESC'}</span>
        </button>
      </div>

      {/* Scrollable Content Area */}
      <div className={styles.scrollArea}>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className={`${styles.grid} ${isLarge ? styles.gridLarge : styles.gridCompact}`}
          layout
        >
          {/* Roaming/Live Card - ALWAYS FIRST */}
          {roamingActive && (
            <RoamingCard
              currentWorldName={currentWorldName}
              instanceImageUrl={instanceImageUrl}
              activeUserCount={roamingActiveUserCount}
              isLarge={isLarge}
              onClick={() => enterRoamingMode()}
            />
          )}

          {sortedGroups.map((group) => {
            const isLive = currentGroupId ? group.id.toLowerCase() === currentGroupId.toLowerCase() : false;
            const isStarred = starredGroupId === group.id;

            return (
              <GroupCard
                key={group.id}
                group={group}
                isLive={isLive}
                isLarge={isLarge}
                isStarred={isStarred}
                onStarToggle={handleStarToggle(group.id)}
                onClick={() => selectGroup(group)}
              />
            );
          })}
        </motion.div>

        {/* Always show Skip/Roaming Mode button */}
        <motion.div
          id="action-footer" // Force DOM update
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'flex',
            flexDirection: 'column', // Stack vertically
            alignItems: 'center', // Center align
            padding: '2rem 1rem',
            marginTop: '1rem',
            gap: '12px' // 10-12px padding as requested
          }}
        >
          <NeonButton
            variant="secondary"
            onClick={() => enterRoamingMode()}
            style={{
              padding: '0.8rem 2rem',
              fontSize: '0.9rem',
              gap: '8px',
              opacity: 0.8,
              width: '100%',
              maxWidth: '320px' // Same length
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🔍</span>
            Skip / Enter Roaming Mode
          </NeonButton>


        </motion.div>
      </div>
    </div>
  );
});

GroupSelectorView.displayName = 'GroupSelectorView';
