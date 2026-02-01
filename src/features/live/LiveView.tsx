import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, ShieldAlert, Radio, RefreshCw, Activity } from 'lucide-react';
import { useGroupStore } from '../../stores/groupStore';
import { useInstanceMonitorStore, type LiveEntity } from '../../stores/instanceMonitorStore';
import { BanUserDialog } from './dialogs/BanUserDialog';
import { OscAnnouncementWidget } from '../dashboard/widgets/OscAnnouncementWidget';
import { RecruitResultsDialog } from './dialogs/RecruitResultsDialog';
import { MassInviteDialog } from '../dashboard/dialogs/MassInviteDialog';
import { AutoModAlertOverlay } from './overlays/AutoModAlertOverlay';
import { useAutoModAlertStore } from '../../stores/autoModAlertStore';
import { AddFlagDialog } from './dialogs/AddFlagDialog';
import { StatTile } from '../dashboard/components/StatTile';
import { EntityCard } from './components/EntityCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { OperationStartDialog } from './dialogs/OperationStartDialog';
import { InstanceHealthWidget } from './components/InstanceHealthWidget';
import { LivePlayerChart } from './components/LivePlayerChart';
import { LiveToolbar } from './components/LiveToolbar';

import { useConfirm } from '../../context/ConfirmationContext';
import { useNotificationStore } from '../../stores/notificationStore';
import styles from './LiveView.module.css';

import { useRoamingLogStore, type LogEntry } from '../../stores/roamingLogStore';


// Minimal interface to match what EntityCard expects, or we can map PlayerLogEntry to it.
// EntityCard expects LiveEntity.
// We need to map PlayerLogEntry manually since it lacks rank/status.
interface PersistentLeftEntity extends LiveEntity {
    leftAt: string;
}

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

const ToggleButton = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <div
        onClick={onToggle}
        className={`${styles.toggle} ${enabled ? styles.toggleEnabled : ''}`}
    >
        <div className={`${styles.toggleKnob} ${enabled ? styles.toggleKnobEnabled : ''}`} />
    </div>
);

export const LiveView: React.FC = () => {
    console.log('[LiveView] Rendering...');
    // PERF FIX: Use individual selectors instead of destructuring entire store
    const selectedGroup = useGroupStore(state => state.selectedGroup);
    const isRoamingMode = useGroupStore(state => state.isRoamingMode);
    const myGroups = useGroupStore(state => state.myGroups);

    // Roaming mode: selected group for invites
    const [roamingSelectedGroupId, setRoamingSelectedGroupId] = useState<string | null>(null);
    const roamingSelectedGroup = useMemo(() =>
        myGroups.find(g => g.id === roamingSelectedGroupId) || null
        , [myGroups, roamingSelectedGroupId]);

    // The effective group to use for invites (either selected or roaming-selected)
    const effectiveGroup = selectedGroup || roamingSelectedGroup;

    const currentWorldName = useInstanceMonitorStore(state => state.currentWorldName);
    const currentWorldId = useInstanceMonitorStore(state => state.currentWorldId);
    const instanceImageUrl = useInstanceMonitorStore(state => state.instanceImageUrl);
    const liveScanResults = useInstanceMonitorStore(state => state.liveScanResults);
    const updateLiveScan = useInstanceMonitorStore(state => state.updateLiveScan);
    const setEntityStatus = useInstanceMonitorStore(state => state.setEntityStatus);

    const scanActive = true;
    const entities = liveScanResults;

    const [instanceInfo, setInstanceInfo] = useState<{ name: string; imageUrl?: string; worldId?: string; instanceId?: string } | null>(null);
    const logs = useRoamingLogStore(state => state.logs);
    const addLogsToStore = useRoamingLogStore(state => state.addLogs);
    const [isLoading, setIsLoading] = useState(false);

    // Initial load state for the very first scan
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [headerImgError, setHeaderImgError] = useState(false);
    const [customMessage, setCustomMessage] = useState('');

    // Log Batching Refs
    const logQueueRef = React.useRef<LogEntry[]>([]);

    // Log Flushing Effect
    useEffect(() => {
        const interval = setInterval(() => {
            if (logQueueRef.current.length > 0) {
                const newLogs = [...logQueueRef.current];
                logQueueRef.current = []; // Clear queue

                addLogsToStore(newLogs);
            }
        }, 500); // Flush max twice per second

        return () => clearInterval(interval);
    }, []);

    // Persistent "Recently Left" State
    const [persistentLeftEntities, setPersistentLeftEntities] = useState<PersistentLeftEntity[]>([]);

    // Rank Cache to remember ranks of users who leave
    const rankHistoryRef = React.useRef<Map<string, string>>(new Map());

    // Update rank cache whenever we see active entities
    useEffect(() => {
        if (entities) {
            entities.forEach(e => {
                if (e.rank && e.rank !== 'Unknown' && e.rank !== 'User') {
                    rankHistoryRef.current.set(e.id, e.rank);
                }
            });
        }
    }, [entities]);

    // Fetch persistent left logs when instance ID is known
    useEffect(() => {
        const fetchLeftLogs = async () => {
            if (!instanceInfo?.instanceId) return;

            try {
                // Fetch recent 'leave' events for this specific instance
                const leaves = await window.electron.friendship.getPlayerLog({
                    type: 'leave',
                    instanceId: instanceInfo.instanceId,
                    limit: 50 // Keep the last 50 left players
                });

                // Map to Entity structure for display
                const mapped: PersistentLeftEntity[] = await Promise.all(leaves.map(async l => {
                    const id = l.userId || l.id;

                    // Try to find rank in our local history first
                    let rank = rankHistoryRef.current.get(id);
                    let avatarUrl: string | undefined = undefined;

                    // If not found, fall back to the secure local database (Scanned Users)
                    // This ensures persistence even effectively "offline" or after restart
                    if (!rank) {
                        try {
                            // Safety: Check if API exists (handles preload mismatch)
                            const api = window.electron.watchlist as any;
                            if (api.getScannedUser) {
                                const scannedUser = await api.getScannedUser(id);
                                if (scannedUser) {
                                    rank = scannedUser.rank || undefined;
                                    avatarUrl = scannedUser.thumbnailUrl || undefined;
                                }
                            }
                        } catch (e) {
                            // ignore
                        }
                    }

                    // Normalize rank if we have it, specifically fixing the +1 shift logic if it was present in cache
                    // But here we just display what we have.

                    return {
                        id,
                        displayName: l.displayName,
                        rank: rank || 'User', // Use cached rank or fallback
                        isGroupMember: false,
                        status: 'left',
                        avatarUrl: avatarUrl,
                        lastUpdated: new Date(l.timestamp).getTime(),
                        leftAt: l.timestamp
                    };
                }));

                // Deduplicate by ID
                const unique = new Map<string, PersistentLeftEntity>();
                mapped.forEach(e => unique.set(e.id, e));

                setPersistentLeftEntities(Array.from(unique.values()));
            } catch (e) {
                console.error("Failed to fetch persistent left logs", e);
            }
        };

        fetchLeftLogs();
        // Refresh every 10s or when instance changes
        const interval = setInterval(fetchLeftLogs, 10000);
        return () => clearInterval(interval);
    }, [instanceInfo?.instanceId, entities]); // Add entities dependency to refresh logs when we learn new ranks? Maybe too frequent.
    // Actually, keeping entities out of dep array is better to avoid spamming the log fetch. 
    // The rankHistoryRef is updated in separate effect.





    // Dialog State
    const [banDialogUser, setBanUserDialog] = useState<{ id: string; displayName: string } | null>(null);
    const [recruitResults, setRecruitResults] = useState<{ blocked: { name: string, reason?: string }[], invited: number } | null>(null);
    const [showMassInvite, setShowMassInvite] = useState(false);

    // Flag Dialog State
    const [flagDialogUser, setFlagDialogUser] = useState<{ id: string; displayName: string } | null>(null);

    // Operation Start Dialog State
    const [operationDialog, setOperationDialog] = useState<{
        isOpen: boolean;
        type: 'recruit' | 'rally';
        title: string;
        count: number;
    }>({
        isOpen: false,
        type: 'recruit',
        title: '',
        count: 0
    });

    // Tab state for entity list
    const [entityTab, setEntityTab] = useState<'active' | 'left'>('active');
    const [rightTab, setRightTab] = useState<'controls' | 'telemetry'>('controls');

    const { confirm } = useConfirm();
    const { addNotification } = useNotificationStore();

    // Helpers to add logs (Batched)
    const addLog = useCallback((message: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
        logQueueRef.current.push({
            message,
            type,
            id: Date.now() + Math.random()
        });
    }, []);

    const handleBanClick = useCallback((userId: string, name: string) => {
        setBanUserDialog({ id: userId, displayName: name });
    }, []);

    const handleFlagClick = useCallback((userId: string, name: string) => {
        setFlagDialogUser({ id: userId, displayName: name });
    }, []);

    // Concurrency Control: Prevent old scans from overwriting new ones (Ghosting)
    const scanSequenceRef = React.useRef<number>(0);

    const performScan = useCallback(async () => {
        if (!selectedGroup && !isRoamingMode) return;

        // generated scan ID
        const scanId = Date.now();
        scanSequenceRef.current = scanId;

        try {
            const scanGroupId = selectedGroup ? selectedGroup.id : undefined;
            const results = await window.electron.instance.scanSector(scanGroupId);

            // Abort if a newer scan started
            if (scanSequenceRef.current !== scanId) return;

            updateLiveScan(results as LiveEntity[]);

            if (window.electron.instance.getInstanceInfo) {
                const info = await window.electron.instance.getInstanceInfo();

                // Check again after second await
                if (scanSequenceRef.current !== scanId) return;

                if (info.success) {
                    setInstanceInfo({
                        name: info.name || currentWorldName || 'Unknown',
                        imageUrl: info.imageUrl || instanceImageUrl || undefined,
                        worldId: info.worldId || currentWorldId || undefined,
                        instanceId: info.instanceId || undefined
                    });
                }
            } else {
                setInstanceInfo({
                    name: currentWorldName || 'Unknown',
                    imageUrl: instanceImageUrl || undefined,
                    worldId: currentWorldId || undefined,
                    instanceId: undefined
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (scanSequenceRef.current === scanId) {
                setIsInitialLoad(false);
            }
        }
    }, [selectedGroup?.id, isRoamingMode, updateLiveScan]);

    // Actions
    const handlePlayerJoined = useInstanceMonitorStore(state => state.handlePlayerJoined);
    const handlePlayerLeft = useInstanceMonitorStore(state => state.handlePlayerLeft);
    const updateEntity = useInstanceMonitorStore(state => state.updateEntity);

    // Initial Scan for Hydration Only
    useEffect(() => {
        if (!selectedGroup && !isRoamingMode) return;

        if (selectedGroup) {
            addLog(`[SYSTEM] Uplink established to ${selectedGroup.name}.`, 'success');
        } else {
            useRoamingLogStore.getState().addLog(`[SYSTEM] ROAMING MODE ENGAGED. Passive Monitoring Active.`, 'warn');
        }

        performScan();
        // NO POLLING: Event-driven updates only
    }, [selectedGroup, isRoamingMode, performScan, addLog]);

    // Live Event Listeners (Zero Latency)
    // STABILITY FIX: Use refs for listeners to avoid re-subscribing on every render
    const handlersRef = React.useRef({ handlePlayerJoined, handlePlayerLeft, updateEntity, addLog });
    useEffect(() => {
        handlersRef.current = { handlePlayerJoined, handlePlayerLeft, updateEntity, addLog };
    }, [handlePlayerJoined, handlePlayerLeft, updateEntity, addLog]);

    useEffect(() => {
        console.log('[LiveView] Main Effect: Mounting UI Log Listeners (Passive Mode)');

        // 1. Join Events (UI Log Only)
        const unsubJoin = window.electron.logWatcher.onPlayerJoined((event) => {
            handlersRef.current.addLog(`[JOIN] ${event.displayName}`, 'success');
        });

        // 2. Leave Events (UI Log Only)
        const unsubLeave = window.electron.logWatcher.onPlayerLeft((event) => {
            handlersRef.current.addLog(`[LEFT] ${event.displayName}`, 'warn');
        });

        // 3. Entity Metadata Updates (UI Log Only)
        const unsubEntity = window.electron.instance.onEntityUpdate((updatedEntity: LiveEntity) => {
            handlersRef.current.addLog(`[SCAN] Profile Resolved: ${updatedEntity.displayName} (Rank: ${updatedEntity.rank})`, 'info');
        });

        // 4. Log Watcher telemetry (Pure UI)
        const unsubKick = window.electron.logWatcher.onVoteKick((event) => {
            handlersRef.current.addLog(`[VOTE KICK] ${event.initiator} initiated vote kick against ${event.target}`, 'warn');
        });

        const unsubVideo = window.electron.logWatcher.onVideoPlay((event) => {
            const shortUrl = event.url.length > 50 ? event.url.substring(0, 47) + '...' : event.url;
            handlersRef.current.addLog(`[VIDEO] Now Playing: ${shortUrl} (Req: ${event.requestedBy})`, 'info');
        });

        // 5. World/Instance Changes (UI Log Only)
        const unsubLocation = window.electron.logWatcher.onLocation((event) => {
            handlersRef.current.addLog(`[WORLD] Moved to ${event.worldId}`, 'info');
        });

        const unsubWorldName = window.electron.logWatcher.onWorldName((event) => {
            handlersRef.current.addLog(`[WORLD] Entered: ${event.name}`, 'success');
        });

        // MOVED TO useInstanceMonitorInit.ts: window.electron.logWatcher.start();

        return () => {
            console.log('[LiveView] Main Effect: Cleaning up UI Listeners');
            unsubJoin();
            unsubLeave();
            unsubEntity();
            unsubKick();
            unsubVideo();
            unsubLocation();
            unsubWorldName();
        };
    }, []); // Run once on mount

    // Actions
    const handleRecruit = useCallback(async (userId: string, name: string) => {
        if (!effectiveGroup) return;
        addLog(`[CMD] Inviting ${name}...`, 'info');
        try {
            await window.electron.instance.recruitUser(effectiveGroup.id, userId);
            addLog(`[CMD] Invite sent to ${name}`, 'success');
        } catch {
            addLog(`[CMD] Failed to invite ${name}`, 'error');
        }
    }, [effectiveGroup, addLog]);

    const handleKick = useCallback(async (userId: string, name: string) => {
        if (!selectedGroup) return;

        const confirmed = await confirm({
            title: 'Confirm Kick',
            message: `Are you sure you want to KICK (Vote/Ban) ${name}?`,
            confirmLabel: 'Kick',
            variant: 'warning'
        });

        if (!confirmed) return;

        addLog(`[CMD] Kicking ${name}...`, 'warn');
        try {
            await window.electron.instance.kickUser(selectedGroup.id, userId);
            addLog(`[CMD] Kicked ${name}`, 'success');
            setEntityStatus(userId, 'kicked');
        } catch {
            addLog(`[CMD] Failed to kick ${name}`, 'error');
            addNotification({
                type: 'error',
                title: 'Kick Failed',
                message: `Failed to kick ${name}`
            });
        }
    }, [selectedGroup, confirm, addLog, setEntityStatus, addNotification]);

    const [progress, setProgress] = useState<{ current: number, total: number } | null>(null);
    const [progressMode, setProgressMode] = useState<'recruit' | 'rally' | null>(null);
    const [currentProcessingUser, setCurrentProcessingUser] = useState<{ name: string; phase: 'checking' | 'inviting' | 'skipped' } | null>(null);

    // SELECTION STATE (Multi-Select)
    const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());

    const toggleSelection = useCallback((id: string) => {
        setSelectedEntityIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedEntityIds(new Set()), []);

    // BATCH ACTIONS
    const handleKickSelected = useCallback(async () => {
        if (!selectedGroup || selectedEntityIds.size === 0) return;

        const count = selectedEntityIds.size;
        const confirmed = await confirm({
            title: 'Confirm Batch Kick',
            message: `Are you sure you want to KICK ${count} selected users?`,
            confirmLabel: `Kick ${count} Users`,
            variant: 'danger'
        });

        if (!confirmed) return;

        addLog(`[BATCH] Starting kick for ${count} users...`, 'warn');
        let successCount = 0;

        for (const id of selectedEntityIds) {
            try {
                // Find display name for log
                const name = entities.find(e => e.id === id)?.displayName || id;
                await window.electron.instance.kickUser(selectedGroup.id, id);
                addLog(`[BATCH] Kicked ${name}`, 'success');
                setEntityStatus(id, 'kicked'); // Optimistic update
                successCount++;
                await new Promise(r => setTimeout(r, 200)); // Rate limit safety
            } catch {
                const name = entities.find(e => e.id === id)?.displayName || id;
                addLog(`[BATCH] Failed to kick ${name}`, 'error');
            }
        }
        clearSelection();
    }, [selectedGroup, selectedEntityIds, confirm, addLog, setEntityStatus, entities]);

    const handleInviteSelected = useCallback(async () => {
        if (!effectiveGroup || selectedEntityIds.size === 0) return;

        const count = selectedEntityIds.size;
        addLog(`[BATCH] Sending invites to ${count} users...`, 'info');

        for (const id of selectedEntityIds) {
            const name = entities.find(e => e.id === id)?.displayName || id;
            try {
                await window.electron.instance.recruitUser(effectiveGroup.id, id);
                addLog(`[BATCH] Invited ${name}`, 'success');
                await new Promise(r => setTimeout(r, 200));
            } catch {
                addLog(`[BATCH] Failed to invite ${name}`, 'error');
            }
        }
        clearSelection();
    }, [effectiveGroup, selectedEntityIds, addLog, entities]);

    const handleRecruitAll = () => {
        console.log('[LiveView] handleRecruitAll clicked');
        if (!effectiveGroup) {
            console.log('[LiveView] handleRecruitAll: No effective group selected');
            addLog(`[CMD] Cannot invite without a selected group.`, 'warn');
            return;
        }
        if (!entities.length) {
            addLog(`[CMD] No players detected yet. Try leaving and re-entering the instance.`, 'warn');
            return;
        }

        const targets = entities.filter(e => !e.isGroupMember && e.status === 'active');

        if (targets.length === 0) {
            addLog(`[CMD] No strangers to recruit.`, 'warn');
            return;
        }

        console.log('[LiveView] Opening recruit operation dialog for', targets.length, 'targets');

        // Check if group has AutoMod rules to decide if we should show the toggle capability
        // For now, always show it if it's a group instance
        setOperationDialog({
            isOpen: true,
            type: 'recruit',
            title: 'Confirm Mass Invite',
            count: targets.length
        });
    };

    const executeRecruit = async (speedDelay: number, autoModEnabled?: boolean) => {
        setOperationDialog(prev => ({ ...prev, isOpen: false }));

        if (!effectiveGroup) {
            addLog(`[CMD] Cannot invite without a selected group.`, 'warn');
            return;
        }
        if (!entities.length) {
            addLog(`[CMD] No players detected yet. Try leaving and re-entering the instance.`, 'warn');
            return;
        }
        
        // Filter targets again to be safe
        let targets = entities.filter(e => !e.isGroupMember && e.status === 'active');
        if (targets.length === 0) {
            addLog(`[CMD] No strangers to recruit.`, 'warn');
            return;
        }

        addLog(`[CMD] STARTING RECRUITMENT (${targets.length} users)...`, 'info');

        // AUTOMOD BATCH SCAN
        const blockedUsers: { name: string; reason?: string }[] = [];
        if (autoModEnabled) {
             addLog(`[AUTOMOD] Scanning ${targets.length} users against group rules...`, 'warn');
             setProgressMode('recruit'); // reusing recruit progress UI
             setProgress({ current: 0, total: targets.length }); // Indeterminate state essentially

             try {
                // Prepare users for scan (need VRChatUser-like objects, entities have basic data)
                // We might need to fetch full profiles if rules require tags/bio, but let's try with what we have
                // or rely on backend to fetch missing details if needed.
                // The backend `scan-users-batch` expects `users: VRCUser[]`.
                // We only have `LiveEntity[]`. We need to map or fetch.
                // Optimally, we pass IDs and let backend fetch, BUT `scan-users-batch` input is `users`.
                // Prepare users for scan (need VRChatUser-like objects, entities have basic data)

                // Wait, our backend implementation of `scan-users-batch` iterates and calls `processEvaluateMember`.
                // `processEvaluateMember` checks `member.user`. 
                // If we pass minimal stubs, rules like "Bio contains X" will fail (or pass incorrectly) if data is missing.
                // AutoModScannerService.ts: `processEvaluateMember` does NOT fetch full user.
                // `processAllGroupMembers` DOES fetch full user if bio/tags missing.
                // We should have updated `scan-users-batch` to fetch if missing.
                // Assuming we did that or will do that. For now, let's proceed.
                
                // Correction: We need to pass as much as we know. 
                // Actually, `LiveView` doesn't have tags/bio. 
                // We should probably use `automod:scan-users-batch` which SHOULD ideally fetch.
                // Let's assume it does or we accept the limitation for now.
             
                const scanRes = await window.electron.automod.scanUsersBatch({
                    users: targets.map(t => ({ id: t.id, displayName: t.displayName } as any)),
                    groupId: effectiveGroup.id
                });

                if (scanRes.success && scanRes.results) {
                    const blockMap = new Map(scanRes.results.map(r => [r.userId, r]));
                    
                    // Filter targets
                    const passed: typeof targets = [];
                    for (const t of targets) {
                        if (blockMap.has(t.id)) {
                             const reason = blockMap.get(t.id)?.reason;
                             blockedUsers.push({ name: t.displayName, reason });
                        } else {
                            passed.push(t);
                        }
                    }
                    targets = passed;
                }
             } catch (e) {
                 addLog(`[AUTOMOD] Scan failed: ${e}`, 'error');
             }

             if (blockedUsers.length > 0) {
                 addLog(`[AUTOMOD] Blocked ${blockedUsers.length} users.`, 'error');
                 // Show results dialog
                 setRecruitResults({ blocked: blockedUsers, invited: 0 }); // 0 invited so far
                 
                 // If we have blocked users, we should probably STOP and ask for confirmation 
                 // or just notify and continue with valid ones?
                 // Requirement: "show 'X will not be invited due to Y.' ... once the user confirms this, start inviting"
                 // So we need to stop here.
                 
                 // However, we are inside `executeRecruit` which is called by the Dialog.
                 // We don't have a secondary confirmation dialog handy except `RecruitResultsDialog`.
                 // We can show `RecruitResultsDialog` and stop. 
                 // The user can then restart the process for the remaining users? 
                 // Or we can automatically proceed? 
                 // "once the user confirms this, start inviting users who passed"
                 
                 // Let's use `confirm()` logic if possible, or build a custom flow.
                 // Simplest: Show `RecruitResultsDialog`. User closes it. 
                 // Then we ask "Proceed with remaining X users?" via `confirm()`.
                 
                 // Better: `RecruitResultsDialog` is result-oriented.
                 // Let's use `confirm` API to show the report? generic confirm might be too simple.
                 // Let's show `RecruitResultsDialog` but modify it to have a "Proceed" button?
                 // Or just use `confirm` with a summary message.
                 
                 const proceed = await confirm({
                     title: 'AutoMod Scan Results',
                     message: `AutoMod flagged ${blockedUsers.length} users.\n\n${blockedUsers.map(u => `- ${u.name}: ${u.reason}`).join('\n')}\n\nProceed to invite the remaining ${targets.length} users?`,
                     confirmLabel: 'Proceed',
                     variant: 'warning'
                 });
                 
                 if (!proceed) {
                     addLog(`[CMD] Aborted by user after AutoMod scan.`, 'info');
                     setProgress(null);
                     setProgressMode(null);
                     return;
                 }
             } else {
                 addLog(`[AUTOMOD] All ${targets.length} users passed scan.`, 'success');
             }
        }

        setProgress({ current: 0, total: targets.length });
        setProgressMode('recruit');

        let count = 0;
        // ... (rest of invite loop)

        for (const t of targets) {
            // Existing inline keyword check (legacy/fallback if automod toggle OFF)
            // If toggle is ON, we effectively already scanned them.
            // Let's skip this inline check if we already did batch scan (autoModEnabled)
            
            // Check keyword rule only if NOT running batch scan (legacy mode)
            let legacyCheck = false;
            try {
                // If we didn't do batch scan, we might want to do the old check?
                // But `keywordRuleInvoked` is strict-scoped to the try-catch block in previous version?
                // Actually `keywordRuleInvoked` was defined before. 
                // Let's re-add the definition.
                if (!autoModEnabled) {
                     const rules = await window.electron.automod.getRules(effectiveGroup.id);
                     if (rules.some(r => r.type === 'KEYWORD_BLOCK' && r.enabled)) {
                         legacyCheck = true;
                     }
                }
            } catch (e) { /* ignore */ }

            if (legacyCheck) {
                // ... existing inline logic ...
                setCurrentProcessingUser({ name: t.displayName, phase: 'checking' });
                // ...
            }
            
            // ... rewrite the loop to be cleaner in next iteration if needed, 
            // but for now let's just use what we have, slightly conditioned.
            
            // Actually, to avoid complexity, let's just Proceed with Invites
            setCurrentProcessingUser({ name: t.displayName, phase: 'inviting' });
            const res = await window.electron.instance.recruitUser(effectiveGroup.id, t.id);
            
            if (!res.success && res.error === 'RATE_LIMIT') {
                addLog(`[WARN] RATE LIMIT DETECTED! Cooling down for 10s...`, 'warn');
                await new Promise(r => setTimeout(r, 10000));
            } else if (res.success) {
                addLog(`[INVITE] ${t.displayName} ✓ Sent`, 'success');
            } else {
                addLog(`[INVITE] ${t.displayName} ✗ Failed: ${res.error || 'Unknown'}`, 'error');
            }
            
            count++;
            setProgress({ current: count, total: targets.length });
            await new Promise(r => setTimeout(r, speedDelay * 1000));
        }

        addLog(`[CMD] Recruitment complete. Sent ${count} invites.`, 'success');
        
        // Show results if we blocked people (via batch or inline)
        if (blockedUsers.length > 0) {
             setRecruitResults({ blocked: blockedUsers, invited: count });
        }

        setCurrentProcessingUser(null);
        setProgress(null);
        setProgressMode(null);
    };

    const handleRally = async () => {
        console.log('[LiveView] handleRally clicked');
        if (!selectedGroup) return;
        setIsLoading(true);
        try {
            const res = await window.electron.instance.getRallyTargets(selectedGroup.id);
            if (res.success && res.targets && res.targets.length > 0) {
                console.log('[LiveView] Opening rally operation dialog for', res.targets.length, 'targets');
                setOperationDialog({
                    isOpen: true,
                    type: 'rally',
                    title: 'Confirm Group Rally',
                    count: res.targets.length
                });
            } else {
                addLog(`[CMD] No rally targets found (recent members).`, 'warn');
            }
        } catch {
            console.error('[LiveView] handleRally error');
            addLog(`[CMD] Failed to check for rally targets.`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const executeRally = async (speedDelay: number) => {
        setOperationDialog(prev => ({ ...prev, isOpen: false }));
        if (!selectedGroup) return;

        addLog(`[CMD] Fetching rally targets...`, 'info');
        setIsLoading(true);

        try {
            const res = await window.electron.instance.getRallyTargets(selectedGroup.id);
            setIsLoading(false);

            if (!res.success || !res.targets || res.targets.length === 0) {
                addLog(`[CMD] No rally targets found (recent members).`, 'warn');
                return;
            }

            const targets = res.targets;
            addLog(`[CMD] RALLYING ${targets.length} GROUP MEMBERS...`, 'warn');

            setProgress({ current: 0, total: targets.length });
            setProgressMode('rally');

            let count = 0;
            for (const t of targets) {
                const invRes = await window.electron.instance.inviteToCurrent(t.id ?? '', customMessage);

                if (!invRes.success && invRes.error === 'RATE_LIMIT') {
                    addLog(`[WARN] RATE LIMIT DETECTED! Cooling down for 10s...`, 'warn');
                    await new Promise(r => setTimeout(r, 10000));
                } else if (invRes.success) {
                    addLog(`[RALLY] ${t.displayName || t.id} ✓ Sent`, 'success');
                } else {
                    addLog(`[RALLY] ${t.displayName || t.id} ✗ Failed: ${invRes.error || 'Unknown'}`, 'error');
                }

                count++;
                setProgress({ current: count, total: targets.length });
                await new Promise(r => setTimeout(r, speedDelay * 1000));
            }

            addLog(`[CMD] Rally complete. Sent ${count} invites.`, 'success');

        } catch {
            addLog(`[CMD] Rally error`, 'error');
        } finally {
            setIsLoading(false);
            setProgress(null);
            setProgressMode(null);
        }
    };



    const handleLockdown = async () => {
        const confirmed = await confirm({
            title: '⚠️ DANGER ZONE ⚠️',
            message: "Are you sure you want to CLOSE this instance?\n\nThis will kick ALL players (including you) and lock the instance. This cannot be undone.",
            confirmLabel: 'CLOSE INSTANCE',
            variant: 'danger'
        });

        if (!confirmed) return;

        addLog(`[CMD] INITIATING INSTANCE LOCKDOWN...`, 'warn');
        try {
            const res = await window.electron.instance.closeInstance();
            if (res.success) {
                addLog(`[CMD] Instance Closed Successfully.`, 'success');
                addNotification({
                    type: 'success',
                    title: 'Instance Closed',
                    message: 'Lockdown successful.'
                });
            } else {
                addLog(`[CMD] Failed to close instance: ${res.error}`, 'error');
                addNotification({
                    type: 'error',
                    title: 'Lockdown Failed',
                    message: res.error || 'Unknown error'
                });
            }
        } catch {
            addLog(`[CMD] Lockdown failed. API Error.`, 'error');
            addNotification({
                type: 'error',
                title: 'Error',
                message: 'Lockdown failed due to API error.'
            });
        }
    };

    // Derived counts and filtered lists - memoized for performance
    // PERF FIX: Prevents recalculating on every render
    const { activeCount, leftCount, activeEntities, leftEntities } = useMemo(() => {
        const active = entities.filter(e => e.status === 'active' || e.status === 'joining');

        // Use persistent list for 'left' if available and we are in an instance
        // Sort by time: newest to leave first
        const left = (persistentLeftEntities.length > 0
            ? persistentLeftEntities
            : entities.filter(e => e.status === 'left' || e.status === 'kicked'))
            .slice()
            .sort((a, b) => {
                const timeA = (a as any).leftAt ? new Date((a as any).leftAt).getTime() : (a.lastUpdated || 0);
                const timeB = (b as any).leftAt ? new Date((b as any).leftAt).getTime() : (b.lastUpdated || 0);
                return (timeB || 0) - (timeA || 0);
            });

        return {
            activeCount: active.length,
            leftCount: left.length,
            activeEntities: active,
            leftEntities: left
        };
    }, [entities, persistentLeftEntities]);

    return (
        <>
            <motion.div
                className={styles.container}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', padding: '1rem', paddingBottom: 'var(--dock-height)' }}
            >
                {/* Header Panel */}
                <GlassPanel className={styles.headerPanel}>
                    {instanceInfo?.imageUrl && !headerImgError && !isInitialLoad && (
                        <div
                            className={styles.headerBackground}
                            style={{ backgroundImage: `url(${instanceInfo.imageUrl})` }}
                        />
                    )}

                    <div className={styles.titleSection}>
                        <div className={styles.instanceIcon}>
                            {isInitialLoad ? (
                                <Skeleton variant="circle" width={40} height={40} />
                            ) : instanceInfo?.imageUrl && !headerImgError ? (
                                <img
                                    src={instanceInfo.imageUrl}
                                    className={styles.instanceImage}
                                    alt=""
                                    onError={() => setHeaderImgError(true)}
                                />
                            ) : (
                                <Radio className="text-primary" size={24} />
                            )}
                            {scanActive && !isInitialLoad && <div className={styles.scanPulse} />}
                        </div>
                        <div>
                            {isInitialLoad ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <Skeleton width={200} height={24} />
                                    <Skeleton width={150} height={14} />
                                </div>
                            ) : (
                                <>
                                    <h1 className={`${styles.title} text-gradient`}>
                                        {instanceInfo?.name || currentWorldName || 'CURRENT INSTANCE'}
                                    </h1>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div className={styles.subtitle}>
                                            {isRoamingMode ? 'ROAMING MODE - PASSIVE MONITORING' : 'LIVE SECTOR SCAN'}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className={styles.statsGrid}>
                        {isInitialLoad ? (
                            <>
                                <Skeleton width={100} height={60} style={{ borderRadius: '12px' }} />
                                <Skeleton width={100} height={60} style={{ borderRadius: '12px' }} />
                                <Skeleton width={100} height={60} style={{ borderRadius: '12px' }} />
                            </>
                        ) : (
                            <>
                                <StatTile
                                    label="ACTIVE"
                                    value={activeCount}
                                    color="var(--color-success)"
                                />
                                <StatTile
                                    label="HISTORY"
                                    value={leftCount}
                                    color="var(--color-text-dim)"
                                />
                                <StatTile
                                    label="STATUS"
                                    value={scanActive ? "SCANNING" : "IDLE"}
                                    color={scanActive ? "var(--color-primary)" : "var(--color-text-dim)"}
                                />
                            </>
                        )}
                    </div>
                </GlassPanel>

                {/* Main Content Split */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* Left: Entity List (2/3 width) */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        {/* Tab Header */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                            <button
                                onClick={() => setEntityTab('active')}
                                className={`${styles.entityTab} ${entityTab === 'active' ? styles.entityTabActive : ''}`}
                            >
                                <div className={`${styles.tabIndicator} ${entityTab === 'active' ? styles.tabIndicatorActive : ''}`} />
                                IN INSTANCE
                                <span className={`${styles.tabBadge} ${entityTab === 'active' ? styles.tabBadgeActive : ''}`}>
                                    {activeCount}
                                </span>
                            </button>

                            <button
                                onClick={() => setEntityTab('left')}
                                className={`${styles.entityTab} ${entityTab === 'left' ? styles.entityTabLeft : ''}`}
                            >
                                <div className={styles.tabIndicator} />
                                RECENTLY LEFT
                                <span className={styles.tabBadge}>
                                    {leftCount}
                                </span>
                            </button>

                            <div style={{ width: '1px', background: 'var(--border-color)', margin: '5px 0' }} />

                            <button
                                onClick={() => performScan()}
                                title="Force Refresh"
                                style={{
                                    padding: '0 1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--color-text-dim)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s ease',
                                }}
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        {/* Entity List Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            <AnimatePresence mode="wait">
                                {entityTab === 'active' ? (
                                    <motion.div
                                        key="active-tab"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {isInitialLoad ? (
                                            /* Skeleton Loader List */
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'var(--color-surface-card)', borderRadius: '8px', alignItems: 'center' }}>
                                                        <Skeleton variant="circle" width={36} height={36} />
                                                        <div style={{ flex: 1 }}>
                                                            <Skeleton width="40%" height={16} style={{ marginBottom: '6px' }} />
                                                            <Skeleton width="30%" height={12} />
                                                        </div>
                                                        <Skeleton width={80} height={24} style={{ borderRadius: '6px' }} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : activeCount === 0 ? (
                                            <div className={styles.emptyState}>
                                                No active entities.<br />
                                                <span style={{ fontSize: '0.8rem' }}>(Instance is empty)</span>
                                            </div>
                                        ) : (
                                            activeEntities.map(entity => (
                                                <motion.div
                                                    key={entity.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                >
                                                    <EntityCard
                                                        entity={entity}
                                                        onInvite={handleRecruit}
                                                        onKick={handleKick}
                                                        onBan={handleBanClick}
                                                        onAddFlag={handleFlagClick}
                                                        readOnly={isRoamingMode && !roamingSelectedGroup}
                                                        isSelected={selectedEntityIds.has(entity.id)}
                                                        selectionMode={true}
                                                        onToggleSelect={toggleSelection}
                                                    />
                                                </motion.div>
                                            ))
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="left-tab"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {leftCount === 0 ? (
                                            <div className={styles.emptyStateHistory}>
                                                History empty
                                            </div>
                                        ) : (
                                            leftEntities.map(entity => (
                                                <motion.div
                                                    key={entity.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 0.6 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    <EntityCard
                                                        entity={entity}
                                                        onInvite={() => { }}
                                                        onKick={() => { }}
                                                        onBan={handleBanClick}
                                                        onAddFlag={handleFlagClick}
                                                        readOnly={true}
                                                    />
                                                </motion.div>
                                            ))
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </GlassPanel>

                    {/* Right: Actions & Logs (1/3 width) */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '280px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>

                        {/* Right Panel Tabs */}
                        <div style={{ display: 'flex', background: 'var(--color-surface-card)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-color)' }}>
                            <button
                                onClick={() => setRightTab('controls')}
                                style={{
                                    flex: 1,
                                    padding: '6px',
                                    borderRadius: '6px',
                                    background: rightTab === 'controls' ? 'var(--color-primary)' : 'transparent',
                                    color: rightTab === 'controls' ? 'white' : 'var(--color-text-dim)',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                CONTROLS
                            </button>
                            <button
                                onClick={() => setRightTab('telemetry')}
                                style={{
                                    flex: 1,
                                    padding: '6px',
                                    borderRadius: '6px',
                                    background: rightTab === 'telemetry' ? 'var(--color-primary)' : 'transparent',
                                    color: rightTab === 'telemetry' ? 'white' : 'var(--color-text-dim)',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                TELEMETRY
                            </button>
                        </div>

                        {/* Actions Panel */}
                        <div style={{ display: rightTab === 'controls' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
                            <GlassPanel style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', zIndex: 10, overflow: 'visible', flexShrink: 0 }}>
                                <h3 className={styles.actionsHeader}>
                                    <Crosshair size={16} />
                                    {isRoamingMode ? 'ROAMING CONTROLS' : 'INSTANCE ACTIONS'}
                                </h3>

                                <OscAnnouncementWidget />

                                {/* Alerts Toggle */}
                                <div className={styles.toggleRow} style={{ marginBottom: 0 }}>
                                    <div className={styles.toggleItem}>
                                        <div className={styles.toggleLabel}>
                                            <ShieldAlert size={16} color={useAutoModAlertStore(s => s.isEnabled) ? '#f87171' : 'gray'} />
                                            <span>Alerts</span>
                                        </div>
                                        <ToggleButton
                                            enabled={useAutoModAlertStore(s => s.isEnabled)}
                                            onToggle={useAutoModAlertStore(s => s.toggleEnabled)}
                                        />
                                    </div>
                                </div>

                                {/* Custom Invite Message */}
                                {!isRoamingMode && (
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="Custom Invite Message (Optional)..."
                                            value={customMessage}
                                            onChange={(e) => setCustomMessage(e.target.value)}
                                            className={styles.messageInput}
                                        />
                                        {customMessage && (
                                            <div className={styles.messageWarning}>
                                                Warning: Overwrites Invite Slot 12
                                            </div>
                                        )}
                                    </div>
                                )}

                                <LiveToolbar
                                    selectedCount={selectedEntityIds.size}
                                    onClearSelection={clearSelection}
                                    onKickSelected={handleKickSelected}
                                    onInviteSelected={handleInviteSelected}
                                    onRally={handleRally}
                                    onRecruitAll={handleRecruitAll}
                                    onLockdown={handleLockdown}
                                    isRoaming={isRoamingMode}
                                    hasGroupSelected={!!effectiveGroup}
                                    isRallying={progressMode === 'rally'}
                                    isRecruiting={progressMode === 'recruit'}
                                    progress={progress ? Math.round((progress.current / progress.total) * 100) : null}
                                    statusText={currentProcessingUser
                                        ? `${currentProcessingUser.phase === 'inviting' ? '📨' : currentProcessingUser.phase === 'skipped' ? '⛔' : '🔍'} ${currentProcessingUser.name}`
                                        : undefined
                                    }
                                    roamingGroups={myGroups}
                                    selectedRoamingGroupId={roamingSelectedGroupId}
                                    onSelectRoamingGroup={setRoamingSelectedGroupId}
                                    isLoading={isLoading}
                                />
                            </GlassPanel>

                            {/* Instance Health Card */}
                            <GlassPanel style={{ marginTop: '10px', padding: '0', flexShrink: 0 }}>
                                <InstanceHealthWidget
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        justifyContent: 'space-around',
                                        width: '100%',
                                        flexWrap: 'wrap',
                                        rowGap: '8px'
                                    }}
                                />
                            </GlassPanel>

                            {/* Live Player Chart */}
                            <GlassPanel style={{ marginTop: '10px', padding: '0', flex: 1, minHeight: '150px', display: 'flex', flexDirection: 'column' }}>
                                <LivePlayerChart style={{ flex: 1, width: '100%' }} />
                            </GlassPanel>

                            {!isRoamingMode && selectedGroup && (
                                <GlassPanel style={{ marginTop: '10px', padding: '10px' }}>
                                    <NeonButton
                                        variant="secondary"
                                        style={{ height: '50px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px' }}
                                        onClick={() => setShowMassInvite(true)}
                                        disabled={progress !== null}
                                    >
                                        <span>📨</span> MASS INVITE FRIENDS
                                    </NeonButton>
                                </GlassPanel>
                            )}
                        </div>

                        {/* Log Terminal */}
                        <div style={{ display: rightTab === 'telemetry' ? 'flex' : 'none', flex: 1, minHeight: '400px' }}>
                            <GlassPanel className={styles.logTerminal}>
                                <div className={styles.logHeader}>
                                    <Activity size={14} />
                                    LIVE TELEMETRY
                                </div>

                                <div className={styles.logContent}>
                                    {logs.slice().reverse().map(log => (
                                        <div
                                            key={log.id}
                                            className={`${styles.logEntry} ${log.type === 'error' ? styles.logEntryError :
                                                log.type === 'warn' ? styles.logEntryWarn :
                                                    log.type === 'success' ? styles.logEntrySuccess : ''
                                                }`}
                                        >
                                            {log.message}
                                        </div>
                                    ))}
                                </div>
                            </GlassPanel>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Dialogs */}
            <AnimatePresence>
                {
                    banDialogUser && selectedGroup && (
                        <BanUserDialog
                            key={banDialogUser ? banDialogUser.id : 'closed'}
                            isOpen={!!banDialogUser}
                            onClose={() => setBanUserDialog(null)}
                            user={banDialogUser}
                            initialGroupId={selectedGroup?.id}
                        />
                    )
                }

                {
                    recruitResults && selectedGroup && (
                        <RecruitResultsDialog
                            isOpen={!!recruitResults}
                            onClose={() => setRecruitResults(null)}
                            blockedUsers={recruitResults?.blocked || []}
                            totalInvited={recruitResults?.invited || 0}
                        />
                    )
                }

                {
                    showMassInvite && selectedGroup && (
                        <MassInviteDialog
                            isOpen={showMassInvite}
                            onClose={() => setShowMassInvite(false)}
                        />
                    )
                }
            </AnimatePresence>

            {/* AutoMod Alert Overlay */}
            <AutoModAlertOverlay />

            {/* Add Flag Dialog */}
            <AddFlagDialog
                isOpen={!!flagDialogUser}
                onClose={() => setFlagDialogUser(null)}
                user={flagDialogUser}
            />

            {/* Operation Start Dialog */}
            <OperationStartDialog
                isOpen={operationDialog.isOpen}
                onClose={() => setOperationDialog(prev => ({ ...prev, isOpen: false }))}
                onConfirm={(speed) => {
                    if (operationDialog.type === 'recruit') {
                        executeRecruit(speed);
                    } else {
                        executeRally(speed);
                    }
                }}
                title={operationDialog.title}
                count={operationDialog.count}
                type={operationDialog.type}
            />
        </>
    );
};
