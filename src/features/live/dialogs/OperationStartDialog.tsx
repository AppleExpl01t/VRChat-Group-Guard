import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { NeonButton } from '../../../components/ui/NeonButton';
import { Zap, Shield, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface OperationStartDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (speed: number) => void;
    title: string;
    count: number;
    type: 'recruit' | 'rally';
}

export const OperationStartDialog: React.FC<OperationStartDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    count
}) => {
    const [selectedSpeed, setSelectedSpeed] = useState<number>(2); // Default to Normal (2s)

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
                onClick={() => onConfirm(selectedSpeed)}
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
