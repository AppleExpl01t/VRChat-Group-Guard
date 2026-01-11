import React, { useState, useEffect, useCallback } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Users, Radio, Crosshair, UserPlus, Activity, Gavel } from 'lucide-react';
import { AppShieldIcon } from '../../components/ui/AppShieldIcon';
import { useGroupStore } from '../../stores/groupStore';
import { useInstanceMonitorStore, type LiveEntity } from '../../stores/instanceMonitorStore';
import { BanUserDialog } from './dialogs/BanUserDialog';
import { OscAnnouncementWidget } from '../dashboard/widgets/OscAnnouncementWidget';
import { RecruitResultsDialog } from './dialogs/RecruitResultsDialog';
import { AutoModAlertOverlay } from './overlays/AutoModAlertOverlay';
import { useAutoModAlertStore } from '../../stores/autoModAlertStore';

interface LogEntry {
    message: string;
    type: 'info' | 'warn' | 'success' | 'error';
    id: number;
}

const EntityCard: React.FC<{ 
    entity: LiveEntity; 
    onInvite: (id: string, name: string) => void;
    onKick: (id: string, name: string) => void;
    onBan: (id: string, name: string) => void;
    readOnly?: boolean;
}> = ({ entity, onInvite, onKick, onBan, readOnly }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '8px',
        marginBottom: '8px',
        transition: 'background 0.2s'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                background: !readOnly && entity.isGroupMember ? 'rgba(var(--primary-hue), 100%, 50%, 0.2)' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: !readOnly && entity.isGroupMember ? 'var(--color-primary)' : 'var(--color-text-dim)',
                overflow: 'hidden'
            }}>
                {entity.avatarUrl ? (
                    <img src={entity.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <Users size={18} />
                )}
            </div>
            <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white' }}>{entity.displayName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {!readOnly ? (
                        <>
                            <span style={{ 
                                color: entity.isGroupMember ? 'var(--color-primary)' : '#fca5a5',
                                fontWeight: 'bold'
                            }}>
                                {entity.isGroupMember ? 'MEMBER' : 'NON-MEMBER'}
                            </span>
                            <span>•</span>
                            <span>{entity.rank}</span>
                        </>
                    ) : (
                        <span>Detected User</span>
                    )}
                </div>
            </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
            {!readOnly && !entity.isGroupMember && (
                <NeonButton 
                    size="sm" 
                    variant="secondary" 
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    onClick={() => onInvite(entity.id, entity.displayName)}
                    title="Invite to Group"
                >
                    <UserPlus size={14} />
                </NeonButton>
            )}
             
            {/* Ban Manager Button (Available even if readOnly / recently left) */}
             <NeonButton 
                size="sm" 
                variant="danger" 
                style={{ padding: '4px 8px', fontSize: '0.75rem', opacity: readOnly ? 0.8 : 1 }}
                onClick={() => onBan(entity.id, entity.displayName)}
                title="Ban Manager"
            >
                <Gavel size={14} />
            </NeonButton>

            {!readOnly && (
                <NeonButton 
                    size="sm" 
                    variant="danger" 
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    onClick={() => onKick(entity.id, entity.displayName)}
                    title="Kick from Instance"
                >
                    <AppShieldIcon size={14} />
                </NeonButton>
            )}
        </div>
    </div>
);

export const LiveView: React.FC = () => {
    const { selectedGroup, isRoamingMode } = useGroupStore();
    const { currentWorldName, currentWorldId, instanceImageUrl, liveScanResults, updateLiveScan, setEntityStatus } = useInstanceMonitorStore();
    const scanActive = true; // Scan is always active when in LiveView
    const entities = liveScanResults;
    
    const [instanceInfo, setInstanceInfo] = useState<{ name: string; imageUrl?: string; worldId?: string; instanceId?: string } | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [customMessage, setCustomMessage] = useState('');
    
    // AutoBan State
    const [liveAutoBan, setLiveAutoBan] = useState(false);
    
    useEffect(() => {
        window.electron?.automod?.getLiveAutoBan?.().then(setLiveAutoBan).catch(() => {});
    }, []);
    
    const toggleLiveAutoBan = async () => {
        const newValue = !liveAutoBan;
        setLiveAutoBan(newValue);
        await window.electron?.automod?.setLiveAutoBan?.(newValue);
    };
    
    // Dialog State
    const [banDialogUser, setBanUserDialog] = useState<{ id: string; displayName: string } | null>(null);
    const [recruitResults, setRecruitResults] = useState<{ blocked: {name:string, reason?:string}[], invited: number } | null>(null);
    
    // Tab state for entity list
    const [entityTab, setEntityTab] = useState<'active' | 'left'>('active');

    // Helpers to add logs
    const addLog = useCallback((message: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
        setLogs(prev => [...prev.slice(-49), { message, type, id: Date.now() + Math.random() }]);
    }, []);


    const handleBanClick = (userId: string, name: string) => {
        setBanUserDialog({ id: userId, displayName: name });
    };


    // ... (render logic) ...

    const performScan = useCallback(async () => {
        if (!selectedGroup && !isRoamingMode) return;
        
        try {
            // 1. Scan Entities
            const scanGroupId = selectedGroup ? selectedGroup.id : undefined;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const results = await window.electron.instance.scanSector(scanGroupId as any);

            // Update store (it handles active/left logic)
            // We need to cast results to LiveEntity[] if types mismatch slightly or ensure implicit compatibility
            updateLiveScan(results as LiveEntity[]);

            // 2. Fetch Instance Info
            // ... (rest same) ...
            if (window.electron.instance.getInstanceInfo) {
                const info = await window.electron.instance.getInstanceInfo();
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
        }
    }, [selectedGroup, isRoamingMode, currentWorldName, currentWorldId, instanceImageUrl, updateLiveScan]);

    // Initial and Periodic Scan
    useEffect(() => {
        if (!selectedGroup && !isRoamingMode) return;
        
        if (selectedGroup) {
            addLog(`[SYSTEM] Uplink established to ${selectedGroup.name}.`, 'success');
        } else {
            setLogs(prev => {
                const lastLog = prev[prev.length - 1];
                if (lastLog && lastLog.message.includes('ROAMING MODE ENGAGED')) return prev;
                return [...prev.slice(-49), { message: `[SYSTEM] ROAMING MODE ENGAGED. Passive Monitoring Active.`, type: 'warn', id: Date.now() }];
            });
        }

        performScan();

        const interval = setInterval(performScan, 5000); // 5s poll
        return () => clearInterval(interval);
    }, [selectedGroup, isRoamingMode, performScan, addLog]);

    // Listen for Entity Updates (Live)
    useEffect(() => {
        const unsubscribe = window.electron.instance.onEntityUpdate((updatedEntity: LiveEntity) => {
             // We can just call updateLiveScan with single entity? 
             // Logic in store assumes list. 
             // Simpler to just trigger a rescan or add a 'updateSingleEntity' action?
             // For now, re-using updateLiveScan with [entity] might act weird if logic assumes full snapshot.
             // Store logic: "Mark all current active as left... then revive". 
             // PASSING A SINGLE ENTITY WOULD MARK EVERYONE ELSE AS LEFT!
             
             // CORRECT FIX: We need a mergeEntity or similar action in Store, OR just let the polling handle it.
             // But realtime is nice.
             // Actually, the current socket event might be "partial update", but 'scanSector' is "full snapshot".
             // Let's assume for now we just rely on polling (performScan) which runs every 5s.
             // OR, better: The previous code was:
             /*
             setEntities(prev => {
                 const clone = [...prev];
                 const idx = clone.findIndex(e => e.id === updatedEntity.id);
                 if (idx >= 0) { clone[idx] = updatedEntity; } else { clone.push(updatedEntity); }
                 return clone;
             });
             */
             // I should add `mergeEntity` to store if I want this. 
             // For now, I'll skip realtime single-entity updates to avoid complexity/bugs and rely on the 5s poll.
             // The user didn't ask for realtime optimizations, just persistence.
             
             addLog(`[SCAN] Profile Resolved: ${updatedEntity.displayName} (Rank: ${updatedEntity.rank})`, 'info');
        });
        return unsubscribe;
    }, [addLog]);


    // Actions
    const handleRecruit = async (userId: string, name: string) => {
        if (!selectedGroup) return;
        addLog(`[CMD] Inviting ${name}...`, 'info');
        try {
            await window.electron.instance.recruitUser(selectedGroup.id, userId);
            addLog(`[CMD] Invite sent to ${name}`, 'success');
        } catch {
            addLog(`[CMD] Failed to invite ${name}`, 'error');
        }
    };

    const handleKick = async (userId: string, name: string) => {
        if (!selectedGroup) return;
        if (!confirm(`Are you sure you want to KICK (Vote/Ban) ${name}?`)) return;
        
        addLog(`[CMD] Kicking ${name}...`, 'warn');
        try {
            await window.electron.instance.kickUser(selectedGroup.id, userId);
            addLog(`[CMD] Kicked ${name}`, 'success');
             // Update store state
             setEntityStatus(userId, 'kicked');
        } catch {
            addLog(`[CMD] Failed to kick ${name}`, 'error');
        }
    };
    
    const [progress, setProgress] = useState<{ current: number, total: number } | null>(null);
    const [progressMode, setProgressMode] = useState<'recruit' | 'rally' | null>(null);
    const [currentProcessingUser, setCurrentProcessingUser] = useState<{ name: string; phase: 'checking' | 'inviting' | 'skipped' } | null>(null);

    // ... existing code ...

    const handleRecruitAll = async () => {
        if (!entities.length) return;
        const targets = entities.filter(e => !e.isGroupMember && e.status === 'active');
        if (targets.length === 0) {
            addLog(`[CMD] No strangers to recruit.`, 'warn');
            return;
        }
        
        addLog(`[CMD] SENDING MASS INVITES TO ${targets.length} STRANGERS...`, 'warn');
        
        // Check for AutoMod Keyword Rule
        let keywordRuleInvoked = false;
        try {
            const rules = await window.electron.automod.getRules();
            keywordRuleInvoked = rules.some(r => r.type === 'KEYWORD_BLOCK' && r.enabled);
            if (keywordRuleInvoked) {
                 addLog(`[AUTOMOD] Keyword Filter Active: Scanning profiles...`, 'info');
            }
        } catch (e) {
            console.error("Failed to fetch automod rules", e);
        }

        setProgress({ current: 0, total: targets.length });
        setProgressMode('recruit');
        
        let count = 0;
        const blocked: { name: string; reason?: string }[] = [];
        
        for (const t of targets) {
            // Check user against AutoMod keyword filter if enabled
            if (keywordRuleInvoked) {
                setCurrentProcessingUser({ name: t.displayName, phase: 'checking' });
                
                // Brief delay to show "checking" state visually
                await new Promise(r => setTimeout(r, 200));
                
                try {
                    // Fetch full user profile to check bio/status
                    const userRes = await window.electron.getUser(t.id);
                    if (userRes.success && userRes.user) {
                        const checkRes = await window.electron.automod.checkUser({
                            id: t.id,
                            displayName: t.displayName,
                            tags: userRes.user.tags,
                            bio: userRes.user.bio,
                            status: userRes.user.status,
                            statusDescription: userRes.user.statusDescription,
                            pronouns: userRes.user.pronouns
                        });


                        // STEP 2: If blocked, skip this user
                        if (checkRes.action === 'REJECT' || checkRes.action === 'AUTO_BLOCK') {
                            setCurrentProcessingUser({ name: t.displayName, phase: 'skipped' });
                            blocked.push({ name: t.displayName, reason: checkRes.reason });
                            addLog(`[AUTOMOD] Skipped ${t.displayName} (Match: ${checkRes.reason})`, 'warn');
                            setProgress({ current: count + blocked.length, total: targets.length });
                            await new Promise(r => setTimeout(r, 300)); // Longer pause to show skip status
                            continue; 
                        }
                    }
                } catch (e) {
                    console.error("AutoMod check failed for user", t.displayName, e);
                }
            }
            
            // STEP 3: Send invite (passed AutoMod or AutoMod disabled)
            setCurrentProcessingUser({ name: t.displayName, phase: 'inviting' });

            const res = await window.electron.instance.recruitUser(selectedGroup!.id, t.id);
            
            if (!res.success && res.error === 'RATE_LIMIT') {
                addLog(`[WARN] RATE LIMIT DETECTED! Cooling down for 10s...`, 'warn');
                await new Promise(r => setTimeout(r, 10000));
            }
            
            count++;
            setProgress({ current: count + blocked.length, total: targets.length });
            await new Promise(r => setTimeout(r, 250));
        }
        
        addLog(`[CMD] Recruitment complete. Sent ${count} invites.`, 'success');
        
        
        // Show results dialog if AutoMod was active (to confirm it worked) or if any users were blocked
        if (keywordRuleInvoked || blocked.length > 0) {
            if (blocked.length > 0) {
                addLog(`[AUTOMOD] Blocked ${blocked.length} users from invite list.`, 'warn');
            } else {
                addLog(`[AUTOMOD] All users passed AutoMod check.`, 'success');
            }
            setRecruitResults({ blocked, invited: count });
        }
        
        setCurrentProcessingUser(null);
        setProgress(null);
        setProgressMode(null);
    };

    // ... existing code ...

    const handleRally = async () => {
        if (!selectedGroup) return;
        
        addLog(`[CMD] Fetching rally targets...`, 'info');
        setIsLoading(true);
        
        try {
             // 1. Get Targets
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
                 // 2. Invite Loop
                 const invRes = await window.electron.instance.inviteToCurrent(t.id ?? '', customMessage);
                 
                 if (!invRes.success && invRes.error === 'RATE_LIMIT') {
                    addLog(`[WARN] RATE LIMIT DETECTED! Cooling down for 10s...`, 'warn');
                    await new Promise(r => setTimeout(r, 10000));
                 }

                 count++;
                 setProgress({ current: count, total: targets.length });
                 await new Promise(r => setTimeout(r, 250));
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
    
    // Render logic for the recruitment button
    const renderRecruitButton = () => {
        if (progress && progressMode === 'recruit') {
             const pct = Math.round((progress.current / progress.total) * 100);
             
             // Determine status text based on current phase
             let statusText = `${progress.current}/${progress.total} PROCESSED`;
             let statusColor = 'inherit';
             
             if (currentProcessingUser) {
                 const truncatedName = currentProcessingUser.name.length > 15 
                     ? currentProcessingUser.name.substring(0, 15) + '...' 
                     : currentProcessingUser.name;
                     
                 if (currentProcessingUser.phase === 'checking') {
                     statusText = `🔍 Checking: ${truncatedName}`;
                     statusColor = '#fde047'; // Yellow
                 } else if (currentProcessingUser.phase === 'inviting') {
                     statusText = `📨 Inviting: ${truncatedName}`;
                     statusColor = '#86efac'; // Green
                 } else if (currentProcessingUser.phase === 'skipped') {
                     statusText = `⛔ Skipped: ${truncatedName}`;
                     statusColor = '#fca5a5'; // Red
                 }
             }
             
             return (
                <NeonButton 
                    disabled
                    style={{ flex: 1, height: '60px', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        background: 'rgba(var(--primary-hue), 100%, 50%, 0.3)',
                        transition: 'width 0.2s linear'
                    }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{pct}%</span>
                        <span style={{ fontSize: '0.65rem', color: statusColor, fontWeight: 500 }}>{statusText}</span>
                    </div>
                </NeonButton>
             );
        }

        return (
            <NeonButton 
                onClick={handleRecruitAll}
                disabled={progress !== null} 
                style={{ flex: 1, height: '60px', flexDirection: 'column', gap: '4px' }}
            >
                <UserPlus size={20} />
                <span style={{ fontSize: '0.75rem' }}>INVITE INSTANCE TO GROUP</span>
            </NeonButton>
        );
    };

    const renderRallyButton = () => {
        if (!selectedGroup) {
             // Disabled / Hidden for Roaming
             return (
                 <NeonButton 
                    disabled
                    variant="secondary" 
                    style={{ flex: 1, height: '60px', flexDirection: 'column', gap: '4px', opacity: 0.5 }}
                >
                    <AppShieldIcon size={20} />
                    <span style={{ fontSize: '0.75rem' }}>GROUP OFF-LINE</span>
                </NeonButton>
             );
        }

        if (progress && progressMode === 'rally') {
             const pct = Math.round((progress.current / progress.total) * 100);
             return (
                <NeonButton 
                    disabled
                    variant="secondary"
                    style={{ flex: 1, height: '60px', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        background: 'rgba(255, 255, 255, 0.2)', 
                        transition: 'width 0.2s linear'
                    }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{pct}%</span>
                         <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{progress.current}/{progress.total} SENT</span>
                    </div>
                </NeonButton>
             );
        }

        return (
            <NeonButton 
                onClick={handleRally}
                disabled={isLoading || progress !== null}
                variant="secondary" 
                style={{ flex: 1, height: '60px', flexDirection: 'column', gap: '4px' }}
            >
                <AppShieldIcon size={20} />
                <span style={{ fontSize: '0.75rem' }}>INVITE GROUP HERE</span>
            </NeonButton>
        );
    };

    const handleLockdown = async () => {
        if (!confirm("⚠️ DANGER ZONE ⚠️\n\nAre you sure you want to CLOSE this instance?\n\nThis will kick ALL players (including you) and lock the instance. This cannot be undone.")) return;
        
        addLog(`[CMD] INITIATING INSTANCE LOCKDOWN...`, 'warn');
        try {
            const res = await window.electron.instance.closeInstance();
            if (res.success) {
                addLog(`[CMD] Instance Closed Successfully.`, 'success');
            } else {
                 addLog(`[CMD] Failed to close instance: ${res.error}`, 'error');
            }
        } catch {
             addLog(`[CMD] Lockdown failed. API Error.`, 'error');
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', gap: '1rem', overflow: 'hidden', paddingBottom: 'var(--dock-height)' }}>
            
            {/* COLUMN SET 1: MONITOR (Active & History) */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '500px' }}>
                
                {/* 1. INSTANCE INFO HEADER */}
                <GlassPanel style={{ flex: '0 0 auto', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', position: 'relative' }}>
                    {/* Background Image Effect */}
                    {instanceInfo?.imageUrl && (
                        <div style={{ 
                            position: 'absolute', inset: 0, 
                            backgroundImage: `url(${instanceInfo.imageUrl})`, 
                            backgroundSize: 'cover', backgroundPosition: 'center', 
                            opacity: 0.2, filter: 'blur(2px)', zIndex: 0 
                        }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', position: 'relative', zIndex: 1 }}>
                        <div style={{ position: 'relative' }}>
                            {instanceInfo?.imageUrl ? (
                                <img src={instanceInfo.imageUrl} style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--color-primary)', objectFit: 'cover' }} />
                            ) : (
                                <Radio className="text-primary" size={24} />
                            )}
                             {scanActive && (
                                <motion.div 
                                    style={{ position: 'absolute', inset: -4, border: '2px solid var(--color-primary)', borderRadius: instanceInfo?.imageUrl ? '12px' : '50%' }}
                                    animate={{ opacity: [0, 1, 0], scale: [1, 1.2, 1.4] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                             )}
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                                {instanceInfo?.name || 'CURRENT INSTANCE'}
                            </h2>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', letterSpacing: '0.05em' }}>
                                LIVE SECTOR SCAN
                            </div>
                        </div>
                    </div>
                </GlassPanel>

                {/* 2. COMBINED ENTITY LIST WITH TABS */}
                <div style={{ flex: 0.5, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'hidden', maxWidth: '350px' }}>
                    
                    {/* Tab Header */}
                    <GlassPanel style={{ flex: '0 0 auto', padding: '0', display: 'flex', overflow: 'hidden' }}>
                        <button
                            onClick={() => setEntityTab('active')}
                            style={{
                                flex: 1,
                                padding: '0.8rem 1rem',
                                background: entityTab === 'active' ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                                border: 'none',
                                borderBottom: entityTab === 'active' ? '2px solid var(--color-success)' : '2px solid transparent',
                                color: entityTab === 'active' ? 'white' : 'var(--color-text-dim)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                transition: 'all 0.2s ease',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                letterSpacing: '0.05em'
                            }}
                        >
                            <div style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: entityTab === 'active' ? 'var(--color-success)' : 'rgba(255,255,255,0.3)',
                                boxShadow: entityTab === 'active' ? '0 0 8px var(--color-success)' : 'none'
                            }} />
                            IN INSTANCE
                            <span style={{ 
                                fontSize: '0.7rem', 
                                background: entityTab === 'active' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.1)',
                                padding: '2px 8px',
                                borderRadius: '10px'
                            }}>
                                {entities.filter(e => e.status === 'active' || e.status === 'joining').length}
                            </span>
                        </button>
                        
                        <button
                            onClick={() => setEntityTab('left')}
                            style={{
                                flex: 1,
                                padding: '0.8rem 1rem',
                                background: entityTab === 'left' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                                border: 'none',
                                borderBottom: entityTab === 'left' ? '2px solid var(--color-text-dim)' : '2px solid transparent',
                                color: entityTab === 'left' ? 'white' : 'var(--color-text-dim)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                transition: 'all 0.2s ease',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                letterSpacing: '0.05em'
                            }}
                        >
                            <div style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: 'rgba(255,255,255,0.3)'
                            }} />
                            RECENTLY LEFT
                            <span style={{ 
                                fontSize: '0.7rem', 
                                background: 'rgba(255,255,255,0.1)',
                                padding: '2px 8px',
                                borderRadius: '10px'
                            }}>
                                {entities.filter(e => e.status === 'left' || e.status === 'kicked').length}
                            </span>
                        </button>
                    </GlassPanel>

                    {/* Entity List Content */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                        <AnimatePresence mode="wait">
                            {entityTab === 'active' ? (
                                <motion.div
                                    key="active-tab"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    {entities.filter(e => e.status === 'active' || e.status === 'joining').length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-dim)' }}>
                                            No active entities.<br/>
                                            <span style={{ fontSize: '0.8rem' }}>(Instance is empty)</span>
                                        </div>
                                    ) : (
                                        entities.filter(e => e.status === 'active' || e.status === 'joining').map(entity => (
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
                                                    readOnly={isRoamingMode}
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
                                    {entities.filter(e => e.status === 'left' || e.status === 'kicked').length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                            History empty
                                        </div>
                                    ) : (
                                        entities.filter(e => e.status === 'left' || e.status === 'kicked').map(entity => (
                                            <motion.div
                                                key={entity.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 0.6 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                <EntityCard 
                                                    entity={entity} 
                                                    onInvite={() => {}} 
                                                    onKick={() => {}}
                                                    onBan={handleBanClick}
                                                    readOnly={true}
                                                />
                                            </motion.div>
                                        ))
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div style={{ height: '20px' }}></div>
                    </div>
                </div>

            </div>

            {/* COLUMN 3: COMMAND UPLINK (ACTIONS & LOGS) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '280px' }}>
                
                {/* TACTICAL ACTIONS */}
                <GlassPanel style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-dim)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Crosshair size={16} />
                        {isRoamingMode ? 'ROAMING CONTROLS' : 'INSTANCE ACTIONS'}
                    </h3>

                    <div style={{ marginBottom: '1rem' }}>
                        <OscAnnouncementWidget />
                    </div>

                    {/* Live Alerts & AutoBan Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '1rem' }}>
                        {/* Alerts */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldAlert size={16} color={useAutoModAlertStore(s => s.isEnabled) ? '#f87171' : 'gray'} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>Alerts</span>
                            </div>
                            <ToggleButton 
                                enabled={useAutoModAlertStore(s => s.isEnabled)} 
                                onToggle={useAutoModAlertStore(s => s.toggleEnabled)} 
                            />
                        </div>
                        
                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }}></div>
                        
                        {/* Auto-Ban */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Gavel size={16} color={liveAutoBan ? '#ef4444' : 'gray'} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>Auto-Ban</span>
                            </div>
                            <ToggleButton 
                                enabled={liveAutoBan} 
                                onToggle={toggleLiveAutoBan} 
                            />
                        </div>
                    </div>

                    {/* Custom Invite Message Input */}
                    {!isRoamingMode && (
                        <div style={{ marginBottom: '0.5rem' }}>
                            <input 
                                type="text" 
                                placeholder="Custom Invite Message (Optional)..." 
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    padding: '8px 12px',
                                    color: 'white',
                                    fontSize: '0.85rem'
                                }}
                            />
                            {customMessage && (
                                <div style={{ fontSize: '0.7rem', color: '#fde047', marginTop: '4px', fontStyle: 'italic' }}>
                                    Warning: Overwrites Invite Slot 12
                                </div>
                            )}
                        </div>
                    )}

                    {!isRoamingMode ? (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {renderRecruitButton()}
                                {renderRallyButton()}
                            </div>
                             <NeonButton 
                                onClick={handleLockdown}
                                variant="danger" 
                                style={{ width: '100%', height: '40px', fontSize: '0.8rem', opacity: 0.8 }}
                             >
                                 <AppShieldIcon size={16} style={{ marginRight: '8px' }} />
                                 CLOSE INSTANCE
                             </NeonButton>
                        </div>
                    ) : (
                        <div style={{ 
                            padding: '1.5rem', 
                            textAlign: 'center', 
                            opacity: 0.5, 
                            fontSize: '0.8rem', 
                            border: '1px dashed rgba(255,255,255,0.2)', 
                            borderRadius: '8px',
                            background: 'rgba(0,0,0,0.1)'
                        }}>
                           Local Monitoring Active
                        </div>
                    )}
                </GlassPanel>

                {/* LIVE TERMINAL FEED */}
                <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={14} />
                        SYSTEM FEED
                    </div>
                    <div style={{ flex: 1, padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {logs.map(log => (
                            <div key={log.id} style={{ 
                                color: log.type === 'error' ? '#fca5a5' : 
                                       log.type === 'success' ? '#86efac' : 
                                       log.type === 'warn' ? '#fde047' : 'inherit' 
                            }}>
                                {log.message}
                            </div>
                        ))}
                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '12px', background: 'var(--color-primary)', display: 'block', animation: 'blink 1s infinite' }}></span>
                        </div>
                    </div>
                </GlassPanel>

            </div>
            <BanUserDialog 
                key={banDialogUser ? banDialogUser.id : 'closed'}
                isOpen={!!banDialogUser} 
                onClose={() => setBanUserDialog(null)}
                user={banDialogUser}
                initialGroupId={selectedGroup?.id}
            />
            <RecruitResultsDialog 
                isOpen={!!recruitResults}
                onClose={() => setRecruitResults(null)}
                blockedUsers={recruitResults?.blocked || []}
                totalInvited={recruitResults?.invited || 0}
            />

            <AutoModAlertOverlay />
        </div>
    );
};

const ToggleButton = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <div 
        onClick={onToggle}
        style={{
            width: '40px', height: '22px', 
            background: enabled ? 'var(--color-success)' : 'rgba(255,255,255,0.2)',
            borderRadius: '20px', position: 'relative', cursor: 'pointer',
            transition: 'background 0.2s'
        }}
    >
        <div style={{
            width: '18px', height: '18px', 
            background: 'white', borderRadius: '50%',
            position: 'absolute', top: '2px', left: enabled ? '20px' : '2px',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
    </div>
);

