import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Globe, ShieldOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { RuleCard } from '../automod/components/RuleCard';
import { StatTile } from '../dashboard/components/StatTile';
import { useGroupStore } from '../../stores/groupStore';
import { WorldListModal } from './WorldListModal';
import { InstanceEventModal } from './dialogs/InstanceEventModal';
import type { InstanceLogEntry } from './components/InstanceLog';
import styles from '../automod/AutoModView.module.css';

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

// Instance Guard Event Log Component
const InstanceGuardLog: React.FC<{
    logs: InstanceLogEntry[];
    onRefresh?: () => void;
    onSelectEntry?: (entry: InstanceLogEntry) => void;
}> = ({ logs, onRefresh, onSelectEntry }) => {
    const getActionIcon = (action: string, wasAgeGated?: boolean) => {
        switch (action) {
            case 'OPENED':
                return wasAgeGated ? '🔓' : '🌍';
            case 'CLOSED':
                return '🔒';
            case 'AUTO_CLOSED':
            case 'INSTANCE_CLOSED':
                return '🚫';
            default:
                return '📋';
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'OPENED':
                return 'var(--color-success)';
            case 'CLOSED':
                return 'var(--color-primary)';
            case 'AUTO_CLOSED':
            case 'INSTANCE_CLOSED':
                return 'var(--color-danger)';
            default:
                return 'var(--color-text-dim)';
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'OPENED':
                return 'OPENED';
            case 'CLOSED':
                return 'CLOSED';
            case 'AUTO_CLOSED':
            case 'INSTANCE_CLOSED':
                return 'AUTO-CLOSED';
            default:
                return action;
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Instance Activity Log</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                        {logs.length} events
                    </span>
                    {onRefresh && (
                        <NeonButton
                            variant="ghost"
                            size="sm"
                            onClick={onRefresh}
                            style={{ padding: '4px 8px', height: 'auto' }}
                        >
                            <RefreshCw size={14} />
                        </NeonButton>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {logs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <AnimatePresence initial={false}>
                            {logs.map((log, index) => (
                                <motion.div
                                    key={log.id || `${log.timestamp}-${index}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    onClick={() => onSelectEntry?.(log)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '1rem',
                                        padding: '0.75rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        cursor: onSelectEntry ? 'pointer' : 'default',
                                        transition: 'all 0.15s ease',
                                    }}
                                    whileHover={onSelectEntry ? {
                                        background: 'rgba(255,255,255,0.06)',
                                        borderColor: 'rgba(255,255,255,0.1)'
                                    } : undefined}
                                >
                                    <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                                        {getActionIcon(log.action, log.wasAgeGated)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{
                                                fontWeight: 600,
                                                color: 'white',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '200px'
                                            }}>
                                                {log.worldName || 'Unknown World'}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 'bold',
                                                color: getActionColor(log.action),
                                                background: `${getActionColor(log.action)}20`,
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {getActionLabel(log.action)}
                                            </span>
                                            {log.wasAgeGated && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    color: '#4ade80',
                                                    background: 'rgba(74, 222, 128, 0.2)',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    18+
                                                </span>
                                            )}
                                            {log.userCount !== undefined && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: 'var(--color-text-dim)'
                                                }}>
                                                    {log.userCount} users
                                                </span>
                                            )}
                                        </div>
                                        {log.ownerName && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-dim)',
                                                marginTop: '0.25rem'
                                            }}>
                                                Started by <span style={{ color: 'var(--color-primary)' }}>{log.ownerName}</span>
                                            </div>
                                        )}
                                        {log.reason && (
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--color-text-dim)',
                                                marginTop: '0.25rem'
                                            }}>
                                                {log.reason}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-dim)',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <span style={{ fontSize: '2.5rem' }}>🛡️</span>
                        <span style={{ fontSize: '1rem' }}>No instance events recorded</span>
                        <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Events will appear here when instances are opened or closed</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export const InstanceGuardView: React.FC = () => {
    const { selectedGroup } = useGroupStore();

    // Modal State
    const [showWhitelistModal, setShowWhitelistModal] = useState(false);
    const [showBlacklistModal, setShowBlacklistModal] = useState(false);
    const [selectedLogEntry, setSelectedLogEntry] = useState<InstanceLogEntry | null>(null);

    // Rules State
    const [rules, setRules] = useState<Array<{
        id: number;
        type: string;
        name: string;
        enabled: boolean;
        actionType: string;
        config: string;
    }>>([]);

    // Instance Guard History
    const [instanceHistory, setInstanceHistory] = useState<InstanceLogEntry[]>([]);

    // Load Rules
    const loadRules = useCallback(async () => {
        if (!selectedGroup) {
            setRules([]);
            return;
        }
        try {
            const fetched = await window.electron.automod.getRules(selectedGroup.id);
            setRules(fetched || []);
        } catch (e) {
            console.error("Failed to load Instance Guard rules", e);
        }
    }, [selectedGroup]);

    // Load Instance History
    const loadHistory = useCallback(async () => {
        if (!selectedGroup) {
            setInstanceHistory([]);
            return;
        }
        try {
            const history = await window.electron.instanceGuard?.getHistory?.(selectedGroup.id);
            setInstanceHistory(history || []);
        } catch (e) {
            console.error("Failed to load Instance Guard history", e);
        }
    }, [selectedGroup]);

    // Save Rule
    const saveRule = async (rule: typeof rules[0], groupId: string) => {
        try {
            await window.electron.automod.saveRule(rule, groupId);
            await loadRules();
        } catch (e) {
            console.error("Failed to save rule", e);
        }
    };

    // Toggle Rule
    const toggleRule = async (ruleType: string) => {
        if (!selectedGroup) return;

        const existingRule = rules.find(r => r.type === ruleType);

        const ruleNames: Record<string, string> = {
            'INSTANCE_18_GUARD': '18+ Instance Guard',
            'CLOSE_ALL_INSTANCES': 'Close All Instances'
        };

        const newRule = {
            id: existingRule?.id || 0,
            name: ruleNames[ruleType] || 'Unknown Rule',
            type: ruleType,
            enabled: !existingRule?.enabled,
            actionType: 'REJECT' as const,
            config: existingRule?.config || JSON.stringify({ whitelistedWorlds: [], blacklistedWorlds: [] })
        };

        await saveRule(newRule, selectedGroup.id);
    };

    // Save World List
    const saveWorldList = async (listType: 'whitelistedWorlds' | 'blacklistedWorlds', worldIds: string[]) => {
        if (!selectedGroup) return;

        // Update both rule types with the same list
        for (const ruleType of ['INSTANCE_18_GUARD', 'CLOSE_ALL_INSTANCES']) {
            const existingRule = rules.find(r => r.type === ruleType);
            const config = existingRule ? JSON.parse(existingRule.config || '{}') : { whitelistedWorlds: [], blacklistedWorlds: [] };
            config[listType] = worldIds;

            await saveRule({
                id: existingRule?.id || 0,
                name: ruleType === 'INSTANCE_18_GUARD' ? '18+ Instance Guard' : 'Close All Instances',
                type: ruleType,
                enabled: existingRule?.enabled || false,
                actionType: 'REJECT',
                config: JSON.stringify(config)
            }, selectedGroup.id);
        }
    };

    // Initial Load
    useEffect(() => {
        loadRules();
        loadHistory();
    }, [loadRules, loadHistory]);

    // Listen for real-time Instance Guard events
    useEffect(() => {
        const handleEvent = (event: InstanceLogEntry) => {
            if (selectedGroup && event.groupId === selectedGroup.id) {
                setInstanceHistory(prev => [event, ...prev].slice(0, 100));
            }
        };

        const removeListener = window.electron.instanceGuard?.onEvent?.(handleEvent);
        return () => removeListener?.();
    }, [selectedGroup]);

    // Derived State
    const instanceGuardRule = rules.find(r => r.type === 'INSTANCE_18_GUARD');
    const closeAllRule = rules.find(r => r.type === 'CLOSE_ALL_INSTANCES');

    const isInstanceGuardEnabled = instanceGuardRule?.enabled;
    const isCloseAllEnabled = closeAllRule?.enabled;

    const instanceGuardConfig = instanceGuardRule ? JSON.parse(instanceGuardRule.config || '{}') : { whitelistedWorlds: [], blacklistedWorlds: [] };
    const closeAllConfig = closeAllRule ? JSON.parse(closeAllRule.config || '{}') : { whitelistedWorlds: [], blacklistedWorlds: [] };

    const whitelistedWorlds = instanceGuardConfig.whitelistedWorlds || closeAllConfig.whitelistedWorlds || [];
    const blacklistedWorlds = instanceGuardConfig.blacklistedWorlds || closeAllConfig.blacklistedWorlds || [];

    const activeRulesCount = [isInstanceGuardEnabled, isCloseAllEnabled].filter(Boolean).length;
    const isActive = isInstanceGuardEnabled || isCloseAllEnabled;

    // Stats
    const closedToday = instanceHistory.filter(e =>
        (e.action === 'AUTO_CLOSED' || e.action === 'INSTANCE_CLOSED') &&
        new Date(e.timestamp).toDateString() === new Date().toDateString()
    ).length;

    return (
        <>
            <motion.div
                className={styles.container}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', padding: '1rem', paddingBottom: 'var(--dock-height)' }}
            >
                {!selectedGroup && (
                    <div style={{ padding: '1rem', background: 'rgba(255,165,0, 0.2)', border: '1px solid orange', borderRadius: '8px', color: '#ffcc00' }}>
                        Please select a group in the sidebar to configure Instance Guard.
                    </div>
                )}

                {/* Header Section */}
                <GlassPanel className={styles.headerPanel} style={{ flexShrink: 0 }}>
                    <div className={styles.titleSection}>
                        <h1 className={`${styles.title} text-gradient`}>
                            Instance Guard
                        </h1>
                        <div className={styles.subtitle}>
                            INSTANCE PROTECTION SYSTEM
                        </div>
                    </div>

                    <div className={styles.statsGrid}>
                        <StatTile
                            label="ACTIVE RULES"
                            value={activeRulesCount}
                            color="var(--color-primary)"
                        />
                        <StatTile
                            label="CLOSED TODAY"
                            value={closedToday}
                            color="var(--color-danger)"
                        />
                        <StatTile
                            label="STATUS"
                            value={isActive ? "MONITORING" : "STANDBY"}
                            color={isActive ? "var(--color-success)" : "var(--color-text-dim)"}
                            headerRight={isActive && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"></span>}
                        />
                    </div>
                </GlassPanel>

                {/* Main Content Split */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* Left: Instance Activity Log */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        <InstanceGuardLog
                            logs={instanceHistory}
                            onRefresh={loadHistory}
                            onSelectEntry={setSelectedLogEntry}
                        />
                    </GlassPanel>

                    {/* Right: Rules & Config */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Instance Guard Rules */}
                        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Guard Rules</h3>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }}>
                                Auto-close group instances based on configured rules. Monitoring every 60 seconds.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* 18+ Instance Guard */}
                                <RuleCard
                                    title="18+ Instance Guard"
                                    statusLabel={isInstanceGuardEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isInstanceGuardEnabled}
                                    onToggle={() => toggleRule('INSTANCE_18_GUARD')}
                                    color="#ffc045"
                                    icon={<ShieldCheck size={20} />}
                                />

                                {/* Close All Instances */}
                                <RuleCard
                                    title="Close All Instances"
                                    statusLabel={isCloseAllEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isCloseAllEnabled}
                                    onToggle={() => toggleRule('CLOSE_ALL_INSTANCES')}
                                    color="#ef4444"
                                    icon={<span style={{ fontSize: '20px' }}>💥</span>}
                                />

                                {/* Status Indicator - always reserve space to prevent layout shift */}
                                <div style={{
                                    marginTop: '0.5rem',
                                    padding: '0.75rem',
                                    background: isActive
                                        ? (isCloseAllEnabled ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 192, 69, 0.1)')
                                        : 'transparent',
                                    border: isActive
                                        ? (isCloseAllEnabled ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 192, 69, 0.2)')
                                        : '1px solid transparent',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    color: isCloseAllEnabled ? '#ef4444' : '#ffc045',
                                    minHeight: '42px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                }}>
                                    {isActive && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className="animate-pulse">●</span>
                                            <span>
                                                {isCloseAllEnabled ? 'Close All active - closing non-whitelisted instances' : '18+ Guard active - closing non-age-gated instances'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </GlassPanel>

                        {/* World Filters */}
                        <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>World Filters</h3>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }}>
                                Configure which worlds to always allow or always block.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* Whitelist Button */}
                                <NeonButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowWhitelistModal(true)}
                                    style={{ height: '44px', justifyContent: 'center', gap: '8px' }}
                                    disabled={!selectedGroup}
                                >
                                    <Globe size={16} />
                                    <span>Whitelist Worlds</span>
                                    {whitelistedWorlds.length > 0 && (
                                        <span style={{
                                            background: 'var(--color-success)',
                                            color: '#000',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            marginLeft: '4px'
                                        }}>
                                            {whitelistedWorlds.length}
                                        </span>
                                    )}
                                </NeonButton>

                                {/* Blacklist Button */}
                                <NeonButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowBlacklistModal(true)}
                                    style={{ height: '44px', justifyContent: 'center', gap: '8px' }}
                                    disabled={!selectedGroup}
                                >
                                    <ShieldOff size={16} />
                                    <span>Blacklist Worlds</span>
                                    {blacklistedWorlds.length > 0 && (
                                        <span style={{
                                            background: 'var(--color-danger)',
                                            color: '#fff',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            marginLeft: '4px'
                                        }}>
                                            {blacklistedWorlds.length}
                                        </span>
                                    )}
                                </NeonButton>
                            </div>

                            {/* Filter Info */}
                            <div style={{
                                marginTop: '0.5rem',
                                padding: '0.75rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '6px',
                                fontSize: '0.7rem',
                                color: 'var(--color-text-dim)',
                                lineHeight: 1.5
                            }}>
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#4ade80' }}>🛡️ Whitelist:</span> Protected worlds are NEVER closed
                                </div>
                                <div>
                                    <span style={{ color: '#ef4444' }}>⚡ Blacklist:</span> Blocked worlds are ALWAYS closed
                                </div>
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            </motion.div>

            {/* Modals */}
            <WorldListModal
                isOpen={showWhitelistModal}
                onClose={() => setShowWhitelistModal(false)}
                onSave={(worldIds) => saveWorldList('whitelistedWorlds', worldIds)}
                title="Whitelisted Worlds"
                description="Whitelisted worlds will NEVER be closed, regardless of any rules. Add worlds by their World ID (e.g., wrld_xxx)."
                initialWorldIds={whitelistedWorlds}
                type="whitelist"
            />

            <WorldListModal
                isOpen={showBlacklistModal}
                onClose={() => setShowBlacklistModal(false)}
                onSave={(worldIds) => saveWorldList('blacklistedWorlds', worldIds)}
                title="Blacklisted Worlds"
                description="Blacklisted worlds will be auto-closed immediately, regardless of their 18+ status. Add worlds by their World ID (e.g., wrld_xxx)."
                initialWorldIds={blacklistedWorlds}
                type="blacklist"
            />

            <InstanceEventModal
                isOpen={selectedLogEntry !== null}
                onClose={() => setSelectedLogEntry(null)}
                entry={selectedLogEntry}
            />
        </>
    );
};

