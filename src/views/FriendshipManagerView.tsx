import React, { useState, useEffect } from 'react';
import { GlassPanel } from '../components/ui/GlassPanel';
import { GameLogView, LocationsView, FeedView, SocialView } from './friendship';

type TabType = 'feed' | 'locations' | 'gamelog' | 'social';

export const FriendshipManagerView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('locations');
    const [isInitialized, setIsInitialized] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 10;

    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const checkStatus = async () => {
            if (cancelled) return;

            try {
                const status = await window.electron.friendship.getStatus();
                if (status.initialized) {
                    setIsInitialized(true);
                    setIsChecking(false);
                    return;
                }
            } catch (e) {
                console.error('Failed to check friendship status:', e);
            }

            if (!cancelled && retryCount < MAX_RETRIES) {
                setRetryCount(prev => prev + 1);
                timeoutId = setTimeout(checkStatus, 500);
            } else if (!cancelled) {
                setIsChecking(false);
            }
        };

        checkStatus();

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [retryCount]);

    if (!isInitialized) {
        return (
            <div style={{
                padding: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%'
            }}>
                <GlassPanel style={{
                    textAlign: 'center',
                    padding: '2rem 3rem',
                    maxWidth: '400px'
                }}>
                    {isChecking ? (
                        <>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: 700,
                                marginBottom: '1rem',
                                background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text'
                            }}>
                                Initializing Friendship Manager...
                            </h2>
                            <p style={{ color: 'var(--color-text-dim)' }}>
                                Loading your social data. Please wait.
                            </p>
                        </>
                    ) : (
                        <>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: 700,
                                marginBottom: '1rem',
                                color: '#f87171'
                            }}>
                                Friendship Manager Not Initialized
                            </h2>
                            <p style={{ color: 'var(--color-text-dim)' }}>
                                Please ensure you are logged in to use this feature.
                            </p>
                        </>
                    )}
                </GlassPanel>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            padding: '1rem',
            gap: '1rem',
            paddingBottom: 'var(--dock-height)'
        }}>
            {/* Header */}
            <GlassPanel style={{ padding: '1rem 1.5rem' }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            margin: 0,
                            background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}>
                            FRIENDSHIP MANAGER
                        </h1>
                        <p style={{
                            color: 'var(--color-text-dim)',
                            fontSize: '0.75rem',
                            marginTop: '0.25rem',
                            letterSpacing: '0.05em'
                        }}>
                            SOCIAL TRACKING & HISTORY
                        </p>
                    </div>

                    {/* Tab Bar - Settings Style */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '0.75rem',
                        marginTop: '0.25rem'
                    }}>
                        <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            justifyContent: 'space-between',
                            width: '100%',
                            maxWidth: '600px'
                        }}>
                            {[
                                { key: 'locations' as TabType, label: 'Friend Locations' },
                                { key: 'feed' as TabType, label: 'Activity Feed' },
                                { key: 'gamelog' as TabType, label: 'Instance History' },
                                { key: 'social' as TabType, label: 'Social' }
                            ].map(tab => {
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        style={{
                                            position: 'relative',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '0.6rem 1rem',
                                            background: 'transparent',
                                            border: 'none',
                                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-dim)',
                                            fontSize: '0.85rem',
                                            fontWeight: isActive ? 600 : 400,
                                            cursor: 'pointer',
                                            transition: 'color 0.2s ease',
                                            flex: 1,
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <span>{tab.label}</span>

                                        {/* Active indicator underline */}
                                        {isActive && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '-2px',
                                                left: '10%',
                                                right: '10%',
                                                height: '2px',
                                                background: 'var(--color-primary)',
                                                boxShadow: '0 0 10px var(--color-primary), 0 0 20px var(--color-primary)',
                                                borderRadius: '1px'
                                            }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {/* Content Area */}
            <div style={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                position: 'relative'
            }}>
                {activeTab === 'feed' && <FeedView />}
                {activeTab === 'locations' && <LocationsView />}
                {activeTab === 'gamelog' && <GameLogView />}
                {activeTab === 'social' && <SocialView />}
            </div>
        </div>
    );
};
