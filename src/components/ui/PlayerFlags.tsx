import React, { useState, useEffect } from 'react';
import { Tag, Plus, Minus, X, AlertTriangle, CheckCircle } from 'lucide-react';
import styles from '../../features/dashboard/dialogs/UserProfileDialog.module.css';

interface PlayerFlag {
    id: string;
    label: string;
    description: string;
    type: 'negative' | 'positive';
    color: string;
}

interface PlayerFlagsProps {
    userId: string;
}

export const PlayerFlags: React.FC<PlayerFlagsProps> = ({ userId }) => {
    const [flags, setFlags] = useState<string[]>([]);
    const [definitions, setDefinitions] = useState<PlayerFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [userFlags, defs] = await Promise.all([
                    window.electron.playerFlags.getFlags(userId),
                    window.electron.playerFlags.getDefinitions()
                ]);
                setFlags(userFlags || []);
                setDefinitions(defs || []);
            } catch (err) {
                console.error('Failed to load player flags:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userId]);

    const toggleFlag = async (flagId: string) => {
        const newFlags = flags.includes(flagId)
            ? flags.filter(id => id !== flagId)
            : [...flags, flagId];

        setFlags(newFlags);
        try {
            await window.electron.playerFlags.setFlags(userId, newFlags);
        } catch (err) {
            console.error('Failed to save player flags:', err);
        }
    };

    const activeFlags = definitions.filter(d => flags.includes(d.id));
    const availableFlags = definitions.filter(d => !flags.includes(d.id));

    if (loading) return null;

    return (
        <div className={styles.flagsContainer}>
            <div className={styles.flagsHeader}>
                <div className={styles.flagsTitle}>
                    <Tag size={16} />
                    <span>Player Flags</span>
                </div>
                <button
                    className={styles.addFlagBtn}
                    onClick={() => setShowPicker(!showPicker)}
                    title={showPicker ? "Close Picker" : "Add Flag"}
                >
                    {showPicker ? <Minus size={16} /> : <Plus size={16} />}
                </button>
            </div>

            <div className={styles.activeFlags}>
                {activeFlags.length === 0 && !showPicker && (
                    <span className={styles.noFlags}>No flags assigned</span>
                )}

                {activeFlags.map(flag => (
                    <div
                        key={flag.id}
                        className={`${styles.flagChip} ${flag.type === 'negative' ? styles.negativeFlag : styles.positiveFlag}`}
                        title={flag.description}
                    >
                        {flag.type === 'negative' ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                        <span>{flag.label}</span>
                        <button className={styles.removeFlag} onClick={() => toggleFlag(flag.id)}>
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {showPicker && (
                <div className={styles.flagPicker}>
                    <div className={styles.pickerSection}>
                        <label>Negative Flags</label>
                        <div className={styles.pickerGrid}>
                            {availableFlags.filter(f => f.type === 'negative').map(flag => (
                                <button
                                    key={flag.id}
                                    className={styles.pickerItem}
                                    onClick={() => toggleFlag(flag.id)}
                                >
                                    {flag.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.pickerSection}>
                        <label>Positive Flags</label>
                        <div className={styles.pickerGrid}>
                            {availableFlags.filter(f => f.type === 'positive').map(flag => (
                                <button
                                    key={flag.id}
                                    className={styles.pickerItem}
                                    onClick={() => toggleFlag(flag.id)}
                                >
                                    {flag.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
