import React, { useEffect, useState, useRef } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { NeonButton } from '../../../components/ui/NeonButton';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { Users, AlertTriangle, CheckCircle } from 'lucide-react';
import { AppShieldIcon } from '../../../components/ui/AppShieldIcon';
import { AnimatePresence, motion } from 'framer-motion';

interface MassInviteDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const MassInviteDialog: React.FC<MassInviteDialogProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState<'config' | 'running' | 'done'>('config');
    const [filterAutoMod, setFilterAutoMod] = useState(true);
    const [customMessage, setCustomMessage] = useState('');

    const [progress, setProgress] = useState<{ sent: number; skipped: number; failed: number; total: number; current?: string; done?: boolean }>({
        sent: 0,
        skipped: 0,
        failed: 0,
        total: 0,
        done: false
    });

    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Reset state on open
    useEffect(() => {
        if (isOpen && step === 'config') {
            setProgress({ sent: 0, skipped: 0, failed: 0, total: 0, done: false });
            setLogs([]);
        }
    }, [isOpen, step]);

    // Listen for progress
    useEffect(() => {
        const removeListener = window.electron.instance.onMassInviteProgress((data) => {
            setProgress(data);
            if (data.current) {
                setLogs(prev => [...prev, `Invited: ${data.current}`]);
            }
            if (data.done) {
                setStep('done');
            }
        });
        return () => {
            removeListener();
        };
    }, []);

    // Scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, progress]);


    const handleStart = async () => {
        setStep('running');
        setLogs(prev => [...prev, "Starting Mass Invite...", "Fetching online friends..."]);
        
        try {
            const result = await window.electron.instance.massInviteFriends({ filterAutoMod, message: customMessage });
            
            if (result.success) {
                setLogs(prev => [...prev, `Done! Sent: ${result.invited}, Skipped: ${result.skipped}, Failed: ${result.failed}`]);
            } else {
                setLogs(prev => [...prev, `Error: ${result.error}`]);
                setStep('done');
            }
        } catch (e) {
            setLogs(prev => [...prev, `Fatal Error: ${e}`]);
            setStep('done');
        }
    };

    const handleClose = () => {
        onClose();
        setTimeout(() => setStep('config'), 500);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Mass Invite Friends">
            <div style={{ padding: '1rem', minWidth: '400px', maxWidth: '500px' }}>
                
                <AnimatePresence mode="wait">
                    {step === 'config' && (
                        <motion.div
                            key="config"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            <div style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <AlertTriangle size={24} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                                    This will invite <strong>all your online friends</strong> to this instance one by one.
                                    <br/><br/>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Use responsibly to avoid spamming. Friends already in this instance will be skipped.</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Options</label>
                                
                                <div 
                                    onClick={() => setFilterAutoMod(!filterAutoMod)}
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '12px', 
                                        padding: '12px', 
                                        background: filterAutoMod ? 'rgba(var(--color-primary-rgb), 0.1)' : 'rgba(255,255,255,0.05)', 
                                        border: filterAutoMod ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ 
                                        width: '20px', height: '20px', borderRadius: '4px', 
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        background: filterAutoMod ? 'var(--color-primary)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {filterAutoMod && <CheckCircle size={14} color="black" />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
                                            <AppShieldIcon size={16} style={{ filter: filterAutoMod ? 'none' : 'grayscale(100%)', opacity: filterAutoMod ? 1 : 0.5 }} />
                                            Check AutoMod Rules
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                                            Scan friends against your active AutoMod rules before inviting.
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '0.5rem' }}>
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
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <NeonButton variant="secondary" onClick={onClose}>Cancel</NeonButton>
                                <NeonButton variant="primary" onClick={handleStart}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Users size={16} />
                                        <span>Start Wave</span>
                                    </div>
                                </NeonButton>
                            </div>
                        </motion.div>
                    )}

                    {(step === 'running' || step === 'done') && (
                        <motion.div
                            key="running"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                             {/* Progress Stats */}
                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                 <GlassPanel style={{ padding: '0.8rem', textAlign: 'center' }}>
                                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-success)' }}>{progress.sent}</div>
                                     <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>SENT</div>
                                 </GlassPanel>
                                 <GlassPanel style={{ padding: '0.8rem', textAlign: 'center' }}>
                                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-warning)' }}>{progress.skipped}</div>
                                     <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>SKIPPED</div>
                                 </GlassPanel>
                                 <GlassPanel style={{ padding: '0.8rem', textAlign: 'center' }}>
                                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>{progress.failed}</div>
                                     <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>FAILED</div>
                                 </GlassPanel>
                             </div>

                             {/* Progress Bar */}
                             <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                 <motion.div 
                                    style={{ height: '100%', background: 'var(--color-primary)' }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress.total > 0 ? ( (progress.sent + progress.skipped + progress.failed) / progress.total ) * 100 : 0}%` }}
                                 />
                             </div>
                             
                             <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-secondary)', height: '20px' }}>
                                 {step === 'running' ? (
                                     <>Processing: <strong>{progress.current || 'Initializing...'}</strong> ({progress.sent + progress.skipped + progress.failed} / {progress.total || '?'})</>
                                 ) : (
                                     <strong style={{ color: 'var(--color-success)' }}>Completed</strong>
                                 )}
                             </div>

                             {/* Log Output */}
                             <GlassPanel style={{ height: '200px', overflowY: 'auto', padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.3)' }}>
                                 {logs.map((log, i) => (
                                     <div key={i} style={{ color: 'rgba(255,255,255,0.7)' }}>{log}</div>
                                 ))}
                                 <div ref={logsEndRef} />
                             </GlassPanel>

                             {step === 'done' && (
                                 <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                                     <NeonButton onClick={handleClose}>Close</NeonButton>
                                 </div>
                             )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Modal>
    );
};
