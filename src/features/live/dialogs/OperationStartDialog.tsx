import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { NeonButton } from '../../../components/ui/NeonButton';
import { Zap, Shield, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface OperationStartDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (speed: number, autoModEnabled?: boolean) => void;
    title: string;
    count: number;
    type: 'recruit' | 'rally';
    scanUsers?: boolean; // Prop to show the toggle
    groupId?: string; // Needed for permissions check if we wanted to hide it, but simple toggle is enough for now
}

export const OperationStartDialog: React.FC<OperationStartDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    count,
    type,
    scanUsers = false
}) => {
    const [selectedSpeed, setSelectedSpeed] = useState<number>(2); // Default to Normal (2s)
    const [isAutoModEnabled, setIsAutoModEnabled] = useState(false); // Local state for the toggle

    const speeds = [
        {
            value: 1,
            label: 'FAST',
            sub: '1s Interval',
            desc: 'Risk of Rate Limit',
            icon: Zap,
            color: 'var(--color-danger)'
        },
        {
            value: 2,
            label: 'NORMAL',
            sub: '2s Interval',
            desc: 'Recommended',
            icon: Clock,
            color: 'var(--color-primary)'
        },
        {
            value: 4,
            label: 'SAFE',
            sub: '4s Interval',
            desc: 'Max Stability',
            icon: Shield,
            color: 'var(--color-success)'
        }
    ];

    const footer = (
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <NeonButton 
                variant="ghost" 
                onClick={onClose}
                style={{ flex: 1 }}
            >
                CANCEL
            </NeonButton>
            <NeonButton 
                onClick={() => onConfirm(selectedSpeed, isAutoModEnabled)}
                style={{ flex: 2 }}
            >
                START SYSTEM
            </NeonButton>
        </div>
    );

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={title}
            footer={footer}
            width="600px"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center', color: 'var(--color-text-dim)' }}>
                    You are about to send invites to <strong style={{ color: 'var(--color-text-main)' }}>{count}</strong> users.
                    <br />
                    Select operation speed:
                </div>

                {type === 'recruit' && scanUsers && (
                    <div style={{ 
                        background: 'rgba(0,0,0,0.2)', 
                        padding: '12px', 
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Shield size={18} color="var(--color-primary)" />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--color-text-main)' }}>Scan with AutoMod</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Filter users against group rules before inviting</span>
                            </div>
                        </div>
                        
                        {/* Toggle Switch */}
                        <div 
                            onClick={() => setIsAutoModEnabled(!isAutoModEnabled)}
                            style={{
                                width: '44px',
                                height: '24px',
                                background: isAutoModEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'background 0.2s ease'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                background: 'white',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '2px',
                                left: isAutoModEnabled ? '22px' : '2px',
                                transition: 'left 0.2s ease',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }} />
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {speeds.map((speed) => {
                        const isSelected = selectedSpeed === speed.value;
                        const Icon = speed.icon;
                        
                        return (
                            <motion.button
                                key={speed.label}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setSelectedSpeed(speed.value)}
                                style={{
                                    background: isSelected ? `rgba(var(--primary-hue), 100%, 50%, 0.15)` : 'var(--color-surface-card)',
                                    border: isSelected ? `1px solid ${speed.color}` : '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '1rem 0.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-main)',
                                    transition: 'all 0.2s ease',
                                    boxShadow: isSelected ? `0 0 15px -5px ${speed.color}` : 'none'
                                }}
                            >
                                <Icon size={24} color={speed.color} />
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{speed.label}</div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{speed.sub}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>{speed.desc}</div>
                            </motion.button>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};
