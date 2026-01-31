import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Puzzle, ExternalLink } from 'lucide-react';
import { OscSettings } from '../settings/OscSettings';
import { DiscordRpcSettings } from '../settings/DiscordRpcSettings';
import { DiscordWebhookSettings } from '../settings/DiscordWebhookSettings';
import { IntegrationsTabBar, type IntegrationTab } from './IntegrationsTabBar';

const innerCardStyle: React.CSSProperties = {
    background: 'var(--color-surface-card)',
    borderRadius: 'var(--border-radius)',
    padding: '1.25rem',
    border: '1px solid var(--border-color)',
};

const tabContentVariants: Variants = {
    hidden: { opacity: 0, scale: 0.98 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
    exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }
};

export const IntegrationsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<IntegrationTab>('discord');

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                padding: '1rem',
                paddingBottom: 'var(--dock-height)',
                gap: '1rem',
                maxWidth: '940px', // Matches settings max-width + slight buffer
                margin: '0 auto',
                overflow: 'hidden'
            }}
        >
            {/* Fixed Header Area - Matched to SettingsView rhythm */}
            <div style={{ flexShrink: 0, width: '100%', padding: '0 1rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>INTEGRATIONS</h1>

                {/* Vertical Rhythm Spacer (placeholder for where Search bar is in Settings) */}
                <div style={{ height: '3.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    <p style={{ color: 'var(--color-text-dim)', margin: 0, fontSize: '0.95rem', opacity: 0.8 }}>
                        Configure external services and group automation hooks.
                    </p>
                </div>

                <IntegrationsTabBar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
            </div>

            <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, width: '100%' }}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        variants={tabContentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2rem',
                            flex: 1,
                            overflowY: 'auto',
                            padding: '2rem',
                            scrollbarGutter: 'stable',
                            width: '100%'
                        }}
                    >
                        {/* Discord Tab */}
                        {activeTab === 'discord' && (
                            <section>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                    <h2 style={{ color: 'var(--color-text-main)', margin: 0 }}>Discord Integration</h2>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <DiscordWebhookSettings />
                                    <DiscordRpcSettings />
                                </div>
                            </section>
                        )}

                        {/* OSC Tab */}
                        {activeTab === 'osc' && (
                            <section>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                    <h2 style={{ color: 'var(--color-text-main)', margin: 0 }}>OSC (Open Sound Control)</h2>
                                </div>

                                <div style={innerCardStyle}>
                                    <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                        Control the VRChat chatbox and other OSC-compatible features. Note: Core OSC settings are also mirrored in App Settings.
                                    </p>
                                    <OscSettings />
                                </div>
                            </section>
                        )}

                        {/* Coming Soon Tab */}
                        {activeTab === 'coming-soon' && (
                            <section>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                    <Puzzle size={24} style={{ color: 'var(--color-primary)' }} />
                                    <h2 style={{ color: 'var(--color-text-main)', margin: 0 }}>Future Expansion</h2>
                                </div>
                                <div style={{ ...innerCardStyle, borderStyle: 'dashed', textAlign: 'center', padding: '3rem 2rem' }}>
                                    <ExternalLink size={32} style={{ marginBottom: '1.5rem', opacity: 0.5, color: 'var(--color-primary)' }} />
                                    <div style={{ color: 'var(--color-text-main)', fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>More integrations on the horizon</div>
                                    <div style={{ color: 'var(--color-text-dim)', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
                                        We're working on expanding our integration ecosystem to bring even more power to your VRChat group management. Stay tuned for updates!
                                    </div>
                                </div>
                            </section>
                        )}

                    </motion.div>
                </AnimatePresence>
            </GlassPanel>
        </motion.div>
    );
};

