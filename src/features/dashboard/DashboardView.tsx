import React, { useEffect, useState, memo, useMemo } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useAuditStore } from '../../stores/auditStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { usePipelineStatus } from '../../hooks/usePipelineInit';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { RefreshTimer } from '../../components/ui/RefreshTimer';
import { PipelineIndicator } from '../../components/ui/PipelineStatus';
import { MembersListDialog } from '../dashboard/dialogs/MembersListDialog';
import { RequestsListDialog } from '../dashboard/dialogs/RequestsListDialog';
import { BansListDialog } from '../dashboard/dialogs/BansListDialog';
import { InstancesListDialog } from '../dashboard/dialogs/InstancesListDialog';
import { InstanceMonitorWidget } from './widgets/InstanceMonitorWidget';
import { MemberSearchWidget } from './widgets/MemberSearchWidget';


import { StatTile } from './components/StatTile';
import styles from './DashboardView.module.css';
import { motion } from 'framer-motion';

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};


// Audit event types that affect member count
const MEMBER_AFFECTING_EVENTS = [
  'group.user.join',
  'group.user.leave', 
  'group.user.ban',
  'group.user.unban',
  'group.user.kick',
  'group.invite.accept',
];

export const DashboardView: React.FC = memo(() => {
  const { 
      selectedGroup, 
      requests, 
      bans,
      instances,
      isRequestsLoading,
      isBansLoading,
      isInstancesLoading,
      fetchGroupMembers,
      isMembersLoading,
  } = useGroupStore();
  const { logs, fetchLogs, isLoading: isLogsLoading } = useAuditStore();
  const { openProfile } = useUserProfileStore();
  
  // Pipeline WebSocket connection status
  const pipelineStatus = usePipelineStatus();
  
  // Auto-refresh hooks with visual timers
  const instancesRefresh = useDataRefresh({ type: 'instances' });
  const requestsRefresh = useDataRefresh({ type: 'requests' });
  const bansRefresh = useDataRefresh({ type: 'bans' });
  
  const [showMembers, setShowMembers] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showBans, setShowBans] = useState(false);
  const [showInstances, setShowInstances] = useState(false);
  
  // Member refresh state with 30s cooldown
  const [memberRefreshCooldown, setMemberRefreshCooldown] = useState(0);
  const lastLogCountRef = React.useRef(0);
  const hasFetchedMembersRef = React.useRef(false);
  const lastGroupIdRef = React.useRef<string | null>(null);
  
  // Audit filter state
  type AuditFilterType = 'all' | 'joins' | 'requests' | 'invited' | 'bans' | 'instances' | 'mod' | 'settings';
  const [auditFilter, setAuditFilter] = useState<AuditFilterType>('all');
  
  // Filter logs based on selected tab
  const filteredLogs = useMemo(() => {
    if (auditFilter === 'all') return logs;
    
    return logs.filter(log => {
      const eventType = (log.eventType || '').toLowerCase();
      switch (auditFilter) {
        case 'joins':
          return eventType.includes('join') || eventType.includes('leave');
        case 'requests':
           return eventType.includes('request');
        case 'invited':
           return eventType.includes('invite') && !eventType.includes('request');
        case 'bans':
          return eventType.includes('ban') || eventType.includes('unban') || eventType.includes('kick');
        case 'instances':
          return (eventType.includes('instance') && (eventType.includes('create') || eventType.includes('close') || eventType.includes('open')));
        case 'mod':
          return eventType.includes('warn') || eventType.includes('mute') || eventType.includes('role');
        case 'settings':
          return eventType.includes('update') || eventType.includes('create') || eventType.includes('delete') || eventType.includes('edit');
        default:
          return true;
      }
    });
  }, [logs, auditFilter]);

  // Initial member fetch (once per app open) and reset on group change
  useEffect(() => {
    if (!selectedGroup) return;
    
    // Reset if group changed
    if (lastGroupIdRef.current !== selectedGroup.id) {
      hasFetchedMembersRef.current = false;
      lastLogCountRef.current = 0;
      lastGroupIdRef.current = selectedGroup.id;
    }
    
    // Initial fetch
    if (!hasFetchedMembersRef.current) {
      fetchGroupMembers(selectedGroup.id, 0);
      hasFetchedMembersRef.current = true;
    }
  }, [selectedGroup, fetchGroupMembers]);

  // Watch audit logs for member-affecting events
  useEffect(() => {
    if (!selectedGroup || logs.length === 0) return;
    
    const lastCount = lastLogCountRef.current;
    
    // Check if we have new logs since last check
    if (logs.length > lastCount && lastCount > 0) {
      // Check if any new log is a member-affecting event
      const newLogs = logs.slice(0, logs.length - lastCount);
      const hasMemberEvent = newLogs.some(log => 
        MEMBER_AFFECTING_EVENTS.some(event => 
          log.eventType?.includes(event) || log.type?.includes(event)
        )
      );
      
      if (hasMemberEvent) {
        // Refresh member count
        fetchGroupMembers(selectedGroup.id, 0);
      }
    }
    
    lastLogCountRef.current = logs.length;
  }, [logs, selectedGroup, fetchGroupMembers]);

  // Cooldown timer
  useEffect(() => {
    if (memberRefreshCooldown > 0) {
      const timer = setTimeout(() => {
        setMemberRefreshCooldown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [memberRefreshCooldown]);

  const handleMemberRefresh = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (memberRefreshCooldown > 0 || !selectedGroup) return;
    
    fetchGroupMembers(selectedGroup.id, 0);
    setMemberRefreshCooldown(30); // 30 second cooldown
  };

  useEffect(() => {
    if (selectedGroup) {
      fetchLogs(selectedGroup.id);
    }
  }, [selectedGroup, fetchLogs]);

  return (
    <>
    <motion.div 
        className={styles.container}
        variants={containerVariants}
        initial="hidden"
        animate="show"
    >
      
        {/* Top Header & Stats Row */}
        <GlassPanel className={styles.headerPanel}>

            <div className={styles.titleSection}>
                <motion.h1 
                    className={`${styles.title} text-gradient`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    {selectedGroup?.name || 'Dashboard'}
                </motion.h1>
                <motion.div 
                    className={styles.subtitle}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    COMMAND CENTER
                </motion.div>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                
                {/* Member Count Tile */}
                <motion.div variants={itemVariants} style={{ height: '100%' }}>
                    <StatTile 
                        label="MEMBERS"
                        value={selectedGroup?.memberCount || 0}
                        color="var(--color-primary)"
                        onClick={() => setShowMembers(true)}
                        headerLeftExtra={pipelineStatus.connected && <PipelineIndicator />}
                        headerRight={
                            <RefreshTimer 
                                secondsUntilRefresh={memberRefreshCooldown} 
                                isRefreshing={isMembersLoading} 
                                onRefreshClick={handleMemberRefresh} 
                            />
                        }
                    />
                </motion.div>

                {/* Active Instances Tile */}
                <motion.div variants={itemVariants} style={{ height: '100%' }}>
                    <StatTile
                        label="INSTANCES"
                        value={isInstancesLoading ? '...' : instances.length}
                        color="var(--color-info)"
                        onClick={() => setShowInstances(true)}
                        headerRight={
                            <RefreshTimer 
                                secondsUntilRefresh={instancesRefresh.secondsUntilRefresh} 
                                isRefreshing={instancesRefresh.isRefreshing} 
                                onRefreshClick={(e) => { e?.stopPropagation(); instancesRefresh.refreshNow(); }} 
                            />
                        }
                    />
                </motion.div>

                {/* Requests Tile */}
                <motion.div variants={itemVariants} style={{ height: '100%' }}>
                    <StatTile
                        label="REQUESTS"
                        value={isRequestsLoading ? '...' : requests.length}
                        color="var(--color-accent)"
                        onClick={() => setShowRequests(true)}
                        headerRight={
                            <RefreshTimer 
                                secondsUntilRefresh={requestsRefresh.secondsUntilRefresh} 
                                isRefreshing={requestsRefresh.isRefreshing} 
                                onRefreshClick={(e) => { e?.stopPropagation(); requestsRefresh.refreshNow(); }} 
                            />
                        }
                    />
                </motion.div>

                {/* Bans Tile */}
                <motion.div variants={itemVariants} style={{ height: '100%' }}>
                    <StatTile
                        label="BANS"
                        value={isBansLoading ? '...' : bans.length}
                        color="var(--color-danger)"
                        onClick={() => setShowBans(true)}
                        headerRight={
                            <RefreshTimer 
                                secondsUntilRefresh={bansRefresh.secondsUntilRefresh} 
                                isRefreshing={bansRefresh.isRefreshing} 
                                onRefreshClick={(e) => { e?.stopPropagation(); bansRefresh.refreshNow(); }} 
                            />
                        }
                    />
                </motion.div>
            </div>
        </GlassPanel>

        {/* Main Content Area: Swapped Columns (Monitor Left, Audit Right) */}
        <div className={styles.contentGrid}>
            
            {/* Left: Instance Monitor + Member Search (Now Wider) */}
            <div className={styles.monitorColumn}>
                <MemberSearchWidget />
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <InstanceMonitorWidget />
                </div>
            </div>

            {/* Right: Audit Log Feed (Compact) */}
            <GlassPanel className={styles.auditPanel}>
                <div className={styles.auditHeader}>
                    <div className={styles.auditTitle}>
                        <h3>Live Feed</h3>
                        <div className={styles.liveIndicator} />
                    </div>
                    <NeonButton size="sm" variant="ghost" onClick={() => selectedGroup && fetchLogs(selectedGroup.id)} disabled={isLogsLoading}>
                        {isLogsLoading ? '...' : 'SYNC'}
                    </NeonButton>
                </div>
                
                {/* Filter Tabs - Compact */}
                <div className={styles.auditTabs}>
                    {(['all', 'joins', 'requests', 'bans'] as const).map(tab => (
                        <button
                            key={tab}
                            className={`${styles.auditTab} ${auditFilter === tab ? styles.auditTabActive : ''}`}
                            onClick={() => setAuditFilter(tab as AuditFilterType)}
                            title={tab.toUpperCase()}
                        >
                            {tab === 'all' ? 'ALL' : 
                             tab === 'joins' ? 'JOINS' : 
                             tab === 'requests' ? 'REQS' :
                             tab === 'bans' ? 'BANS' : ''}
                        </button>
                    ))}
                    <button className={styles.auditTab} onClick={() => setAuditFilter('all')} style={{ marginLeft: 'auto', opacity: 0.5 }}>
                        ⋮
                    </button>
                </div>
                
                <div className={styles.logList}>
                    {filteredLogs.length === 0 && !isLogsLoading ? (
                        <div className={styles.emptyState}>
                            - Empty -
                        </div>
                    ) : (
                        filteredLogs.map((log) => (
                            <div key={log.id} className={styles.logItem}>
                                <div 
                                    className={styles.logDot} 
                                    style={{
                                        background: log.eventType?.includes('ban') ? 'var(--color-danger)' : (log.eventType?.includes('join') ? 'var(--color-success)' : 'var(--color-accent)')
                                    }} 
                                />
                                <div className={styles.logContent}>
                                    <div className={styles.scrollWrapper}>
                                        <span className={styles.timestamp}>
                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span 
                                            className={styles.actorName}
                                            onClick={(e) => { e.stopPropagation(); if (log.actorId) openProfile(log.actorId); }}
                                        >
                                            {log.actorDisplayName}
                                        </span>
                                        <span className={styles.logDescription}>
                                            {log.description || log.eventType}
                                        </span>
                                        {/* Spacer to allow full scroll visibility in marquee if needed */}
                                        <span style={{ minWidth: '20px' }} />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </GlassPanel>
        </div>

        {/* Dialogs */}
        <MembersListDialog 
        isOpen={showMembers} 
        onClose={() => setShowMembers(false)} 
      />
      
      <RequestsListDialog
          isOpen={showRequests}
          onClose={() => setShowRequests(false)}
      />

      <BansListDialog
          isOpen={showBans}
          onClose={() => setShowBans(false)}
      />

      <InstancesListDialog
          isOpen={showInstances}
          onClose={() => setShowInstances(false)}
      />
    </motion.div>
    </>
  );
});

DashboardView.displayName = 'DashboardView';

