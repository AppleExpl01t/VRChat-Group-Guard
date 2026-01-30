import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, RotateCcw, Music, Bell, Monitor, Volume2 } from 'lucide-react';
import { NeonButton } from '../../components/ui/NeonButton';
import type { AppSettings } from '../../types/electron';
import notificationSoundHelper from '../../assets/sounds/notification.mp3';

// Inner card style for settings sections
const innerCardStyle: React.CSSProperties = {
    background: 'var(--color-surface-card)',
    borderRadius: 'var(--border-radius)',
    padding: '1.25rem',
    border: '1px solid var(--border-color)',
};

const SettingToggle: React.FC<{
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
        <div>
            <div style={{ color: 'var(--color-text-main)', fontWeight: 500, fontSize: '0.9rem' }}>{label}</div>
            {description && <div style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>{description}</div>}
        </div>
        <div
            onClick={() => onChange(!checked)}
            style={{
                width: '44px',
                height: '24px',
                background: checked ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.3s ease',
                border: '1px solid var(--border-color)',
                flexShrink: 0
            }}
        >
            <div style={{
                width: '18px',
                height: '18px',
                background: 'white',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: checked ? '22px' : '2px',
                transition: 'left 0.3s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }} />
        </div>
    </div>
);

export const AudioSettings: React.FC = () => {
    // Initialize with safe defaults matching schema
    const [settings, setSettings] = useState<AppSettings>({
        audio: { notificationSoundPath: null, volume: 0.6 },
        notifications: {
            enabled: true,
            types: { join: true, leave: true, automod: true, friend: true },
            behavior: { desktop: true, sound: true, taskbarFlash: true }
        }
    });

    const [previewData, setPreviewData] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const loadSettings = React.useCallback(async () => {
        try {
            const current = await window.electron.settings.get();
            // Merge loaded settings with defaults to handle migrations/missing keys safely
            setSettings(prev => ({
                ...prev,
                ...current,
                notifications: {
                    enabled: current.notifications?.enabled ?? prev.notifications.enabled,
                    types: { ...prev.notifications.types, ...current.notifications?.types },
                    behavior: { ...prev.notifications.behavior, ...current.notifications?.behavior }
                }
            }));

            if (current.audio.notificationSoundPath) {
                const data = await window.electron.settings.getAudioData(current.audio.notificationSoundPath);
                setPreviewData(data);
            } else {
                setPreviewData(null);
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSettings = async (newSettings: AppSettings) => {
        setSettings(newSettings);
        await window.electron.settings.update(newSettings);
    };

    const updateAudio = (update: Partial<AppSettings['audio']>) => {
        const newSettings = { ...settings, audio: { ...settings.audio, ...update } };
        saveSettings(newSettings);
    };

    const updateNotificationType = (key: keyof AppSettings['notifications']['types'], value: boolean) => {
        const newSettings = {
            ...settings,
            notifications: {
                ...settings.notifications,
                types: { ...settings.notifications.types, [key]: value }
            }
        };
        saveSettings(newSettings);
    };

    const updateNotificationBehavior = (key: keyof AppSettings['notifications']['behavior'], value: boolean) => {
        const newSettings = {
            ...settings,
            notifications: {
                ...settings.notifications,
                behavior: { ...settings.notifications.behavior, [key]: value }
            }
        };
        saveSettings(newSettings);
    };

    const handleSelectFile = async () => {
        try {
            const result = await window.electron.settings.selectAudio();
            if (result) {
                setPreviewData(result.data || null);
                updateAudio({ notificationSoundPath: result.path });
            }
        } catch (error) {
            console.error('Failed to select file', error);
        }
    };

    const handleReset = async () => {
        setPreviewData(null);
        updateAudio({ notificationSoundPath: null });
    };

    const playPreview = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }

        const src = previewData || notificationSoundHelper;
        const audio = new Audio(src);
        audio.volume = settings.audio.volume;
        audioRef.current = audio;
        audio.play().catch(e => console.error("Preview failed", e));
    };

    return (
        <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h2 style={{ color: 'var(--color-text-main)', margin: 0 }}>Audio & Alerts</h2>

                {/* Master Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', color: settings.notifications.enabled ? 'var(--color-primary)' : 'var(--color-text-dim)' }}>
                        {settings.notifications.enabled ? 'Alerts On' : 'Alerts Off'}
                    </span>
                    <div
                        onClick={() => saveSettings({ ...settings, notifications: { ...settings.notifications, enabled: !settings.notifications.enabled } })}
                        style={{
                            width: '40px',
                            height: '24px',
                            background: settings.notifications.enabled ? 'var(--color-primary)' : 'var(--color-surface-card)', // 'var(--color-surface-card)' for off state to be greyish
                            borderRadius: '12px',
                            position: 'relative',
                            cursor: 'pointer',
                            opacity: settings.notifications.enabled ? 1 : 0.5,
                            border: '1px solid var(--border-color)'
                        }}
                    >
                        <div style={{
                            width: '16px',
                            height: '16px',
                            background: 'white',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: settings.notifications.enabled ? '19px' : '3px',
                            transition: 'left 0.2s ease',
                        }} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* === AUDIO CONTROLS === */}
                <div style={innerCardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Volume2 size={18} /> Audio Settings
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                        {/* Notification Sound */}
                        <div>
                            <label style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem', display: 'block' }}>Sound File</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{
                                    flex: 1,
                                    background: 'var(--color-surface-elevated)',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.9rem',
                                    color: 'var(--color-text-main)'
                                }}>
                                    <Music size={14} style={{ opacity: 0.7 }} />
                                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {settings.audio.notificationSoundPath ?
                                            settings.audio.notificationSoundPath.split(/[\\/]/).pop() :
                                            'System Default'}
                                    </div>
                                    <button
                                        onClick={playPreview}
                                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '4px' }}
                                        title="Preview"
                                    >
                                        <Play size={16} fill="currentColor" />
                                    </button>
                                </div>
                                <NeonButton variant="secondary" size="sm" onClick={handleSelectFile}>
                                    <Upload size={14} />
                                </NeonButton>
                                {settings.audio.notificationSoundPath && (
                                    <NeonButton variant="ghost" size="sm" onClick={handleReset}>
                                        <RotateCcw size={14} />
                                    </NeonButton>
                                )}
                            </div>
                        </div>

                        {/* Volume */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>Volume</label>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                                    {Math.round(settings.audio.volume * 100)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.05"
                                value={settings.audio.volume}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    updateAudio({ volume: val });
                                    if (audioRef.current) audioRef.current.volume = val;
                                }}
                                style={{ width: '100%', cursor: 'pointer' }}
                            />
                        </div>
                    </div>
                </div>

                {/* === EVENT TYPES === */}
                <div style={innerCardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Bell size={18} /> Alert Triggers
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem 2rem' }}>
                        <SettingToggle
                            label="User Join"
                            checked={settings.notifications.types.join}
                            onChange={(v) => updateNotificationType('join', v)}
                        />
                        <SettingToggle
                            label="User Leave"
                            checked={settings.notifications.types.leave}
                            onChange={(v) => updateNotificationType('leave', v)}
                        />
                        <SettingToggle
                            label="AutoMod Activity"
                            checked={settings.notifications.types.automod}
                            onChange={(v) => updateNotificationType('automod', v)}
                        />
                        <SettingToggle
                            label="Friend Status"
                            checked={settings.notifications.types.friend}
                            onChange={(v) => updateNotificationType('friend', v)}
                        />
                    </div>
                </div>

                {/* === BEHAVIOR === */}
                <div style={innerCardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Monitor size={18} /> Behavior
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem 2rem' }}>
                        <SettingToggle
                            label="Play Sound"
                            description="Audible alert on trigger"
                            checked={settings.notifications.behavior.sound}
                            onChange={(v) => updateNotificationBehavior('sound', v)}
                        />
                        <SettingToggle
                            label="Desktop Notification"
                            description="Show system toast popup"
                            checked={settings.notifications.behavior.desktop}
                            onChange={(v) => updateNotificationBehavior('desktop', v)}
                        />
                        <SettingToggle
                            label="Flash Taskbar"
                            description="Highlight icon in taskbar"
                            checked={settings.notifications.behavior.taskbarFlash}
                            onChange={(v) => updateNotificationBehavior('taskbarFlash', v)}
                        />
                    </div>
                </div>

            </div>
        </section>
    );
};
