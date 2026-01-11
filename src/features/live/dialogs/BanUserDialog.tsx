import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { NeonButton } from '../../../components/ui/NeonButton';
import { useGroupStore } from '../../../stores/groupStore';
import { Check, X, Gavel } from 'lucide-react';
import { AppShieldIcon } from '../../../components/ui/AppShieldIcon';
import { motion } from 'framer-motion';

interface BanUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; displayName: string } | null;
  initialGroupId?: string;
}

export const BanUserDialog: React.FC<BanUserDialogProps> = ({ isOpen, onClose, user, initialGroupId }) => {
  const { myGroups } = useGroupStore();
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (initialGroupId) {
        initial.add(initialGroupId);
    }
    return initial;
  });
  const [isBanning, setIsBanning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; failed: number } | null>(null);
  const [results, setResults] = useState<Array<{ groupId: string; groupName: string; success: boolean; error?: string }>>([]);

  const toggleGroup = (groupId: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) {
        next.delete(groupId);
    } else {
        next.add(groupId);
    }
    setSelectedGroupIds(next);
  };

  const handleSelectAll = () => {
      if (selectedGroupIds.size === myGroups.length) {
          setSelectedGroupIds(new Set());
      } else {
          setSelectedGroupIds(new Set(myGroups.map(g => g.id)));
      }
  };

  const handleBan = async () => {
      if (!user) return;
      if (selectedGroupIds.size === 0) return;
      if (!confirm(`Are you sure you want to BAN ${user.displayName} from ${selectedGroupIds.size} groups? This cannot be easily undone.`)) return;
      
      if (!window.electron.banUser) {
          alert("CRITICAL ERROR: 'banUser' function is missing.\n\nPlease RESTART the application to apply the latest updates.");
          return;
      }

      setIsBanning(true);
      setResults([]);
      const targets = myGroups.filter(g => selectedGroupIds.has(g.id));
      setProgress({ current: 0, total: targets.length, failed: 0 });

      let current = 0;
      let failed = 0;
      const newResults = [];

      for (const group of targets) {
          try {
              const res = await window.electron.banUser(group.id, user.id);
              newResults.push({
                  groupId: group.id,
                  groupName: group.name,
                  success: res.success,
                  error: res.error
              });
              if (!res.success) failed++;
          } catch (e) {
              const errorMessage = e instanceof Error ? e.message : 'Unknown error';
              newResults.push({
                  groupId: group.id,
                  groupName: group.name,
                  success: false,
                  error: errorMessage
              });
              failed++;
          }
          current++;
          setProgress({ current, total: targets.length, failed });
          // Update results in realtime-ish
          setResults([...newResults]);
          
          // Slight delay to be nice to API? 
          await new Promise(r => setTimeout(r, 200));
      }

      setIsBanning(false);
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={!isBanning ? onClose : () => {}} title={`Ban User: ${user.displayName}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '400px', maxHeight: '70vh' }}>
            
            {!progress ? (
                <>
                    <GlassPanel style={{ padding: '1rem', background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <AppShieldIcon size={24} />
                        <div style={{ fontSize: '0.9rem', color: '#fca5a5' }}>
                            <b>Warning:</b> You are about to ban <b>{user.displayName}</b>. Select the groups to apply this ban to.
                        </div>
                    </GlassPanel>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-5px' }}>
                        <h4 style={{ margin: 0, color: 'var(--color-text-dim)' }}>Select Groups ({selectedGroupIds.size})</h4>
                        <button 
                            onClick={handleSelectAll}
                            style={{ 
                                background: 'none', border: 'none', color: 'var(--color-primary)', 
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' 
                            }}
                        >
                            {selectedGroupIds.size === myGroups.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '5px', maxHeight: '300px' }}>
                        {myGroups.map(group => (
                            <div 
                                key={group.id}
                                onClick={() => toggleGroup(group.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px',
                                    background: selectedGroupIds.has(group.id) ? 'rgba(var(--primary-hue), 100%, 50%, 0.15)' : 'rgba(255,255,255,0.03)',
                                    border: selectedGroupIds.has(group.id) ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ 
                                    width: '18px', height: '18px', borderRadius: '4px',
                                    border: selectedGroupIds.has(group.id) ? 'none' : '2px solid rgba(255,255,255,0.3)',
                                    background: selectedGroupIds.has(group.id) ? 'var(--color-primary)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {selectedGroupIds.has(group.id) && <Check size={12} color="black" strokeWidth={4} />}
                                </div>
                                <span style={{ fontSize: '0.9rem', fontWeight: selectedGroupIds.has(group.id) ? 600 : 400 }}>
                                    {group.name}
                                </span>
                                {group.shortCode && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginLeft: 'auto' }}>
                                        {group.shortCode}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                        <NeonButton variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                            Cancel
                        </NeonButton>
                        <NeonButton 
                            variant="danger" 
                            onClick={handleBan} 
                            disabled={selectedGroupIds.size === 0}
                            style={{ flex: 1, gap: '8px' }}
                        >
                            <Gavel size={18} />
                            BAN FROM {selectedGroupIds.size} GROUPS
                        </NeonButton>
                    </div>
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                            {progress.current < progress.total ? 'Banning User...' : 'Ban Operation Complete'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>
                            {progress.current} / {progress.total} Processed • {progress.failed} Failed
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                         <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                            style={{ height: '100%', background: 'var(--color-danger)' }}
                         />
                    </div>

                    {/* Results List */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {results.map(r => (
                            <div key={r.groupId} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                                <span>{r.groupName}</span>
                                {r.success ? (
                                    <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12}/> Banned</span>
                                ) : (
                                    <span style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12}/> {r.error}</span>
                                )}
                            </div>
                        ))}
                    </div>

                     {progress.current === progress.total && (
                         <div style={{ marginTop: '1.5rem' }}>
                             <NeonButton onClick={onClose} style={{ width: '100%' }}>Close</NeonButton>
                         </div>
                     )}
                </div>
            )}
        </div>
    </Modal>
  );
};
