import React, { memo, useState, useCallback, useMemo } from 'react';
import styles from './NeonDock.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  LayoutDashboard,
  Activity,
  Shield,
  List,
  ClipboardList,
  Database,
  Users
} from 'lucide-react';
import { DockItem } from './DockItem';

export type DockView = 'main' | 'moderation' | 'instances' | 'audit' | 'database' | 'settings' | 'live' | 'watchlist';

interface NeonDockProps {
  currentView: DockView;
  onViewChange: (view: DockView) => void;
  selectedGroup?: { name: string } | null;
  onGroupClick?: () => void;
  isLiveMode?: boolean;
}

// Static empty function to avoid creating new function on each render
const noop = () => {};

export const NeonDock: React.FC<NeonDockProps> = memo(({ 
  currentView, 
  onViewChange, 
  selectedGroup,
  onGroupClick,
  isLiveMode = false
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // PERF FIX: Memoize handlers to prevent re-renders
  const handleShowDock = useCallback(() => setIsVisible(true), []);
  const handleHideDock = useCallback(() => setIsVisible(false), []);
  
  // Use provided handler or fallback to noop (not inline function)
  const handleGroupClick = onGroupClick ?? noop;
  
  // Memoize view change handlers
  const handleMainClick = useCallback(() => onViewChange('main'), [onViewChange]);
  const handleLiveClick = useCallback(() => onViewChange('live'), [onViewChange]);
  const handleModerationClick = useCallback(() => onViewChange('moderation'), [onViewChange]);
  const handleWatchlistClick = useCallback(() => onViewChange('watchlist'), [onViewChange]);
  const handleInstancesClick = useCallback(() => onViewChange('instances'), [onViewChange]);
  const handleAuditClick = useCallback(() => onViewChange('audit'), [onViewChange]);
  const handleDatabaseClick = useCallback(() => onViewChange('database'), [onViewChange]);

  // Memoize static style objects
  const groupSectionStyle = useMemo(() => ({ overflow: 'hidden' as const }), []);
  const innerFlexStyle = useMemo(() => ({ 
    display: 'flex', 
    alignItems: 'center', 
    gap: '0.25rem', 
    paddingRight: '0.25rem' 
  }), []);
  const liveOpsPadding = useMemo(() => ({ padding: '0 12px' }), []);

  return (
    <>
      {/* Visual indicator pill when dock is hidden */}
      <motion.div
        className={styles.dockIndicator}
        onMouseEnter={handleShowDock}
        initial={{ x: "-50%" }}
        animate={{
          x: "-50%",
          opacity: isVisible ? 0 : 1,
          scale: isVisible ? 0.8 : 1
        }}
        transition={{ duration: 0.2 }}
      >
        <div className={styles.dockIndicatorPill} />
      </motion.div>
      
      {/* Dock with auto-hide animation */}
      <motion.div
        className={styles.dockContainer}
        initial={{ x: "-50%", y: 150 }}
        animate={{
          x: "-50%",
          y: isVisible ? 0 : 150
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30
        }}
        onMouseLeave={handleHideDock}
      >
        <motion.div className={styles.dock}>
          <DockItem 
            label={selectedGroup ? "Group" : "Home"}
            isActive={!selectedGroup}
            onClick={handleGroupClick}
            color="var(--color-primary)"
            icon={Home}
          />

          {/* Group-specific items */}
          <AnimatePresence>
              {(selectedGroup || isLiveMode) && (
                  <motion.div 
                      className={styles.groupSection}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      style={groupSectionStyle}
                  >
                    <div style={innerFlexStyle}>
                      <div className={styles.separator} />

                      {selectedGroup && (
                      <>
                          <DockItem 
                            label="Dashboard"
                            isActive={currentView === 'main' && !!selectedGroup}
                            onClick={handleMainClick}
                            color="var(--color-accent)"
                            icon={LayoutDashboard}
                          />
                      </>
                      )}

                      {/* LIVE OPS TAB - Only visible when actually in live mode */}
                      <AnimatePresence>
                          {isLiveMode && (
                              <motion.div 
                                  className={styles.liveOpsSection}
                                  initial={{ width: 0, opacity: 0, scale: 0.8 }}
                                  animate={{ width: "auto", opacity: 1, scale: 1 }}
                                  exit={{ width: 0, opacity: 0, scale: 0.8 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                  style={groupSectionStyle}
                              >
                                  <div style={liveOpsPadding}>
                                      <DockItem 
                                          label="LIVE OPS"
                                          isActive={currentView === 'live'}
                                          onClick={handleLiveClick}
                                          color="#ef4444"
                                          icon={Activity}
                                      />
                                  </div>
                              </motion.div>
                          )}
                      </AnimatePresence>

                      {selectedGroup && (
                      <>
                          <DockItem
                            label="Auto-Mod"
                            isActive={currentView === 'moderation'}
                            onClick={handleModerationClick}
                            color="var(--color-primary)"
                            icon={Shield}
                          />

                          <DockItem
                            label="Instances"
                            isActive={currentView === 'instances'}
                            onClick={handleInstancesClick}
                            color="#ffc045"
                            icon={Users}
                          />

                          <DockItem
                            label="Watchlist"
                            isActive={currentView === 'watchlist'}
                            onClick={handleWatchlistClick}
                            color="var(--color-accent)"
                            icon={List}
                          />

                          <DockItem 
                            label="Audit Logs"
                            isActive={currentView === 'audit'}
                            onClick={handleAuditClick}
                            color="var(--color-accent)"
                            icon={ClipboardList}
                          />

                          <DockItem 
                            label="Database"
                            isActive={currentView === 'database'}
                            onClick={handleDatabaseClick}
                            color="var(--color-primary)"
                            icon={Database}
                          />
                      </>
                      )}
                    </div>
                  </motion.div>
              )}
          </AnimatePresence>



        </motion.div>
      </motion.div>
    </>
  );
});

NeonDock.displayName = 'NeonDock';
