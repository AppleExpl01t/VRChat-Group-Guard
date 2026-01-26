import React, { useState, useCallback, useEffect } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useGroupStore } from '../../stores/groupStore';
import { motion } from 'framer-motion';
import { Globe, ShieldOff, ShieldCheck } from 'lucide-react';

import { RuleCard } from '../automod/components/RuleCard';
import { StatTile } from '../dashboard/components/StatTile';
import { NeonButton } from '../../components/ui/NeonButton';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { InstanceLog, type InstanceLogEntry } from './components/InstanceLog';
import { InstanceEventModal } from './dialogs/InstanceEventModal';
import type { AutoModRule } from '../../types/electron';

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

export const InstanceGuardView: React.FC = () => {
    const [rules, setRules] = useState<AutoModRule[]>([]);
    const [instanceLog, setInstanceLog] = useState<InstanceLogEntry[]>([]);

    // Dialog State
    const [showWhitelistModal, setShowWhitelistModal] = useState(false);
    const [showBlacklistModal, setShowBlacklistModal] = useState(false);
    const [selectedLogEntry, setSelectedLogEntry] = useState<InstanceLogEntry | null>(null);

    const { selectedGroup } = useGroupStore();

    // Load rules
    const loadRules = useCallback(async () => {
        if (!selectedGroup) {
            setRules([]);
            return;
        }
        try {
            const fetched = await window.electron.automod.getRules(selectedGroup.id);
            setRules(fetched || []);
        } catch (e) {
            console.error("Failed to load rules", e);
        }
    }, [selectedGroup]);

    // Load instance history
    const loadHistory = useCallback(async () => {
        if (!selectedGroup) {
            setInstanceLog([]);
            return;
        }
        try {
            const history = await window.electron.instanceGuard?.getHistory(selectedGroup.id);
            setInstanceLog(history || []);
        } catch (e) {
            console.error("Failed to load instance history", e);
        }
    }, [selectedGroup]);

    useEffect(() => {
        loadRules();
        loadHistory();
    }, [loadRules, loadHistory]);

    // Listen for real-time instance events
    useEffect(() => {
        if (!selectedGroup || !window.electron.instanceGuard?.onEvent) return;

        const removeListener = window.electron.instanceGuard.onEvent((event: InstanceLogEntry) => {
            if (event.groupId === selectedGroup.id) {
                setInstanceLog(prev => [event, ...prev].slice(0, 100));
            }
        });

        return () => removeListener();
    }, [selectedGroup]);

    const toggleRule = async (type: string, config?: Record<string, unknown>) => {
        if (!selectedGroup) return;

        const existing = rules.find(r => r.type === type);

        let initialConfig = {};
        if (type === 'INSTANCE_18_GUARD') {
            initialConfig = {
                whitelistedWorlds: [],
                blacklistedWorlds: [],
                checkIntervalSeconds: 60,
                notifyOnClose: true
            };
        }

        const ruleNames: Record<string, string> = {
            'INSTANCE_18_GUARD': '18+ Instance Guard'
        };

        const newRule = {
            id: existing?.id || 0,
            name: ruleNames[type] || 'Unknown Rule',
            type: type as AutoModRule['type'],
            enabled: config ? (existing ? existing.enabled : true) : (!existing?.enabled),
            actionType: 'REJECT' as const,
            config: JSON.stringify(config || (existing ? JSON.parse(existing.config || '{}') : initialConfig))
        };

        await window.electron.automod.saveRule(newRule, selectedGroup.id);
        loadRules();
    };

    // Instance Guard Rule
    const instanceGuardRule = rules.find(r => r.type === 'INSTANCE_18_GUARD');
    const isInstanceGuardEnabled = instanceGuardRule?.enabled;
    const instanceGuardConfig = instanceGuardRule ? JSON.parse(instanceGuardRule.config || '{}') : { whitelistedWorlds: [], blacklistedWorlds: [] };
    const hasWhitelistedWorlds = (instanceGuardConfig.whitelistedWorlds && instanceGuardConfig.whitelistedWorlds.length > 0);
    const hasBlacklistedWorlds = (instanceGuardConfig.blacklistedWorlds && instanceGuardConfig.blacklistedWorlds.length > 0);

    // Stats
    const closedToday = instanceLog.filter(e =>
        e.action === 'AUTO_CLOSED' &&
        new Date(e.timestamp).toDateString() === new Date().toDateString()
    ).length;

    return (
        <>
            <motion.div
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
                <GlassPanel style={{ flexShrink: 0, padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ minWidth: '150px' }}>
                            <h1 style={{
                                margin: 0,
                                fontSize: '1.5rem',
                                fontWeight: 800,
                                lineHeight: 1.2
                            }}>
                                Instance Guard
                            </h1>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginTop: '2px', letterSpacing: '0.05em' }}>
                                18+ AGE-GATE ENFORCEMENT
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <StatTile
                                label="CLOSED"
                                value={closedToday}
                                color="#ffc045"
                            />
                            <StatTile
                                label="EVENTS"
                                value={instanceLog.length}
                                color="var(--color-primary)"
                            />
                            <StatTile
                                label="STATUS"
                                value={isInstanceGuardEnabled ? "ACTIVE" : "OFF"}
                                color={isInstanceGuardEnabled ? "var(--color-success)" : "var(--color-text-dim)"}
                            />
                        </div>
                    </div>
                </GlassPanel>

                {/* Main Content Split */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                    {/* Left: Instance Log */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        <InstanceLog
                            logs={instanceLog}
                            onRefresh={loadHistory}
                            onSelectEntry={setSelectedLogEntry}
                        />
                    </GlassPanel>

                    {/* Right: Settings */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Guard Settings */}
                        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Guard Settings</h3>
                                {isInstanceGuardEnabled && (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        background: 'rgba(255, 180, 50, 0.2)',
                                        color: '#ffc045',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontWeight: 600
                                    }}>
                                        ACTIVE
                                    </span>
                                )}
                            </div>

                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }}>
                                Auto-close group instances that are not marked as 18+ age-gated.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* Main Instance Guard Toggle */}
                                <RuleCard
                                    title="18+ Instance Guard"
                                    statusLabel={isInstanceGuardEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isInstanceGuardEnabled}
                                    onToggle={() => toggleRule('INSTANCE_18_GUARD')}
                                    color="#ffc045"
                                    icon={<ShieldCheck size={20} />}
                                />

                                {/* Status Info */}
                                {isInstanceGuardEnabled && (
                                    <div style={{
                                        marginTop: '0.5rem',
                                        padding: '0.75rem',
                                        background: 'rgba(255, 180, 50, 0.1)',
                                        border: '1px solid rgba(255, 180, 50, 0.2)',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        color: '#ffc045'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className="animate-pulse">●</span>
                                            <span>Monitoring group instances every 60 seconds...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </GlassPanel>

                        {/* World Filters */}
                        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>World Filters</h3>

                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }}>
                                Configure which worlds to always allow or always block.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <NeonButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowWhitelistModal(true)}
                                    style={{ height: '40px', justifyContent: 'center', gap: '8px' }}
                                    disabled={!selectedGroup}
                                >
                                    <Globe size={16} />
                                    <span>Whitelist Worlds</span>
                                    {hasWhitelistedWorlds && (
                                        <span style={{
                                            background: 'var(--color-success)',
                                            color: '#000',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>
                                            {instanceGuardConfig.whitelistedWorlds.length}
                                        </span>
                                    )}
                                </NeonButton>

                                <NeonButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowBlacklistModal(true)}
                                    style={{ height: '40px', justifyContent: 'center', gap: '8px' }}
                                    disabled={!selectedGroup}
                                >
                                    <ShieldOff size={16} />
                                    <span>Blacklist Worlds</span>
                                    {hasBlacklistedWorlds && (
                                        <span style={{
                                            background: 'var(--color-danger)',
                                            color: '#fff',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>
                                            {instanceGuardConfig.blacklistedWorlds.length}
                                        </span>
                                    )}
                                </NeonButton>
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            </motion.div>

            {/* Whitelist Modal */}
            <ConfirmationModal
                isOpen={showWhitelistModal}
                onClose={() => setShowWhitelistModal(false)}
                onConfirm={() => setShowWhitelistModal(false)}
                title="Whitelisted Worlds"
                message="Whitelisted worlds will be allowed to stay open even if they are NOT 18+ age-gated. Add worlds by their World ID (e.g., wrld_xxx). This feature is coming soon."
                confirmLabel="Close"
                variant="default"
            />

            {/* Blacklist Modal */}
            <ConfirmationModal
                isOpen={showBlacklistModal}
                onClose={() => setShowBlacklistModal(false)}
                onConfirm={() => setShowBlacklistModal(false)}
                title="Blacklisted Worlds"
                message="Blacklisted worlds will be auto-closed regardless of their 18+ status. Add worlds by their World ID (e.g., wrld_xxx). This feature is coming soon."
                confirmLabel="Close"
                variant="default"
            />

            {/* Instance Event Detail Modal */}
            <InstanceEventModal
                isOpen={selectedLogEntry !== null}
                onClose={() => setSelectedLogEntry(null)}
                entry={selectedLogEntry}
            />
        </>
    );
};
