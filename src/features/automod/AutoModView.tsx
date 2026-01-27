import React, { useState } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useAuditStore } from '../../stores/auditStore';
import { useGroupStore } from '../../stores/groupStore';
import { useScanStore } from '../../stores/scanStore';
import { motion } from 'framer-motion';
import styles from './AutoModView.module.css';
import { ShieldCheck, List, Play, Loader2 } from 'lucide-react';

// Extracted components
import { KeywordConfigModal } from './dialogs/KeywordConfigModal';
import { BlacklistedGroupsConfigModal } from './dialogs/BlacklistedGroupsConfigModal';
import { UserActionModal } from './dialogs/UserActionModal';
import { RuleCard } from './components/RuleCard';
import { InterceptionLog, type LogEntry } from './components/InterceptionLog';
import { StatTile } from '../dashboard/components/StatTile';
import type { AutoModRule } from '../../types/electron';
import { NeonButton } from '../../components/ui/NeonButton';
import { Button } from '../../components/ui/Button';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { WhitelistViewerModal } from './dialogs/WhitelistViewerModal';
import { ScanResultsDialog } from './dialogs/ScanResultsDialog';

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

export const AutoModView: React.FC = () => {
    const [status, setStatus] = useState({ autoProcess: false, autoBan: false });
    const [rules, setRules] = useState<AutoModRule[]>([]);
    
    // Dialog State
    const [showKeywordConfig, setShowKeywordConfig] = useState(false);
    const [showBlacklistedGroupsConfig, setShowBlacklistedGroupsConfig] = useState(false);
    const [showWhitelistViewer, setShowWhitelistViewer] = useState(false);
    const [interceptionLog, setInterceptionLog] = useState<LogEntry[]>([]);
    const [selectedLogEntry, setSelectedLogEntry] = useState<LogEntry | null>(null);

    // Scan State Management
    const [showScanResults, setShowScanResults] = useState(false);
    const [showScanConfirm, setShowScanConfirm] = useState(false);
    
    const { 
        startScan, 
        isLoading: scanLoading, 
        progress: scanProgress, 
        results: scanResults 
    } = useScanStore();
    
    const { fetchLogs } = useAuditStore();
    const { selectedGroup, fetchGroupBans, fetchGroupMembers } = useGroupStore();

    // Initial Data Fetch
    const loadHistory = React.useCallback(async () => {
        if (!selectedGroup) {
            setInterceptionLog([]);
            return;
        }
        try {
            const history = await window.electron.automod.getHistory(selectedGroup.id);
            setInterceptionLog(history as LogEntry[] || []);
        } catch (e) {
            console.error("Failed to load AutoMod history", e);
        }
    }, [selectedGroup]);

    const loadRules = React.useCallback(async () => {
        if (!selectedGroup) {
            setRules([]);
            return;
        }
        try {
            const fetched = await window.electron.automod.getRules(selectedGroup.id);
            setRules(fetched || []);
        } catch (e) {
            console.error("Failed to load AutoMod rules", e);
        }
    }, [selectedGroup]);

    const loadStatus = React.useCallback(async () => {
        if (!selectedGroup) {
             setStatus({ autoProcess: false, autoBan: false });
             return;
        }
        try {
            const s = await window.electron.automod.getStatus(selectedGroup.id);
            setStatus(s);
        } catch (e) {
            console.error("Failed to load AutoMod status", e);
        }
    }, [selectedGroup]);
    
    React.useEffect(() => {
        loadRules();
        loadStatus();
        loadHistory();
    }, [loadRules, loadStatus, loadHistory]);

    React.useEffect(() => {
        // Listen for AutoMod Logs (real-time)
        const handleLog = (_: unknown, log: unknown) => {
            // We need to locally filter if the log doesn't match current group, 
            // OR relying on backend to only send relevant logs (not currently implemented per connection)
            // Ideally, we check log.groupId matches selectedGroup.id
            const entry = log as LogEntry;
            if (selectedGroup && entry.groupId === selectedGroup.id) {
                 setInterceptionLog(prev => [entry, ...prev].slice(0, 50));
            }
        };
        
        const removeListener = window.electron.automod.onViolation((data) => {
             handleLog(null, data);
        });
        return () => removeListener();
    }, [selectedGroup]);

    const toggleAutoProcess = async () => {
        if (!selectedGroup) return;
        const newState = !status.autoProcess;
        await window.electron.automod.setAutoProcess(newState, selectedGroup.id);
        loadStatus();
    };

    const toggleAutoBan = async () => {
        if (!selectedGroup) return;
        const newState = !status.autoBan;
        await window.electron.automod.setAutoBan(newState, selectedGroup.id);
        loadStatus();
    };

    const toggleRule = async (type: string, config?: Record<string, unknown>) => {
        if (!selectedGroup) return;

        const existing = rules.find(r => r.type === type);
        
        let initialConfig = {};
        if (type === 'KEYWORD_BLOCK') {
            initialConfig = {
                keywords: [], 
                whitelist: [], 
                matchMode: 'WHOLE_WORD',
                scanBio: true,
                scanStatus: true,
                scanPronouns: true
            };
        } else if (type === 'AGE_VERIFICATION') {
            initialConfig = { autoAcceptVerified: false };
        } else if (type === 'BLACKLISTED_GROUPS') {
            initialConfig = { groupIds: [], groups: [] };
        }

        const ruleNames: Record<string, string> = {
            'AGE_VERIFICATION': 'Age Verification Firewall',
            'KEYWORD_BLOCK': 'Keyword Text Filter',
            'BLACKLISTED_GROUPS': 'Blacklisted Groups'
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

    const ageRule = rules.find(r => r.type === 'AGE_VERIFICATION');
    const isAgeEnabled = ageRule?.enabled;

    const keywordRule = rules.find(r => r.type === 'KEYWORD_BLOCK');
    const isKeywordEnabled = keywordRule?.enabled;
    const keywordConfig = keywordRule ? JSON.parse(keywordRule.config || '{}') : {};
    
    const isKeywordConfigured = (keywordConfig.keywords && keywordConfig.keywords.length > 0);

    const blacklistRule = rules.find(r => r.type === 'BLACKLISTED_GROUPS');
    const isBlacklistEnabled = blacklistRule?.enabled;
    const blacklistConfig = blacklistRule ? JSON.parse(blacklistRule.config || '{}') : { groupIds: [], groups: [] };
    const isBlacklistConfigured = (blacklistConfig.groupIds && blacklistConfig.groupIds.length > 0);

    const handleScanGroup = async () => {
        if (!selectedGroup) return;
        setShowScanResults(true);
        startScan(selectedGroup.id);
    };

    // Derived Vars
    const activeRulesCount = rules.filter(r => r.enabled).length;

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
                        ⚠️ No Group Selected. Please select a group in the sidebar to configure AutoMod.
                     </div>
                )}
                
                {/* Header Section */}
                <GlassPanel className={styles.headerPanel} style={{ flexShrink: 0 }}>
                    <div className={styles.titleSection}>
                        <h1 className={`${styles.title} text-gradient`}>
                            AutoMod
                        </h1>
                        <div className={styles.subtitle}>
                            AUTOMATED MODERATION SYSTEM
                        </div>
                    </div>

                    <div className={styles.statsGrid}>
                        <StatTile 
                            label="ACTIVE RULES"
                            value={activeRulesCount}
                            color="var(--color-primary)"
                        />
                         <StatTile 
                            label="STATUS"
                            value={status.autoProcess || status.autoBan ? "ACTIVE" : "STANDBY"}
                            color={status.autoProcess || status.autoBan ? "var(--color-success)" : "var(--color-text-dim)"}
                            headerRight={(status.autoProcess || status.autoBan) && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"></span>}
                        />
                    </div>
                </GlassPanel>

                {/* Main Content Split */}
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
                    
                    {/* Left: Interception Log (Activity Feed) */}
                    <GlassPanel style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                         <InterceptionLog 
                            logs={interceptionLog} 
                            onSelectEntry={setSelectedLogEntry} 
                        />
                    </GlassPanel>

                    {/* Right: Rules & Config */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                         {/* Safety Settings */}
                         <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Safety Settings</h3>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <RuleCard
                                    title="Auto Process Join Requests"
                                    statusLabel={status.autoProcess ? 'ON' : 'OFF'}
                                    isEnabled={status.autoProcess}
                                    onToggle={toggleAutoProcess}
                                    color="var(--color-primary)"
                                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>}
                                />

                                <RuleCard
                                    title="Auto-Ban Non-Compliant Users"
                                    statusLabel={status.autoBan ? 'ON' : 'OFF'}
                                    isEnabled={status.autoBan}
                                    onToggle={toggleAutoBan}
                                    color="var(--color-danger)"
                                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>}
                                />

                                {/* Scan Controls Integration */}
                                <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.5rem' }}>
                                    {scanLoading ? (
                                        <NeonButton 
                                            variant="primary" 
                                            size="sm"
                                            onClick={() => setShowScanResults(true)}
                                            style={{ height: '36px', padding: '0 1rem', width: '100%', justifyContent: 'center' }}
                                            glow={true}
                                            className="animate-pulse"
                                        >
                                            <Loader2 size={16} className="animate-spin" style={{ marginRight: '8px' }} />
                                            Scanning...
                                        </NeonButton>
                                    ) : (
                                        <>
                                            <NeonButton 
                                                variant="secondary" 
                                                size="sm"
                                                onClick={() => {
                                                    if (!selectedGroup) return;
                                                    setShowScanConfirm(true);
                                                }}
                                                disabled={!selectedGroup}
                                                title={!selectedGroup ? "Select a group first" : "Scan all members for violations"}
                                                style={{ height: '36px', padding: '0 1rem', flex: 1, justifyContent: 'center' }}
                                                glow={false}
                                            >
                                                <Play size={16} style={{ marginRight: '8px' }} />
                                                Scan Members
                                            </NeonButton>
                                            
                                            {(scanProgress.phase === 'complete' || scanResults.length > 0) && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowScanResults(true)}
                                                    style={{ height: '36px', width: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="View Results"
                                                >
                                                    <List size={16} />
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                         </GlassPanel>



                        <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Active Rules</h3>
                                <NeonButton 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setShowWhitelistViewer(true)}
                                    style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px', height: 'auto' }}
                                    title="Manage Whitelisted Users & Groups"
                                >
                                    <ShieldCheck size={14} />
                                    Whitelist
                                </NeonButton>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* Age Verification Rule Card */}
                                <RuleCard
                                    title="18+ Age Firewall"
                                    statusLabel={isAgeEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isAgeEnabled}
                                    onToggle={() => toggleRule('AGE_VERIFICATION')}
                                    color="var(--color-success)"
                                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>}
                                />

                                {/* Keyword Filter Rule Card */}
                                <RuleCard
                                    title="Keyword Filter"
                                    statusLabel={isKeywordEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isKeywordEnabled}
                                    onToggle={() => toggleRule('KEYWORD_BLOCK')}
                                    color="var(--color-danger)"
                                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>}
                                    actionLabel={isKeywordConfigured ? 'Configure' : 'Setup'}
                                    onAction={() => setShowKeywordConfig(true)}
                                />

                                {/* Blacklisted Groups Rule Card */}
                                <RuleCard
                                    title="Blacklisted Groups"
                                    statusLabel={isBlacklistEnabled ? 'ON' : 'OFF'}
                                    isEnabled={!!isBlacklistEnabled}
                                    onToggle={() => toggleRule('BLACKLISTED_GROUPS')}
                                    color="#f97316"
                                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="23" y1="1" x2="17" y2="7"></line><line x1="17" y1="1" x2="23" y2="7"></line></svg>}
                                    actionLabel={isBlacklistConfigured ? 'Configure' : 'Setup'}
                                    onAction={() => setShowBlacklistedGroupsConfig(true)}
                                />
                            </div>
                        </GlassPanel>
                    </div>
                </div>
            </motion.div>

            {/* Modals */}
            <KeywordConfigModal 
                isOpen={showKeywordConfig} 
                onClose={() => setShowKeywordConfig(false)}
                config={keywordConfig} 
                onSave={(newConfig: Record<string, unknown>) => toggleRule('KEYWORD_BLOCK', newConfig)}
            />

            <BlacklistedGroupsConfigModal
                isOpen={showBlacklistedGroupsConfig}
                onClose={() => setShowBlacklistedGroupsConfig(false)}
                config={blacklistConfig}
                onUpdate={(newConfig) => toggleRule('BLACKLISTED_GROUPS', newConfig as unknown as Record<string, unknown>)}
            />

            <UserActionModal
                isOpen={selectedLogEntry !== null}
                onClose={() => setSelectedLogEntry(null)}
                logEntry={selectedLogEntry}
                onActionComplete={() => {
                    loadHistory();
                    if (selectedGroup) {
                        fetchLogs(selectedGroup.id);
                        fetchGroupBans(selectedGroup.id);
                        fetchGroupMembers(selectedGroup.id, 0);
                    }
                }}
            />

            <ScanResultsDialog 
                isOpen={showScanResults}
                onClose={() => setShowScanResults(false)}
            />

            <ConfirmationModal
                isOpen={showScanConfirm}
                onClose={() => setShowScanConfirm(false)}
                onConfirm={() => {
                    setShowScanConfirm(false);
                    handleScanGroup();
                }}
                title="Scan Group Members?"
                message="This will scan all members in the selected group against your active AutoMod rules. For large groups, this process may take some time to respect VRChat API rate limits."
                confirmLabel="Start Scan"
                variant="default" // Blue/Info style
            />

            <WhitelistViewerModal
                isOpen={showWhitelistViewer}
                onClose={() => setShowWhitelistViewer(false)}
            />
        </>
    );
};
