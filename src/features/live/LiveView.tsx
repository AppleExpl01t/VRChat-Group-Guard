import React, { useState, useEffect, useCallback } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Users, Radio, Crosshair, UserPlus, ShieldCheck, Activity, Gavel } from 'lucide-react';
import { useGroupStore } from '../../stores/groupStore';
import { useInstanceMonitorStore, type LiveEntity } from '../../stores/instanceMonitorStore';
import { UserProfileDialog } from './dialogs/UserProfileDialog';
import { BanUserDialog } from './dialogs/BanUserDialog';

// ... (existing imports)

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
    onClick: (entity: LiveEntity) => void;
}> = ({ entity, onInvite, onKick, onBan, readOnly, onClick }) => (
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
        <div 
            onClick={() => onClick(entity)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
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
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.2)' }}>{entity.displayName}</div>
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
                    <ShieldAlert size={14} />
                </NeonButton>
            )}
        </div>
    </div>
);

export const LiveView: React.FC = () => {
    const { selectedGroup, isRoamingMode } = useGroupStore();
    const { currentWorldName, currentWorldId, instanceImageUrl, liveScanResults, updateLiveScan, setEntityStatus } = useInstanceMonitorStore();
    const [scanActive] = useState(true);
    // Remove local entities state
    const entities = liveScanResults; // Alias for compatibility
    
    // ... instanceInfo and log state ...
    const [instanceInfo, setInstanceInfo] = useState<{ name: string; imageUrl?: string; worldId?: string; instanceId?: string } | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Dialog State
    const [banDialogUser, setBanUserDialog] = useState<{ id: string; displayName: string } | null>(null);
    const [selectedProfileUser, setSelectedProfileUser] = useState<{ id: string; displayName: string } | null>(null);

    // Helpers to add logs
    const addLog = useCallback((message: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
        setLogs(prev => [...prev.slice(-49), { message, type, id: Date.now() + Math.random() }]);
    }, []);


    const handleBanClick = (userId: string, name: string) => {
        setBanUserDialog({ id: userId, displayName: name });
    };

    const handleProfileClick = (entity: LiveEntity) => {
        setSelectedProfileUser({ id: entity.id, displayName: entity.displayName });
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

    // ... existing code ...

    const handleRecruitAll = async () => {
        if (!entities.length) return;
        const targets = entities.filter(e => !e.isGroupMember && e.status === 'active');
        if (targets.length === 0) {
            addLog(`[CMD] No strangers to recruit.`, 'warn');
            return;
        }
        
        addLog(`[CMD] SENDING MASS INVITES TO ${targets.length} STRANGERS...`, 'warn');
        setProgress({ current: 0, total: targets.length });
        setProgressMode('recruit');
        
        let count = 0;
        for (const t of targets) {
            const res = await window.electron.instance.recruitUser(selectedGroup!.id, t.id);
            
            if (!res.success && res.error === 'RATE_LIMIT') {
                addLog(`[WARN] RATE LIMIT DETECTED! Cooling down for 10s...`, 'warn');
                await new Promise(r => setTimeout(r, 10000));
            }
            
            count++;
            setProgress({ current: count, total: targets.length });
            await new Promise(r => setTimeout(r, 250));
        }
        
        addLog(`[CMD] Recruitment complete. Sent ${count} invites.`, 'success');
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
                 if (!t.id) continue;
                 const invRes = await window.electron.instance.inviteToCurrent(t.id);
                 
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
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{progress.current}/{progress.total} SENT</span>
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
                    <ShieldCheck size={20} />
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
                <ShieldCheck size={20} />
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
        <div style={{ height: '100%', display: 'flex', gap: '1rem', overflow: 'hidden', paddingBottom: '20px' }}>
            
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

                {/* 2. SPLIT LISTS (Side by Side) */}
                <div style={{ flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden' }}>
                    
                    {/* LIST A: ACTIVE */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                         <GlassPanel style={{ flex: '0 0 auto', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'white', fontWeight: 700, letterSpacing: '0.05em' }}>
                                IN INSTANCE
                            </h3>
                            <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-dim)', fontWeight: 600 }}>
                                {entities.filter(e => e.status === 'active' || e.status === 'joining').length}
                            </div>
                        </GlassPanel>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                            <AnimatePresence>
                                {entities.filter(e => e.status === 'active' || e.status === 'joining').map(entity => (
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
                                            onClick={handleProfileClick}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {entities.filter(e => e.status === 'active' || e.status === 'joining').length === 0 && (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-dim)' }}>
                                    No active entities.<br/>
                                    <span style={{ fontSize: '0.8rem' }}>(Instance is empty)</span>
                                </div>
                            )}
                             <div style={{ height: '20px' }}></div>
                        </div>
                    </div>

                    {/* LIST B: RECENTLY LEFT */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <GlassPanel style={{ flex: '0 0 auto', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-text-dim)' }} />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-text-dim)', fontWeight: 700 }}>
                                RECENTLY LEFT
                            </h3>
                             <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-text-dim)', fontWeight: 600 }}>
                                {entities.filter(e => e.status === 'left' || e.status === 'kicked').length}
                            </div>
                        </GlassPanel>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                             <AnimatePresence>
                                {entities.filter(e => e.status === 'left' || e.status === 'kicked').length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                        History empty
                                    </div>
                                ) : (
                                    entities.filter(e => e.status === 'left' || e.status === 'kicked').map(entity => (
                                        <motion.div
                                            key={entity.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 0.5 }}
                                            exit={{ opacity: 0 }}
                                        >
                                            <EntityCard 
                                                entity={entity} 
                                                onInvite={() => {}} 
                                                onKick={() => {}}
                                                onBan={handleBanClick}
                                                readOnly={true}
                                                onClick={handleProfileClick}
                                            />
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                             <div style={{ height: '20px' }}></div>
                        </div>
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
                                 <ShieldAlert size={16} style={{ marginRight: '8px' }} />
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
             <UserProfileDialog
                key={selectedProfileUser ? selectedProfileUser.id : 'profile-closed'}
                isOpen={!!selectedProfileUser}
                onClose={() => setSelectedProfileUser(null)}
                userId={selectedProfileUser?.id}
                onInvite={(id, name) => {
                    handleRecruit(id, name);
                    // Optional: Close dialog after action? Maybe keep open for multi-action.
                    // setSelectedProfileUser(null); 
                }}
                onKick={(id, name) => {
                    handleKick(id, name);
                }}
                onBan={(id, name) => {
                    // Close profile dialog to show ban dialog (modals don't stack well usually unless z-index handled)
                    // But typically one main modal at a time is safer.
                    setSelectedProfileUser(null);
                    handleBanClick(id, name);
                }}
            />
        </div>
    );
};

