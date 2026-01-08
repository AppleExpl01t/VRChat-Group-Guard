import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useAuditStore } from '../../stores/auditStore';
import { useGroupStore } from '../../stores/groupStore';
import { AnimatePresence, motion } from 'framer-motion';

// --- Types ---
type AutoModModule = 'GATEKEEPER' | 'GROUP_SCANNER';

// --- Local Components ---

const ModuleTab: React.FC<{ 
    active: boolean; 
    label: string; 
    icon: React.ReactNode; 
    onClick: () => void 
}> = ({ active, label, icon, onClick }) => (
    <button
        onClick={onClick}
        style={{
            position: 'relative',
            background: 'transparent',
            border: 'none',
            padding: '12px 24px',
            color: active ? 'white' : 'var(--color-text-dim)',
            fontWeight: 800,
            fontSize: '0.9rem',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'color 0.3s ease',
            outline: 'none',
            zIndex: 1
        }}
    >
        <span style={{ fontSize: '1.2rem', opacity: active ? 1 : 0.7 }}>{icon}</span>
        {label}
        
        {/* Active Indicator & Glow - "Sci-Fi Underline" */}
        {active && (
            <motion.div
                layoutId="activeTab"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'var(--color-primary)',
                    boxShadow: '0 -2px 10px var(--color-primary)',
                    borderRadius: '2px'
                }}
            />
        )}
        
        {/* Subtle Background Highlight on Active */}
        {active && (
            <motion.div
                layoutId="activeTabBg"
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(var(--primary-hue), 100%, 50%, 0.1) 0%, transparent 100%)',
                    borderRadius: '8px 8px 0 0',
                    zIndex: -1
                }}
            />
        )}
    </button>
);

// --- Sub-Views (Placeholders) ---


// --- Helper Components ---

const ChipInput: React.FC<{
    value: string[];
    onChange: (newValue: string[]) => void;
    placeholder?: string;
    label: string;
    color?: string;
}> = ({ value, onChange, placeholder, label, color = 'var(--color-primary)' }) => {
    const [input, setInput] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const trimmed = input.trim();
            if (trimmed && !value.includes(trimmed)) {
                onChange([...value, trimmed]);
                setInput('');
            }
        } else if (e.key === 'Backspace' && !input && value.length > 0) {
            onChange(value.slice(0, -1));
        }
    };

    const removeChip = (chipToRemove: string) => {
        onChange(value.filter(chip => chip !== chipToRemove));
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }}>
                {label}
            </div>
            <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px', 
                padding: '8px', 
                background: 'rgba(0,0,0,0.2)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '8px',
                minHeight: '42px'
            }}>
                {value.map(chip => (
                    <motion.div 
                        layout
                        key={chip}
                        style={{ 
                            background: color === 'red' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)', 
                            border: `1px solid ${color === 'red' ? '#ef4444' : '#4ade80'}`,
                            color: color === 'red' ? '#fca5a5' : '#86efac',
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        {chip}
                        <span 
                            onClick={() => removeChip(chip)} 
                            style={{ cursor: 'pointer', opacity: 0.7, fontWeight: 'bold' }}
                        >
                            ×
                        </span>
                    </motion.div>
                ))}
                <input 
                    type="text" 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={value.length === 0 ? placeholder : ''}
                    style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'white', 
                        fontSize: '0.9rem', 
                        flex: 1, 
                        minWidth: '60px',
                        outline: 'none'
                    }}
                />
            </div>
        </div>
    );
};


// --- Modals ---

const KeywordConfigModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate: (newConfig: any) => void;
}> = ({ isOpen, onClose, config, onUpdate }) => {
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.7)', // Darker backdrop
                            backdropFilter: 'blur(4px)',
                            zIndex: 9999, // High z-index
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingBottom: '50px' // Lift slightly for dock awareness
                        }}
                    >
                        {/* Modal Content */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ 
                                width: '90%', 
                                maxWidth: '1000px', 
                                maxHeight: '80vh', 
                                zIndex: 101, 
                                display: 'flex', 
                                flexDirection: 'column',
                                overflow: 'hidden', 
                                borderRadius: '12px'
                            }}
                        >
                            <GlassPanel style={{ 
                                padding: '0', 
                                border: '1px solid rgba(239, 68, 68, 0.3)', 
                                boxShadow: '0 0 30px rgba(239, 68, 68, 0.1)', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                height: '100%', 
                                maxHeight: '100%',
                                minHeight: 0
                            }}>
                                {/* Header */}
                                <div style={{ padding: '1.5rem 1.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', color: '#f87171' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                        </div>
                                        Keyword Filter Configuration
                                    </h2>
                                    <button 
                                        onClick={onClose}
                                        style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '1.5rem', display: 'flex' }}
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>

                                {/* 2-Column Grid Layout */}
                                <div style={{ 
                                    padding: '1.5rem', 
                                    overflowY: 'auto', 
                                    flex: '1 1 auto', 
                                    minHeight: 0, 
                                    display: 'grid', 
                                    gridTemplateColumns: '1.4fr 1fr', 
                                    gap: '2rem',
                                    alignItems: 'start'
                                }}>
                                    
                                    {/* Left Column: Input Lists */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        <div>
                                            <ChipInput 
                                                label="Blocked Keywords"
                                                placeholder="Add word to ban..."
                                                value={config.keywords || []}
                                                color="red"
                                                onChange={(newVal) => onUpdate({ ...config, keywords: newVal })}
                                            />
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '-8px', paddingLeft: '4px' }}>
                                                <span style={{ color: '#fca5a5' }}>Pro Tip:</span> To block an acronym (like "D.I.D") without banning the word "did", enter it with periods: <strong>d.i.d</strong>
                                            </div>
                                        </div>

                                        <ChipInput 
                                            label="Safelist (Exceptions)"
                                            placeholder="Add allowed word..."
                                            value={config.whitelist || []}
                                            color="green"
                                            onChange={(newVal) => onUpdate({ ...config, whitelist: newVal })}
                                        />
                                    </div>

                                    {/* Right Column: Configuration & Strategy */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        
                                        {/* Scanning Fields */}
                                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scanning Fields</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {[
                                                    { k: 'scanBio', l: 'Bio' }, 
                                                    { k: 'scanStatus', l: 'Status' },
                                                    { k: 'scanPronouns', l: 'Pronouns' }
                                                ].map(opt => (
                                                    <div 
                                                        key={opt.k}
                                                        onClick={() => onUpdate({ ...config, [opt.k]: !config[opt.k] })}
                                                        style={{ 
                                                            padding: '6px 12px', 
                                                            borderRadius: '6px', 
                                                            background: config[opt.k] ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.05)',
                                                            border: config[opt.k] ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.1)',
                                                            color: config[opt.k] ? 'white' : 'var(--color-text-dim)',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: config[opt.k] ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
                                                        {opt.l}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Strategy */}
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-text-dim)', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matching Strategy</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginBottom: '1rem', fontStyle: 'italic', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px', display: 'flex' }}>
                                                Example: Blocked <strong style={{ color: '#f87171', margin: '0 4px' }}>"bad"</strong> & <strong style={{ color: '#f87171', marginLeft: '4px' }}>"lol"</strong>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {/* Strict Card */}
                                                <div 
                                                    onClick={() => onUpdate({ ...config, matchMode: 'WHOLE_WORD' })}
                                                    style={{ 
                                                        padding: '1rem', 
                                                        borderRadius: '8px', 
                                                        background: config.matchMode !== 'PARTIAL' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.02)',
                                                        border: config.matchMode !== 'PARTIAL' ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.05)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        opacity: config.matchMode !== 'PARTIAL' ? 1 : 0.6,
                                                        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', alignItems: 'center'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 'bold', color: config.matchMode !== 'PARTIAL' ? '#4ade80' : 'white', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid currentColor', background: config.matchMode !== 'PARTIAL' ? 'currentColor' : 'transparent' }}></div>
                                                            Strict (Whole Word)
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                                            Smartly handles acronyms.
                                                        </div>
                                                    </div>
                                                    
                                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', fontSize: '0.7rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                            <span style={{ color: '#d4d4d4' }}>"badger"</span>
                                                            <span style={{ fontWeight: 'bold', color: '#4ade80' }}>✓ Safe</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span style={{ color: '#d4d4d4' }}>"l.o.l"</span>
                                                            <span style={{ fontWeight: 'bold', color: '#f87171' }}>✖ Block</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Loose Card */}
                                                <div 
                                                    onClick={() => onUpdate({ ...config, matchMode: 'PARTIAL' })}
                                                    style={{ 
                                                        padding: '1rem', 
                                                        borderRadius: '8px', 
                                                        background: config.matchMode === 'PARTIAL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.02)',
                                                        border: config.matchMode === 'PARTIAL' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        opacity: config.matchMode === 'PARTIAL' ? 1 : 0.6,
                                                        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', alignItems: 'center'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 'bold', color: config.matchMode === 'PARTIAL' ? '#f87171' : 'white', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid currentColor', background: config.matchMode === 'PARTIAL' ? 'currentColor' : 'transparent' }}></div>
                                                            Loose (Partial)
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                                                            Matches everywhere.
                                                        </div>
                                                    </div>

                                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', fontSize: '0.7rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                            <span style={{ color: '#d4d4d4' }}>"badger"</span>
                                                            <span style={{ fontWeight: 'bold', color: '#f87171' }}>✖ Block</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span style={{ color: '#d4d4d4' }}>"l.o.l"</span>
                                                            <span style={{ fontWeight: 'bold', color: '#f87171' }}>✖ Block</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sticky Footer */}
                                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
                                    <button 
                                        onClick={onClose}
                                        style={{ 
                                            padding: '10px 24px', 
                                            background: '#f87171', 
                                            color: 'black', 
                                            border: 'none', 
                                            borderRadius: '6px', 
                                            fontWeight: 'bold', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(248, 113, 113, 0.3)',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Done
                                    </button>
                                </div>
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};


// --- Helper: Tag Badge Component ---
const TagBadge: React.FC<{ label: string; color?: string }> = ({ label, color = 'rgba(255,255,255,0.1)' }) => (
    <span style={{
        padding: '4px 10px',
        background: color,
        borderRadius: '4px',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'white',
        textTransform: 'lowercase',
        whiteSpace: 'nowrap'
    }}>
        {label}
    </span>
);

// --- Helper: Get Trust Level Color ---
const getTrustColor = (tags: string[]): string => {
    if (tags?.some(t => t.includes('trusted'))) return '#a855f7'; // Purple
    if (tags?.some(t => t.includes('known'))) return '#f97316'; // Orange
    if (tags?.some(t => t.includes('user'))) return '#22c55e'; // Green
    if (tags?.some(t => t.includes('new_user'))) return '#3b82f6'; // Blue
    return '#6b7280'; // Gray
};

// --- Helper: Parse tags into readable labels ---
const parseUserTags = (tags: string[]): { label: string; color: string }[] => {
    if (!tags || !Array.isArray(tags)) return [];
    
    const result: { label: string; color: string }[] = [];
    
    // Trust levels
    if (tags.some(t => t === 'system_trust_veteran')) result.push({ label: 'trust veteran', color: 'rgba(168, 85, 247, 0.3)' });
    if (tags.some(t => t === 'system_trust_trusted')) result.push({ label: 'trust trusted', color: 'rgba(168, 85, 247, 0.3)' });
    if (tags.some(t => t === 'system_trust_known')) result.push({ label: 'trust known', color: 'rgba(249, 115, 22, 0.3)' });
    if (tags.some(t => t === 'system_trust_basic')) result.push({ label: 'trust basic', color: 'rgba(59, 130, 246, 0.3)' });
    
    // Special tags
    if (tags.some(t => t === 'system_early_adopter')) result.push({ label: 'early adopter', color: 'rgba(236, 72, 153, 0.3)' });
    if (tags.some(t => t === 'system_supporter')) result.push({ label: 'supporter', color: 'rgba(34, 197, 94, 0.3)' });
    if (tags.some(t => t.includes('feedback_access'))) result.push({ label: 'feedback access', color: 'rgba(99, 102, 241, 0.3)' });
    if (tags.some(t => t.includes('world_access'))) result.push({ label: 'world access', color: 'rgba(99, 102, 241, 0.3)' });
    if (tags.some(t => t.includes('avatar_access'))) result.push({ label: 'avatar access', color: 'rgba(99, 102, 241, 0.3)' });
    
    // Language
    const langTag = tags.find(t => t.startsWith('language_'));
    if (langTag) {
        const lang = langTag.replace('language_', '');
        result.push({ label: `language ${lang}`, color: 'rgba(156, 163, 175, 0.3)' });
    }
    
    return result;
};

// --- User Action Modal ---
const UserActionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logEntry: any;
    onActionComplete: () => void;
}> = ({ isOpen, onClose, logEntry, onActionComplete }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchUser = React.useCallback(async () => {
        if (!logEntry?.userId) return;
        setLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (window as any).electron.getUser(logEntry.userId);
            // API returns { success: true, user: userData }
            if (response?.success && response?.user) {
                setUser(response.user);
            } else {
                console.error('Failed to fetch user:', response?.error);
                setUser(null);
            }
        } catch (e) {
            console.error('Failed to fetch user', e);
            setUser(null);
        }
        setLoading(false);
    }, [logEntry]);

    React.useEffect(() => {
        if (isOpen && logEntry?.userId) {
            fetchUser();
        } else {
            setUser(null);
        }
    }, [isOpen, logEntry?.userId, fetchUser]);

    const { selectedGroup } = useGroupStore();

    const handleAction = async (action: string, shouldClose = true) => {
        if (!logEntry?.userId) return;
        
        // Use log's group ID if available, otherwise fallback to currently selected group
        const groupId = logEntry.groupId || selectedGroup?.id;
        
        if (!groupId || groupId === 'grp_unknown') {
            alert("Could not determine which Group to perform this action for. Please ensure you have a Group selected in the Dashboard.");
            return;
        }

        setActionLoading(action);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const electron = (window as any).electron;
            
            let result: { success: boolean; error?: string } = { success: false };
            
            switch (action) {
                case 'invite':
                    result = await electron.instance.recruitUser(groupId, logEntry.userId);
                    break;
                case 'unban':
                    result = await electron.instance.unbanUser(groupId, logEntry.userId);
                    break;
                case 'kick':
                    result = await electron.instance.kickUser(groupId, logEntry.userId);
                    break;
                case 'ban':
                    result = await electron.banUser(groupId, logEntry.userId);
                    break;
            }
            
            if (result?.success) {
                // If we aren't closing, we should ideally wait a bit or just proceed. 
                // We still want to refresh logs potentially?
                if (shouldClose) {
                    onActionComplete();
                    onClose();
                } else {
                     // For multi-step, we might want to refresh logs but keep modal open? 
                     // Or just wait for final step. 
                     // Let's at least refresh history so status updates if possible (though logs might not update that fast)
                     // onActionComplete(); // This might trigger reload which might be distracting if done twice.
                }
            } else {
                console.error(`Action ${action} failed:`, result?.error);
                // Show error to user (could add a toast/notification here)
                alert(`Action failed: ${result?.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(`Failed to perform action: ${action}`, e);
            console.log('Debug Context:', { 
                action, 
                groupId, 
                logEntryUserId: logEntry?.userId,
                logEntry,
                selectedGroup 
            });
            alert(`Action failed: ${e instanceof Error ? e.message : 'Unknown error'}\n\nCheck console for payload details.`);
        }
        setActionLoading(null);
    };

    if (!isOpen) return null;

    const actionType = logEntry?.action || 'BLOCKED';
    const userTags = user?.tags ? parseUserTags(user.tags) : [];
    const isAgeVerified = user?.ageVerified === true;
    const hasVRCPlus = user?.tags?.some((t: string) => t.includes('supporter'));
    const trustColor = user?.tags ? getTrustColor(user.tags) : '#6b7280';
    
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.85)',
                            backdropFilter: 'blur(10px)',
                            zIndex: 10000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            style={{ 
                                width: '100%', 
                                maxWidth: '520px', 
                                maxHeight: '85vh',
                                zIndex: 10001,
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <GlassPanel style={{ 
                                padding: '0', 
                                border: `1px solid ${trustColor}40`,
                                boxShadow: `0 0 40px ${trustColor}20`,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                maxHeight: '100%'
                            }}>
                                {/* Header with Name & Close */}
                                <div style={{ 
                                    padding: '1rem 1.25rem', 
                                    background: 'rgba(0,0,0,0.3)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexShrink: 0
                                }}>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                                        {loading ? 'Loading...' : (user?.displayName || logEntry?.user || 'Unknown User')}
                                    </h2>
                                    <button onClick={onClose} style={{ 
                                        background: 'rgba(255,255,255,0.1)', 
                                        border: 'none', 
                                        color: 'rgba(255,255,255,0.7)', 
                                        cursor: 'pointer', 
                                        padding: '6px',
                                        borderRadius: '6px',
                                        display: 'flex'
                                    }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>

                                {/* Scrollable Content */}
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {/* Profile Section */}
                                    <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                            {/* Avatar */}
                                            <div style={{
                                                width: '80px', 
                                                height: '80px', 
                                                borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.1)',
                                                backgroundImage: user?.currentAvatarThumbnailImageUrl ? `url(${user.currentAvatarThumbnailImageUrl})` : 'none',
                                                backgroundSize: 'cover', 
                                                backgroundPosition: 'center',
                                                border: `2px solid ${trustColor}`,
                                                flexShrink: 0
                                            }} />
                                            
                                            {/* Name & Status */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>
                                                    {user?.displayName || logEntry?.user || 'Unknown'}
                                                </h3>
                                                {user?.statusDescription && (
                                                    <div style={{ 
                                                        fontSize: '0.85rem', 
                                                        color: 'rgba(255,255,255,0.7)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {user.statusDescription}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Tags Row */}
                                        {userTags.length > 0 && (
                                            <div style={{ 
                                                display: 'flex', 
                                                flexWrap: 'wrap', 
                                                gap: '6px', 
                                                marginBottom: '1rem' 
                                            }}>
                                                {userTags.map((tag, i) => (
                                                    <TagBadge key={i} label={tag.label} color={tag.color} />
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Badges Row (18+, VRC+, etc) */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {isAgeVerified && (
                                                <span style={{
                                                    background: '#ef4444',
                                                    color: 'white',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    18+
                                                </span>
                                            )}
                                            {hasVRCPlus && (
                                                <span style={{
                                                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                                                    color: 'white',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    supporter
                                                </span>
                                            )}
                                            {user?.pronouns && (
                                                <span style={{
                                                    background: 'rgba(255,255,255,0.1)',
                                                    color: 'rgba(255,255,255,0.8)',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem'
                                                }}>
                                                    {user.pronouns}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bio Section */}
                                    {user?.bio && (
                                        <div style={{ 
                                            padding: '1rem 1.5rem', 
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            background: 'rgba(0,0,0,0.2)'
                                        }}>
                                            <div style={{ 
                                                fontSize: '0.7rem', 
                                                fontWeight: 'bold', 
                                                color: 'var(--color-text-dim)', 
                                                marginBottom: '8px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}>
                                                BIO
                                            </div>
                                            <div style={{ 
                                                fontSize: '0.9rem', 
                                                color: 'rgba(255,255,255,0.9)',
                                                lineHeight: 1.6,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word'
                                            }}>
                                                {user.bio}
                                            </div>
                                        </div>
                                    )}

                                    {/* AutoMod Action Info */}
                                    <div style={{ 
                                        padding: '1rem 1.5rem', 
                                        background: (actionType === 'BLOCKED' || actionType === 'FLAGGED') ? 'rgba(239, 68, 68, 0.1)' : actionType === 'ACCEPTED' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <span style={{ 
                                                width: '10px', 
                                                height: '10px', 
                                                borderRadius: '50%', 
                                                background: (actionType === 'BLOCKED' || actionType === 'FLAGGED') ? '#f87171' : actionType === 'ACCEPTED' ? '#4ade80' : '#fbbf24'
                                            }} />
                                            <span style={{ 
                                                fontWeight: 'bold', 
                                                color: (actionType === 'BLOCKED' || actionType === 'FLAGGED') ? '#f87171' : actionType === 'ACCEPTED' ? '#4ade80' : '#fbbf24',
                                                fontSize: '0.85rem',
                                                textTransform: 'uppercase'
                                            }}>
                                                {actionType}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>
                                            <strong>Reason:</strong> {logEntry?.reason || 'No reason recorded'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                            {logEntry?.timestamp ? new Date(logEntry.timestamp).toLocaleString() : 'Unknown time'}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons - Fixed at bottom */}
                                <div style={{ 
                                    padding: '1rem 1.5rem', 
                                    background: 'rgba(0,0,0,0.3)',
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '0.5rem',
                                    flexShrink: 0
                                }}>
                                    <div style={{ 
                                        fontSize: '0.7rem', 
                                        fontWeight: 'bold', 
                                        color: 'var(--color-text-dim)', 
                                        marginBottom: '0.25rem', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        Reversal Actions
                                    </div>

                                    {(actionType === 'BLOCKED' || actionType === 'REJECTED') && (
                                        <button onClick={() => handleAction('invite')} disabled={actionLoading !== null} style={{ 
                                            width: '100%', 
                                            padding: '12px', 
                                            background: 'rgba(74, 222, 128, 0.15)', 
                                            border: '1px solid #4ade80', 
                                            color: '#4ade80', 
                                            borderRadius: '8px', 
                                            fontWeight: 'bold', 
                                            fontSize: '0.85rem', 
                                            cursor: actionLoading ? 'wait' : 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            gap: '8px', 
                                            opacity: actionLoading && actionLoading !== 'invite' ? 0.5 : 1,
                                            transition: 'all 0.2s'
                                        }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                                <circle cx="8.5" cy="7" r="4"></circle>
                                                <line x1="20" y1="8" x2="20" y2="14"></line>
                                                <line x1="23" y1="11" x2="17" y2="11"></line>
                                            </svg>
                                            {actionLoading === 'invite' ? 'Inviting...' : 'Invite to Group'}
                                        </button>
                                    )}

                                    {actionType === 'BANNED' && (
                                        <>
                                            <button onClick={() => handleAction('unban')} disabled={actionLoading !== null} style={{ 
                                                width: '100%', padding: '12px', background: 'rgba(251, 191, 36, 0.15)', 
                                                border: '1px solid #fbbf24', color: '#fbbf24', borderRadius: '8px', 
                                                fontWeight: 'bold', fontSize: '0.85rem', cursor: actionLoading ? 'wait' : 'pointer', 
                                                opacity: actionLoading && actionLoading !== 'unban' ? 0.5 : 1 
                                            }}>
                                                {actionLoading === 'unban' ? 'Unbanning...' : 'Unban User'}
                                            </button>
                                            <button onClick={async () => { await handleAction('unban', false); await handleAction('invite', true); }} disabled={actionLoading !== null} style={{ 
                                                width: '100%', padding: '12px', background: 'rgba(74, 222, 128, 0.15)', 
                                                border: '1px solid #4ade80', color: '#4ade80', borderRadius: '8px', 
                                                fontWeight: 'bold', fontSize: '0.85rem', cursor: actionLoading ? 'wait' : 'pointer', 
                                                opacity: actionLoading ? 0.5 : 1 
                                            }}>
                                                Unban + Invite to Group
                                            </button>
                                        </>
                                    )}

                                    {(actionType === 'ACCEPTED' || actionType === 'FLAGGED') && (
                                        <>
                                            <button onClick={() => handleAction('kick')} disabled={actionLoading !== null} style={{ 
                                                width: '100%', padding: '12px', background: 'rgba(251, 191, 36, 0.15)', 
                                                border: '1px solid #fbbf24', color: '#fbbf24', borderRadius: '8px', 
                                                fontWeight: 'bold', fontSize: '0.85rem', cursor: actionLoading ? 'wait' : 'pointer', 
                                                opacity: actionLoading && actionLoading !== 'kick' ? 0.5 : 1 
                                            }}>
                                                {actionLoading === 'kick' ? 'Kicking...' : 'Kick from Group'}
                                            </button>
                                            <button onClick={() => handleAction('ban')} disabled={actionLoading !== null} style={{ 
                                                width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.15)', 
                                                border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', 
                                                fontWeight: 'bold', fontSize: '0.85rem', cursor: actionLoading ? 'wait' : 'pointer', 
                                                opacity: actionLoading && actionLoading !== 'ban' ? 0.5 : 1 
                                            }}>
                                                {actionLoading === 'ban' ? 'Banning...' : 'Ban from Group'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};


const GatekeeperView = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rules, setRules] = useState<any[]>([]);
    const [showKeywordConfig, setShowKeywordConfig] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [interceptionLog, setInterceptionLog] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedLogEntry, setSelectedLogEntry] = useState<any>(null);

    const loadHistory = async () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const history = await (window as any).electron.automod.getHistory();
            setInterceptionLog(history || []);
        } catch (e) {
            console.error("Failed to load AutoMod history", e);
        }
    };

    const loadRules = async () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fetched = await (window as any).electron.automod.getRules();
            setRules(fetched || []);
        } catch (e) {
            console.error("Failed to load AutoMod rules", e);
        }
    };
    
    React.useEffect(() => {
        loadRules();
        loadHistory();
        
        // Listen for AutoMod Logs (real-time)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleLog = (_: any, log: any) => {
            setInterceptionLog(prev => [log, ...prev].slice(0, 50));
        };
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const removeListener = (window as any).electron.ipcRenderer.on('automod:log', handleLog);
        return () => removeListener();
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toggleRule = async (type: string, config?: any) => {
        const existing = rules.find(r => r.type === type);
        
        // If it's a new rule and no config passed, initialize with defaults
        let initialConfig = {};
        if (type === 'KEYWORD_BLOCK') {
            initialConfig = {
                keywords: [], 
                whitelist: [], 
                matchMode: 'WHOLE_WORD',
                scanBio: true,
                scanStatus: true,
                scanPronouns: true  // Now defaults to true
            };
        } else if (type === 'AGE_VERIFICATION') {
            initialConfig = { autoAcceptVerified: false };
        }

        const newRule = {
            id: existing?.id,
            name: type === 'AGE_VERIFICATION' ? 'Age Verification Firewall' : (type === 'KEYWORD_BLOCK' ? 'Keyword Text Filter' : 'Unknown Rule'),
            type: type,
            // Logic: If config is provided, we are UPDATING parameters, so keep enabled state.
            // If config is NOT provided, we are TOGGLING the enabled state.
            enabled: config ? (existing ? existing.enabled : true) : (!existing?.enabled),
            actionType: 'REJECT',
            // Merge: New Config > Existing Config > Defaults
            config: JSON.stringify(config || (existing ? JSON.parse(existing.config || '{}') : initialConfig))
        };
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window as any).electron.automod.saveRule(newRule);
        loadRules();
    };

    const ageRule = rules.find(r => r.type === 'AGE_VERIFICATION');
    const isAgeEnabled = ageRule?.enabled;

    const keywordRule = rules.find(r => r.type === 'KEYWORD_BLOCK');
    const isKeywordEnabled = keywordRule?.enabled;
    const keywordConfig = keywordRule ? JSON.parse(keywordRule.config || '{}') : {};
    
    // Determine button state
    const isKeywordConfigured = (keywordConfig.keywords && keywordConfig.keywords.length > 0);

    const { fetchLogs } = useAuditStore();
    const { selectedGroup, fetchGroupBans, fetchGroupMembers } = useGroupStore();

    return (
        <>
            <KeywordConfigModal 
                isOpen={showKeywordConfig} 
                onClose={() => setShowKeywordConfig(false)}
                config={keywordConfig} 
                onUpdate={(newConfig) => toggleRule('KEYWORD_BLOCK', newConfig)}
            />

            <UserActionModal
                isOpen={selectedLogEntry !== null}
                onClose={() => setSelectedLogEntry(null)}
                logEntry={selectedLogEntry}
                onActionComplete={() => {
                    loadHistory();
                    if (selectedGroup) {
                        fetchLogs(selectedGroup.id);
                        // Refresh bans in case of unban/ban action
                        fetchGroupBans(selectedGroup.id);
                        // Refresh members in case of kick/invite acceptance (though invite doesn't add member immediately)
                        fetchGroupMembers(selectedGroup.id, 0);
                    }
                }}
            />
            
            <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: 0 }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', height: '100%', minHeight: 0 }}>
                    {/* Rules Area */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '8px' }}>
                        <GlassPanel style={{ padding: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
                            <h3 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ width: '8px', height: '8px', background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 10px #4ade80' }}></span>
                                Request Firewall
                            </h3>
                            <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                                Active sorting protocols for incoming group join requests. 
                                Requests are pre-scanned before you even see them.
                            </p>
                        </GlassPanel>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                            
                            {/* Age Verification Rule Card */}
                            <motion.div 
                                className="glass-panel"
                                style={{ 
                                    padding: '1.5rem',
                                    height: 'auto', 
                                    minHeight: '180px',
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    alignItems: 'center', 
                                    justifyContent: 'flex-start', // Top align for expansion
                                    border: isAgeEnabled ? '1px solid #4ade80' : '1px dashed rgba(255,255,255,0.1)',
                                    background: isAgeEnabled ? 'rgba(74, 222, 128, 0.05)' : 'transparent',
                                    transition: 'border 0.2s ease, box-shadow 0.2s ease', 
                                    boxShadow: isAgeEnabled ? '0 0 15px rgba(74, 222, 128, 0.1)' : 'none',
                                    position: 'relative'
                                }}
                            >
                                {/* Main Toggle (Whole area click for main toggle, except sub-controls) */}
                                <div 
                                    style={{ cursor: 'pointer', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px' }}
                                    onClick={() => toggleRule('AGE_VERIFICATION')}
                                >
                                    <div style={{ 
                                        width: '40px', 
                                        height: '40px', 
                                        borderRadius: '50%', 
                                        background: isAgeEnabled ? '#4ade80' : 'rgba(255,255,255,0.1)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        marginBottom: '1rem',
                                        color: isAgeEnabled ? 'black' : 'white',
                                        transition: 'background 0.3s'
                                    }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: isAgeEnabled ? '#4ade80' : 'var(--color-text-dim)', transition: 'color 0.3s' }}>
                                        18+ Age Verified Only
                                    </div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: isAgeEnabled ? '#4ade80' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {isAgeEnabled ? 'ACTIVE REJECTION' : 'DISABLED'}
                                    </div>
                                </div>

                                {/* Sub-Toggle: Auto Accept */}
                                {isAgeEnabled && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        style={{ marginTop: '1.5rem', width: '100%', paddingTop: '1rem', borderTop: '1px solid rgba(74, 222, 128, 0.2)' }}
                                    >
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const currentConfig = JSON.parse(ageRule?.config || '{}');
                                                toggleRule('AGE_VERIFICATION', { ...currentConfig, autoAcceptVerified: !currentConfig.autoAcceptVerified });
                                            }}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                fontSize: '0.8rem', 
                                                color: 'rgba(255,255,255,0.8)',
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                background: 'rgba(0,0,0,0.2)'
                                            }}
                                        >
                                            <span>Auto-Accept Verified</span>
                                            <div style={{
                                                width: '32px',
                                                height: '18px',
                                                background: JSON.parse(ageRule?.config || '{}').autoAcceptVerified ? '#4ade80' : 'rgba(255,255,255,0.2)',
                                                borderRadius: '10px',
                                                position: 'relative',
                                                transition: 'background 0.2s'
                                            }}>
                                                <div style={{
                                                    width: '14px',
                                                    height: '14px',
                                                    background: 'white',
                                                    borderRadius: '50%',
                                                    position: 'absolute',
                                                    top: '2px',
                                                    left: JSON.parse(ageRule?.config || '{}').autoAcceptVerified ? '16px' : '2px',
                                                    transition: 'left 0.2s'
                                                }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* Keyword Filter Rule Card */}
                            <motion.div 
                                className="glass-panel"
                                style={{ 
                                    padding: '1.5rem',
                                    height: 'auto', 
                                    minHeight: '180px',
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    alignItems: 'center', 
                                    justifyContent: 'flex-start',
                                    border: isKeywordEnabled ? '1px solid #f87171' : '1px dashed rgba(255,255,255,0.1)',
                                    background: isKeywordEnabled ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                                    transition: 'border 0.2s ease, box-shadow 0.2s ease', 
                                    boxShadow: isKeywordEnabled ? '0 0 15px rgba(239, 68, 68, 0.1)' : 'none',
                                    position: 'relative'
                                }}
                            >
                                {/* Main Toggle */}
                                <div 
                                    style={{ cursor: 'pointer', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px' }}
                                    onClick={() => toggleRule('KEYWORD_BLOCK')}
                                >
                                    <div style={{ 
                                        width: '40px', 
                                        height: '40px', 
                                        borderRadius: '50%', 
                                        background: isKeywordEnabled ? '#f87171' : 'rgba(255,255,255,0.1)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        marginBottom: '1rem',
                                        color: isKeywordEnabled ? 'black' : 'white',
                                        transition: 'background 0.3s'
                                    }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: isKeywordEnabled ? '#f87171' : 'var(--color-text-dim)', transition: 'color 0.3s' }}>
                                        Keyword Text Filter
                                    </div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: isKeywordEnabled ? '#f87171' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {isKeywordEnabled ? 'ACTIVE FILTERING' : 'DISABLED'}
                                    </div>
                                </div>

                                {/* Setup / Edit Config Button */}
                                {isKeywordEnabled && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        style={{ marginTop: '1.2rem', width: '100%' }}
                                    >
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowKeywordConfig(true);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px 0',
                                                background: isKeywordConfigured ? 'transparent' : '#f87171',
                                                border: isKeywordConfigured ? '1px solid rgba(248, 113, 113, 0.4)' : 'none',
                                                color: isKeywordConfigured ? '#fca5a5' : 'black',
                                                borderRadius: '6px',
                                                fontWeight: 'bold',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                letterSpacing: '0.05em',
                                                transition: 'all 0.2s',
                                                textTransform: 'uppercase'
                                            }}
                                        >
                                            {isKeywordConfigured ? 'Edit Config' : 'Setup'}
                                        </button>
                                    </motion.div>
                                )}
                            </motion.div>

                            <GlassPanel style={{ height: 'auto', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)', opacity: 0.5 }}>
                                <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>More Rules Coming Soon</span>
                            </GlassPanel>
                        </div>
                    </div>

                    {/* Stats / Feed Sidepanel */}
                <GlassPanel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold', fontSize: '0.85rem', letterSpacing: '0.05em', flexShrink: 0 }}>
                        INTERCEPTION LOG
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0', minHeight: 0 }}>
                        {interceptionLog.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <AnimatePresence initial={false}>
                                    {interceptionLog.map(log => (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, x: -20, height: 0 }}
                                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                                            onClick={() => setSelectedLogEntry(log)}
                                            style={{ 
                                                padding: '10px 1rem', 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                <span style={{ fontWeight: 'bold', color: 'white' }}>{log.user}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ 
                                                    color: log.action === 'BLOCKED' ? '#f87171' : '#4ade80', 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.7rem' 
                                                }}>
                                                    {log.action}
                                                </span>
                                                <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                                    {log.reason}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: '0.8rem', fontFamily: 'monospace', padding: '1rem' }}>
                                {isAgeEnabled || isKeywordEnabled ? (
                                    <div style={{ textAlign: 'center', opacity: 0.7 }}>
                                        <div style={{ color: '#4ade80', marginBottom: '4px' }}>● SYSTEM ARMED</div>
                                        Monitoring requests...
                                    </div>
                                ) : (
                                    '[NO ACTIVE RULES]'
                                )}
                            </div>
                        )}
                    </div>
                </GlassPanel>
            </div>
        </motion.div>
        </>
    );
};



// --- Group Scanner View ---

const GroupScannerView = () => {
    const { selectedGroup } = useGroupStore();
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState({ scanned: 0, violations: 0, total: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [results, setResults] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedViolation, setSelectedViolation] = useState<any>(null);

    const startScan = async () => {
        if (!selectedGroup) return;
        
        setIsScanning(true);
        setResults([]);
        setProgress({ scanned: 0, violations: 0, total: selectedGroup.memberCount || 0 });
        // setCurrentScanIndex(0);

        const BATCH_SIZE = 100;
        let offset = 0;
        let keepScanning = true;
        let processedCount = 0;

        try {
            while (keepScanning) {
                // Check if scanning was cancelled (though we lack a cancel button currently, could add one)
                // Fetch batch
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await (window as any).electron.getGroupMembers(selectedGroup.id, offset, BATCH_SIZE);
                
                if (!response.success || !response.members || response.members.length === 0) {
                    keepScanning = false;
                    break;
                }

                const members = response.members;
                
                // Process batch
                for (const member of members) {
                    // Fetch full profile for deep scanning (Bio, Status, Age Verified)
                    let userToCheck = member.user;
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const profileRes = await (window as any).electron.getUser(member.userId);
                        if (profileRes.success && profileRes.user) {
                            userToCheck = profileRes.user;
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch full profile for ${member.userId}`, e);
                    }

                    // Construct check input from full user profile
                    const userInput = {
                        id: userToCheck.id,
                        displayName: userToCheck.displayName,
                        tags: userToCheck.tags,
                        bio: userToCheck.bio,
                        status: userToCheck.status,
                        statusDescription: userToCheck.statusDescription,
                        pronouns: userToCheck.pronouns,
                        ageVerified: userToCheck.ageVerified, // Important for 18+ check
                        ageVerificationStatus: userToCheck.ageVerificationStatus // Strict 18+ check
                    };

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await (window as any).electron.automod.checkUser(userInput);

                    if (result.action !== 'ALLOW') {
                        setResults(prev => [...prev, {
                            member: { ...member, user: userToCheck }, // Update member with full user data for display
                            check: result,
                            // specific props for UserActionModal
                            userId: userToCheck.id, // Use reliable ID from user object
                            groupId: selectedGroup.id, // Ensure group ID is passed
                            user: userToCheck.displayName,
                            reason: result.reason,
                            action: 'FLAGGED', // Special type for existing members who failed scan
                            timestamp: new Date().toISOString()
                        }]);
                        setProgress(p => ({ ...p, violations: p.violations + 1 }));
                    }

                    processedCount++;
                    // Update UI every few items to not thrash? state updates are fast enough usually
                    setProgress(p => ({ ...p, scanned: processedCount }));
                    
                    // Small breathing room for UI and to prevent rate limit hammering
                    await new Promise(r => setTimeout(r, 50)); 
                }

                offset += members.length;
                if (members.length < BATCH_SIZE) {
                    keepScanning = false;
                }
                
                // Small delay to allow UI to breathe and not freeze
                await new Promise(r => setTimeout(r, 10));
            }
        } catch (e) {
            console.error("Scan failed:", e);
            alert("Scan failed to complete. See console for details.");
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <>
            <UserActionModal
                isOpen={selectedViolation !== null}
                onClose={() => setSelectedViolation(null)}
                logEntry={selectedViolation}
                onActionComplete={() => {
                    // Maybe remove from results?
                    setResults(prev => prev.filter(r => r.userId !== selectedViolation?.userId));
                    setSelectedViolation(null);
                }}
            />

            <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: 0 }}
            >
                 <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem', height: '100%', minHeight: 0 }}>
                    
                    {/* Control Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <GlassPanel style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderLeft: '4px solid #a855f7' }}>
                            <div style={{ 
                                width: '64px', height: '64px', marginBottom: '1.5rem', 
                                background: isScanning ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.05)', 
                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                color: isScanning ? '#d8b4fe' : 'var(--color-primary)' 
                            }}>
                                {isScanning ? (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    >
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                    </motion.div>
                                ) : (
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                )}
                            </div>
                            
                            <h2 style={{ margin: '0 0 0.5rem' }}>Group Scanner</h2>
                            <p style={{ color: 'var(--color-text-dim)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                                Retroactively scan all existing group members against your current AutoMod Keyword & Age rules.
                            </p>

                            {!isScanning ? (
                                <button 
                                    onClick={startScan}
                                    style={{ 
                                        padding: '12px 32px', 
                                        background: '#a855f7', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontWeight: 'bold', 
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)',
                                        fontSize: '1rem',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    Start Full Scan
                                </button>
                            ) : (
                                <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                                        <span>Scanning...</span>
                                        <span>{Math.round((progress.scanned / (progress.total || 1)) * 100)}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(progress.scanned / (progress.total || 1)) * 100}%` }}
                                            style={{ height: '100%', background: '#a855f7' }}
                                        />
                                    </div>
                                    <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'white', fontWeight: 'bold' }}>{progress.scanned}</span>
                                        <span style={{ color: 'var(--color-text-dim)' }}> scanned</span>
                                    </div>
                                </div>
                            )}
                        </GlassPanel>

                        {/* Summary Stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <GlassPanel style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f87171' }}>{progress.violations}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>Detected</div>
                            </GlassPanel>
                            <GlassPanel style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>{results.filter(r => r.check.action === 'ALLOW').length}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>Clean</div>
                            </GlassPanel>
                        </div>
                    </div>

                    {/* Results Area */}
                    <GlassPanel style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Scan Results</h3>
                            {results.length > 0 && (
                                <span style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(248, 113, 113, 0.2)', color: '#f87171', borderRadius: '4px' }}>
                                    {results.length} Issues Found
                                </span>
                            )}
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                            {results.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5, gap: '1rem' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                                    </div>
                                    <div style={{ color: 'var(--color-text-dim)' }}>
                                        {isScanning ? 'Scanning in progress...' : 'No issues found or scan not started.'}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    {results.map((res, i) => (
                                        <div 
                                            key={res.member.id + i}
                                            onClick={() => setSelectedViolation(res)}
                                            style={{ 
                                                padding: '12px 1.5rem', 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex', 
                                                alignItems: 'center',
                                                gap: '1rem',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            
                                            <div style={{ 
                                                width: '40px', height: '40px', borderRadius: '8px', background: '#333', 
                                                backgroundImage: `url(${res.member.user.currentAvatarThumbnailImageUrl || res.member.user.userIcon})`,
                                                backgroundSize: 'cover'
                                            }} />
                                            
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '2px' }}>
                                                    {res.member.user.displayName}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#f87171' }}>
                                                    {res.check.reason}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                <div style={{ 
                                                    fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
                                                    background: 'rgba(248, 113, 113, 0.2)', color: '#fca5a5'
                                                }}>
                                                    {res.check.ruleName || 'AUTOMOD'}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                                                    Warn: Action Req.
                                                </div>
                                            </div>
                                            
                                            <div style={{ color: 'var(--color-text-dim)' }}>
                                                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </GlassPanel>
                 </div>
            </motion.div>
        </>
    );
};

// --- Main Container ---

export const AutoModView: React.FC = () => {
    const [activeModule, setActiveModule] = useState<AutoModModule>('GATEKEEPER');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingBottom: '20px' }}>
            
            {/* Top Navigation Bar */}
            <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
                <GlassPanel style={{ padding: '4px', borderRadius: '12px', display: 'flex', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
                    <ModuleTab 
                        active={activeModule === 'GATEKEEPER'} 
                        label="GATEKEEPER" 
                        icon={<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>}
                        onClick={() => setActiveModule('GATEKEEPER')} 
                    />

                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '8px 0' }}></div>
                    <ModuleTab 
                        active={activeModule === 'GROUP_SCANNER'} 
                        label="GROUP SCANNER" 
                        icon={<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>}
                        onClick={() => setActiveModule('GROUP_SCANNER')} 
                    />
                </GlassPanel>
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                <AnimatePresence mode='wait'>
                    {activeModule === 'GATEKEEPER' && (
                        <motion.div key="gatekeeper" style={{ height: '100%' }}>
                            <GatekeeperView />
                        </motion.div>
                    )}

                    {activeModule === 'GROUP_SCANNER' && (
                        <motion.div key="scanner" style={{ height: '100%' }}>
                            <GroupScannerView />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
