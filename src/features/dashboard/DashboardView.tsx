import React, { useEffect, useState, memo, useRef } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useAuditStore } from '../../stores/auditStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { usePipelineStatus } from '../../hooks/usePipelineInit';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { RefreshTimer } from '../../components/ui/RefreshTimer';
import { PipelineIndicator } from '../../components/ui/PipelineStatus';
import { NeonButton } from '../../components/ui/NeonButton';
import { MembersListDialog } from '../dashboard/dialogs/MembersListDialog';
import { RequestsListDialog } from '../dashboard/dialogs/RequestsListDialog';
import { BansListDialog } from '../dashboard/dialogs/BansListDialog';
import { InstancesListDialog } from '../dashboard/dialogs/InstancesListDialog';
import { StatTile } from './components/StatTile';
import styles from './DashboardView.module.css';
import { motion } from 'framer-motion';

import { formatDistanceToNow } from 'date-fns';
import paw from '../../assets/images/paw.png';

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



const MEMBER_AFFECTING_EVENTS = [
  'group.user.join',
  'group.user.leave', 
  'group.user.ban',
  'group.user.unban',
  'group.user.kick',
  'group.invite.accept',
];

export const DashboardView: React.FC = memo(() => {
  // PERF FIX: Use individual selectors instead of destructuring entire store
  const selectedGroup = useGroupStore(state => state.selectedGroup);
  const requests = useGroupStore(state => state.requests);
  const bans = useGroupStore(state => state.bans);
  const instances = useGroupStore(state => state.instances);
  const isRequestsLoading = useGroupStore(state => state.isRequestsLoading);
  const isBansLoading = useGroupStore(state => state.isBansLoading);
  const isInstancesLoading = useGroupStore(state => state.isInstancesLoading);
  const fetchGroupMembers = useGroupStore(state => state.fetchGroupMembers);
  const isMembersLoading = useGroupStore(state => state.isMembersLoading);
  
  const logs = useAuditStore(state => state.logs);
  const fetchLogs = useAuditStore(state => state.fetchLogs);
  const isLogsLoading = useAuditStore(state => state.isLoading);
  const pipelineStatus = usePipelineStatus();
  
  // Data Refresh Hooks
  const instancesRefresh = useDataRefresh({ type: 'instances' });
  const requestsRefresh = useDataRefresh({ type: 'requests' });
  const bansRefresh = useDataRefresh({ type: 'bans' });
  
  const { openProfile } = useUserProfileStore();

  // Dialog State
  const [showMembers, setShowMembers] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showBans, setShowBans] = useState(false);
  const [showInstances, setShowInstances] = useState(false);

  
  // Member refresh throttling
  const [memberNextRefreshAt, setMemberNextRefreshAt] = useState(0);
  const lastLogCountRef = useRef(0);
  const hasFetchedMembersRef = useRef(false);
  const lastGroupIdRef = useRef<string | null>(null);
  

  // Initial Data Fetch
  useEffect(() => {
    if (!selectedGroup) return;
    
    if (lastGroupIdRef.current !== selectedGroup.id) {
      hasFetchedMembersRef.current = false;
      lastLogCountRef.current = 0;
      lastGroupIdRef.current = selectedGroup.id;
    }
    
    if (!hasFetchedMembersRef.current) {
      fetchGroupMembers(selectedGroup.id, 0);
      hasFetchedMembersRef.current = true;
    }
    
    fetchLogs(selectedGroup.id);
  }, [selectedGroup, fetchGroupMembers, fetchLogs]);

  // Reactive Updates based on Logs
  useEffect(() => {
    if (!selectedGroup || logs.length === 0) return;
    
    const lastCount = lastLogCountRef.current;
    if (logs.length > lastCount && lastCount > 0) {
      const newLogs = logs.slice(0, logs.length - lastCount);
      const hasMemberEvent = newLogs.some(log => 
        MEMBER_AFFECTING_EVENTS.some(event => 
          log.eventType?.includes(event) || log.type?.includes(event)
        )
      );
      
      if (hasMemberEvent) {
        fetchGroupMembers(selectedGroup.id, 0);
      }
    }
    lastLogCountRef.current = logs.length;
  }, [logs, selectedGroup, fetchGroupMembers]);

  const handleMemberRefresh = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (memberNextRefreshAt > Date.now() || !selectedGroup) return;
    fetchGroupMembers(selectedGroup.id, 0);
    setMemberNextRefreshAt(Date.now() + 30000);
  };

  const getLogIcon = (type: string) => {
      if (type.includes('ban')) return '🚫';
      if (type.includes('kick')) return '🥾';
      if (type.includes('invite')) return '📩';
      if (type.includes('automod')) return '🤖';
      return '📝';
  };

  const getLogColor = (type: string) => {
      if (type.includes('ban')) return 'var(--color-danger)';
      if (type.includes('kick')) return 'var(--color-warning)';
      if (type.includes('invite')) return 'var(--color-success)';
      if (type.includes('automod')) return 'var(--color-info)';
      return 'var(--color-text-dim)';
  };

  const formatLogEntry = (log: { actorDisplayName: string; description: string; type?: string }) => {
      let actor = log.actorDisplayName;
      let desc = log.description;

      // Fix "by ." at end which happens when actor is missing in VRChat response
      if (desc.endsWith(' by .')) {
          desc = desc.substring(0, desc.length - 5);
      }

      // If actor is UNKNOWN, and description starts with "Name User ...", heuristic to extract actor
      // Example: "AppleExpl01t User DaBomb55..." -> Actor: AppleExpl01t
      if (actor === 'UNKNOWN' && desc.match(/^\S+ User /)) {
           const parts = desc.split(' ');
           if (parts.length > 0) {
               actor = parts[0];
               // We don't necessarily strip it from desc yet, we'll let the next cleaner do it if needed
           }
      }

      // Remove actor name from description to avoid duplication
      // e.g. "User X added by Actor Y" -> "User X added by" (then we clean "by")
      let cleanDesc = desc;
      if (actor !== 'UNKNOWN') {
         cleanDesc = cleanDesc.replace(actor, '');
      }

      // Fix: Remove redundant "User" text that often follows the name in VRChat logs
      cleanDesc = cleanDesc.replace(/^\s*User\s+/, ' ');
      
      cleanDesc = cleanDesc.replace(/by \s*$/, '').trim();
      
      // Cleanup double spaces
      cleanDesc = cleanDesc.replace(/\s+/g, ' ');

      return { actor, description: cleanDesc };
  };

  return (
    <>
    <motion.div 
        className={styles.container}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', padding: '1rem', paddingBottom: 'var(--dock-height)' }}
    >
        {/* Header Section */}
        <GlassPanel className={styles.headerPanel} style={{ flexShrink: 0 }}>
            <div className={styles.titleSection}>
                <h1 className={`${styles.title} text-gradient`}>
                    {selectedGroup?.name || 'Dashboard'}
                </h1>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div 
                        className={styles.subtitle} 
                        style={{ color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)' }}
                    >
                        COMMAND CENTER
                    </div>
                    <img 
                        src={paw} 
                        alt="Paw Logo" 
                        style={{ 
                            width: '20px', 
                            height: '20px', 
                            opacity: 0.7,
                            filter: 'brightness(1.2) saturate(1.5)'
                        }} 
                    />
</div>
            </div>

            <div className={styles.statsGrid}>
                {/* Stats Tiles Reuse */}
                <StatTile 
                    label="MEMBERS"
                    value={selectedGroup?.memberCount || 0}
                    color="var(--color-primary)"
                    onClick={() => setShowMembers(true)}
                    headerLeftExtra={pipelineStatus.connected && <PipelineIndicator />}
                    headerRight={
                        <RefreshTimer 
                            nextRefreshAt={memberNextRefreshAt} 
                            isRefreshing={isMembersLoading} 
                            onRefreshClick={handleMemberRefresh} 
                        />
                    }
                />
                <StatTile
                    label="INSTANCES"
                    value={isInstancesLoading ? '...' : instances.length}
                    color="var(--color-info)"
                    onClick={() => setShowInstances(true)}
                    headerRight={
                        <RefreshTimer 
                            nextRefreshAt={instancesRefresh.nextRefreshAt} 
                            isRefreshing={instancesRefresh.isRefreshing} 
                            onRefreshClick={(e) => { e?.stopPropagation(); instancesRefresh.refreshNow(); }} 
                        />
                    }
                />
                <StatTile
                    label="REQUESTS"
                    value={isRequestsLoading ? '...' : requests.length}
                    color="var(--color-accent)"
                    onClick={() => setShowRequests(true)}
                    headerRight={
                        <RefreshTimer 
                            nextRefreshAt={requestsRefresh.nextRefreshAt} 
                            isRefreshing={requestsRefresh.isRefreshing} 
                            onRefreshClick={(e) => { e?.stopPropagation(); requestsRefresh.refreshNow(); }} 
                        />
                    }
                />
                <StatTile
                    label="BANS"
                    value={isBansLoading ? '...' : bans.length}
                    color="var(--color-danger)"
                    onClick={() => setShowBans(true)}
                    headerRight={
                        <RefreshTimer 
                            nextRefreshAt={bansRefresh.nextRefreshAt} 
                            isRefreshing={bansRefresh.isRefreshing} 
                            onRefreshClick={(e) => { e?.stopPropagation(); bansRefresh.refreshNow(); }} 
                        />
                    }
                />
            </div>
        </GlassPanel>


        {/* Main Content Split */}
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
                
                {/* Left: Activity Feed */}
                <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Recent Activity</h3>
                        <NeonButton size="sm" variant="secondary" onClick={() => fetchLogs(selectedGroup?.id || '')} disabled={isLogsLoading}>
                            {isLogsLoading ? 'Refreshing...' : 'Refresh'}
                        </NeonButton>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                        {logs.length === 0 ? (
                            <div style={{ 
                                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                color: 'var(--color-text-dim)', flexDirection: 'column', gap: '0.5rem' 
                            }}>
                               <span style={{ fontSize: '2rem' }}>📝</span>
                               <span>No recent activity</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {logs.slice(0, 20).map(log => {
                                    const { actor, description } = formatLogEntry(log);
                                    return (
                                    <motion.div 
                                        key={log.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '1rem', 
                                            padding: '0.75rem', 
                                            background: 'rgba(255,255,255,0.03)', 
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.2rem' }}>{getLogIcon(log.type || '')}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span 
                                                    style={{ 
                                                        fontWeight: 600, 
                                                        color: getLogColor(log.type || ''),
                                                        cursor: 'pointer',
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openProfile(log.actorId);
                                                    }}
                                                    className={styles.clickableActor}
                                                >
                                                    {actor}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)', marginTop: '0.1rem' }}>
                                                {description}
                                            </div>
                                        </div>
                                    </motion.div>
                                );})}
                            </div>
                        )}
                    </div>
                </GlassPanel>

                {/* Right: Quick Actions & Status */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Status Card */}
                    <GlassPanel style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>System Status</h3>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                            <span>Pipeline Connection</span>
                            <PipelineIndicator />
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                             <span>Instance Monitor</span>
                             <span style={{ 
                                 color: instances.length > 0 ? 'var(--color-success)' : 'var(--color-text-dim)',
                                 fontWeight: 600
                             }}>
                                 {instances.length > 0 ? 'Active' : 'Standby'}
                             </span>
                        </div>
                    </GlassPanel>

                    {/* Quick Actions */}
                    <GlassPanel style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Quick Actions</h3>
                        

                        
                        <NeonButton 
                            onClick={() => {
                                 requestsRefresh.refreshNow();
                                 bansRefresh.refreshNow();
                                 instancesRefresh.refreshNow();
                                 fetchGroupMembers(selectedGroup?.id || '', 0);
                                 fetchLogs(selectedGroup?.id || '');
                            }}
                            style={{ width: '100%', justifyContent: 'center' }}
                            variant="secondary"
                        >
                            <span style={{ marginRight: '0.5rem' }}>🔄</span> Refresh All Data
                        </NeonButton>

                        <div style={{ marginTop: 'auto', padding: '1rem', background: 'rgba(var(--primary-hue), 100%, 50%, 0.1)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Tip:</strong>
                            Use the "Live View" for real-time monitoring of your current instance.
                        </div>
                    </GlassPanel>
                </div>
            </div>

        {/* Dialogs */}
        <MembersListDialog isOpen={showMembers} onClose={() => setShowMembers(false)} />
        <RequestsListDialog isOpen={showRequests} onClose={() => setShowRequests(false)} />
        <BansListDialog isOpen={showBans} onClose={() => setShowBans(false)} />
        <InstancesListDialog isOpen={showInstances} onClose={() => setShowInstances(false)} />

    </motion.div>
    </>
  );
});

DashboardView.displayName = 'DashboardView';
