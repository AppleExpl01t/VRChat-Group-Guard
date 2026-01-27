import React, { useState, useMemo } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { NeonButton } from '../../components/ui/NeonButton';
import { useAuthStore } from '../../stores/authStore';
import { useConfirm } from '../../context/ConfirmationContext';
import { useNotificationStore } from '../../stores/notificationStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { OscSettings } from './OscSettings';
import { DiscordRpcSettings } from './DiscordRpcSettings';
import { DiscordWebhookSettings } from './DiscordWebhookSettings';
import { AudioSettings } from './AudioSettings';
import { SettingsTabBar, type SettingsTab } from './SettingsTabBar';
import { SettingsSearch, matchesSearch } from './SettingsSearch';
import { SearchX } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

// Inner card style for settings sections (used inside main GlassPanel)
const innerCardStyle: React.CSSProperties = {
    background: 'var(--color-surface-card)',
    borderRadius: 'var(--border-radius)',
    padding: '1.25rem',
    border: '1px solid var(--border-color)',
};

// Searchable text for each tab
const TAB_SEARCH_DATA: Record<SettingsTab, string[]> = {
    appearance: ['Appearance', 'Theme', 'Primary Neon', 'Accent Neon', 'Color', 'Hue', 'Background', 'Dark', 'Light', 'Particles', 'Glass', 'Blur', 'Opacity', 'Border', 'Radius', 'Orbs', 'Effects'],
    audio: ['Audio', 'Notification Sound', 'Volume', 'Alert', 'Music'],
    notifications: ['Notifications', 'Test', 'Alert', 'Visual'],
    security: ['Security', 'Data', 'Auto-Login', 'Credentials', 'Sign in', 'Remember', 'Forget Device'],
    osc: ['OSC', 'Integration', 'VRChat', 'Open Sound Control', 'Port', 'IP', 'Chatbox'],
    discord: ['Discord', 'Webhook', 'RPC', 'Rich Presence', 'Status', 'Activity', 'Logs', 'Channel'],
    about: ['About', 'System', 'Version', 'Group Guard'],
    debug: ['Debug', 'Crash', 'Test', 'Internal'],
};

const HueSpectrumPicker: React.FC<{ 
    label: string; 
    hue: number; 
    onChange: (hue: number) => void 
}> = ({ label, hue, onChange }) => {
    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label style={{ color: 'var(--color-text-dim)' }}>{label}</label>
                <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '50%', 
                    background: `hsl(${hue}, 100%, 50%)`,
                    boxShadow: `0 0 10px hsl(${hue}, 100%, 50%)`
                }} />
            </div>
            <div style={{ position: 'relative', height: '30px', borderRadius: '15px', overflow: 'hidden' }}>
                 {/* Rainbow Background */}
                 <div style={{
                     position: 'absolute',
                     inset: 0,
                     background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
                 }} />
                 
                 {/* Slider Input Overlay */}
                 <input 
                    type="range" 
                    min="0" 
                    max="360" 
                    value={hue} 
                    onChange={(e) => onChange(Number(e.target.value))}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: 'pointer',
                        margin: 0
                    }}
                 />

                 {/* Custom Thumb Indicator */}
                 <div style={{
                     position: 'absolute',
                     left: `${(hue / 360) * 100}%`,
                     top: '0',
                     bottom: '0',
                     width: '4px',
                     background: 'white',
                     transform: 'translateX(-2px)',
                     pointerEvents: 'none',
                     boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                 }} />
            </div>
        </div>
    );
};

const tabContentVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15 } }
};

export const SettingsView: React.FC = () => {
  const { rememberMe, setRememberMe } = useAuthStore();
  const {
    primaryHue, setPrimaryHue,
    accentHue, setAccentHue,
    backgroundHue, setBackgroundHue,
    backgroundSaturation, setBackgroundSaturation,
    backgroundLightness, setBackgroundLightness,
    themeMode, setThemeMode,
    glassBlur, setGlassBlur,
    glassOpacity, setGlassOpacity,
    particleSettings, setParticleSettings,
    borderRadius, setBorderRadius,
    resetTheme
  } = useTheme();
  const { confirm } = useConfirm();
  const { addNotification } = useNotificationStore();
  const { debugModeEnabled, setDebugMode } = useUIStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  const [shouldCrash, setShouldCrash] = useState(false);
  const [versionClickCount, setVersionClickCount] = useState(0);

  if (shouldCrash) {
    throw new Error("Manual Crash Test via Settings");
  }

  const handleVersionClick = () => {
    if (debugModeEnabled) return;

    const newCount = versionClickCount + 1;
    setVersionClickCount(newCount);

    if (newCount === 5) {
        setDebugMode(true);
        addNotification({ type: 'success', title: 'Developer Mode', message: 'Debug settings unlocked!' });
        setVersionClickCount(0);
    }
  };

  const handleClearCredentials = async () => {
    const confirmed = await confirm({
      title: 'Clear Saved Credentials',
      message: 'Are you sure you want to clear saved login data? You will need to log in again.',
      confirmLabel: 'Clear Data',
      variant: 'default'
    });

    if (confirmed) {
      await window.electron.clearCredentials();
      addNotification({ type: 'success', title: 'Success', message: 'Credentials cleared.' });
    }
  };

  // Determine which tabs match the search
  const visibleTabs = useMemo(() => {
    const result: Record<SettingsTab, boolean> = {
        appearance: false,
        audio: false,
        notifications: false,
        security: false,
        osc: false,
        discord: false,
        about: false,
        debug: false,
    };

    for (const [tab, keywords] of Object.entries(TAB_SEARCH_DATA)) {
        result[tab as SettingsTab] = matchesSearch(searchQuery, ...keywords);
    }

    return result;
  }, [searchQuery]);

  // Count for search badges (1 if tab matches, 0 otherwise)
  const tabCounts = useMemo(() => {
    if (!searchQuery.trim()) return undefined;

    const counts: Record<SettingsTab, number> = {
        appearance: 0, audio: 0, notifications: 0, security: 0,
        osc: 0, discord: 0, about: 0, debug: 0
    };

    for (const tab of Object.keys(counts) as SettingsTab[]) {
        counts[tab] = visibleTabs[tab] ? 1 : 0;
    }

    return counts;
  }, [searchQuery, visibleTabs]);

  // Check if current tab has no results
  const hasNoResults = searchQuery.trim() && !visibleTabs[activeTab];

  // Auto-switch to a tab with results when current tab has none
  React.useEffect(() => {
    if (!searchQuery.trim()) return;

    // If current tab has results, stay here
    if (visibleTabs[activeTab]) return;

    // Find the first tab that has results
    const tabOrder: SettingsTab[] = ['appearance', 'audio', 'notifications', 'security', 'osc', 'discord', 'about', 'debug'];
    for (const tab of tabOrder) {
      if (visibleTabs[tab]) {
        setActiveTab(tab);
        return;
      }
    }
  }, [searchQuery, visibleTabs, activeTab]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    // Optionally clear search: setSearchQuery('');
  };

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
        maxWidth: '900px',
        margin: '0 auto',
        overflow: 'hidden'
      }}
    >
      {/* Fixed Header Area */}
      <div style={{ flexShrink: 0, width: '100%' }}>
        <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>SETTINGS</h1>

        {/* Search Bar */}
        <SettingsSearch 
          value={searchQuery} 
          onChange={setSearchQuery} 
          placeholder="Search settings..."
        />

        {/* Tab Bar */}
        <SettingsTabBar 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          tabCounts={tabCounts}
          showDebug={debugModeEnabled}
        />
      </div>

      {/* Scrollable Content Area */}
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
              gap: '1.5rem',
              flex: 1,
              overflowY: 'auto',
              padding: '1.5rem',
              scrollbarGutter: 'stable',
              width: '100%'
            }}
          >
          {/* No Results Message */}
          {hasNoResults && (
            <div style={innerCardStyle}>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: '1rem', 
                padding: '2rem',
                color: 'var(--color-text-dim)' 
              }}>
                <SearchX size={48} style={{ opacity: 0.5 }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>No settings found</div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                    Try a different search term or check other tabs
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === APPEARANCE TAB === */}
          {activeTab === 'appearance' && (
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                 <h2 style={{ color: 'var(--color-text-main)', margin: 0 }}>Appearance</h2>
                 <NeonButton variant="ghost" onClick={resetTheme} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Reset All</NeonButton>
              </div>

              {/* Theme Mode Presets */}
              <div style={innerCardStyle}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>Theme Preset</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['dark', 'light', 'midnight', 'sunset'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setThemeMode(mode)}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          border: themeMode === mode ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                          background: themeMode === mode ? 'var(--color-surface-elevated)' : 'var(--color-surface-card)',
                          color: themeMode === mode ? 'var(--color-primary)' : 'var(--color-text-dim)',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                          fontWeight: themeMode === mode ? 600 : 400,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Neon Colors */}
              <div style={innerCardStyle}>
                <h3 style={{ color: 'var(--color-text-main)', margin: '0 0 1rem 0', fontSize: '1rem' }}>Neon Colors</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <HueSpectrumPicker
                        label="Primary Neon"
                        hue={primaryHue}
                        onChange={setPrimaryHue}
                    />
                    <HueSpectrumPicker
                        label="Accent Neon"
                        hue={accentHue}
                        onChange={setAccentHue}
                    />
                </div>
              </div>

              {/* Background Colors */}
              <div style={innerCardStyle}>
                <h3 style={{ color: 'var(--color-text-main)', margin: '0 0 1rem 0', fontSize: '1rem' }}>Background</h3>
                <HueSpectrumPicker
                    label="Background Hue"
                    hue={backgroundHue}
                    onChange={setBackgroundHue}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Saturation</label>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{backgroundSaturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={backgroundSaturation}
                      onChange={(e) => setBackgroundSaturation(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Lightness</label>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{backgroundLightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={backgroundLightness}
                      onChange={(e) => setBackgroundLightness(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>

              {/* Glass & UI Effects */}
              <div style={innerCardStyle}>
                <h3 style={{ color: 'var(--color-text-main)', margin: '0 0 1rem 0', fontSize: '1rem' }}>Glass & UI Effects</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Glass Blur</label>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{glassBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={glassBlur}
                      onChange={(e) => setGlassBlur(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Glass Opacity</label>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{glassOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={glassOpacity}
                      onChange={(e) => setGlassOpacity(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Border Radius</label>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{borderRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={borderRadius}
                      onChange={(e) => setBorderRadius(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>

              {/* Particles */}
              <div style={innerCardStyle}>
                <h3 style={{ color: 'var(--color-text-main)', margin: '0 0 1rem 0', fontSize: '1rem' }}>Particles & Effects</h3>

                {/* Enable Particles Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ color: 'var(--color-text-main)', fontWeight: 500 }}>Enable Particles</div>
                    <div style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Floating background particles</div>
                  </div>
                  <div
                    onClick={() => setParticleSettings({ enabled: !particleSettings.enabled })}
                    style={{
                      width: '50px',
                      height: '26px',
                      background: particleSettings.enabled ? 'var(--color-primary)' : 'var(--color-surface-card)',
                      borderRadius: '13px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.3s ease',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: 'white',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '2px',
                      left: particleSettings.enabled ? '26px' : '2px',
                      transition: 'left 0.3s ease',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>

                {particleSettings.enabled && (
                  <>
                    {/* Particle Count */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <label style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Particle Count</label>
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>{particleSettings.count}</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={particleSettings.count}
                        onChange={(e) => setParticleSettings({ count: Number(e.target.value) })}
                        style={{ width: '100%', cursor: 'pointer' }}
                      />
                    </div>

                    {/* Particle Options */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {/* Show Orbs */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Ambient Orbs</span>
                        <div
                          onClick={() => setParticleSettings({ showOrbs: !particleSettings.showOrbs })}
                          style={{
                            width: '44px',
                            height: '24px',
                            background: particleSettings.showOrbs ? 'var(--color-primary)' : 'var(--color-surface-card)',
                            borderRadius: '12px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                          }}
                        >
                          <div style={{
                            width: '18px',
                            height: '18px',
                            background: 'white',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: particleSettings.showOrbs ? '22px' : '3px',
                            transition: 'left 0.3s ease',
                          }} />
                        </div>
                      </div>

                      {/* Color Shift */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Color Shift</span>
                        <div
                          onClick={() => setParticleSettings({ colorShift: !particleSettings.colorShift })}
                          style={{
                            width: '44px',
                            height: '24px',
                            background: particleSettings.colorShift ? 'var(--color-primary)' : 'var(--color-surface-card)',
                            borderRadius: '12px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                          }}
                        >
                          <div style={{
                            width: '18px',
                            height: '18px',
                            background: 'white',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: particleSettings.colorShift ? '22px' : '3px',
                            transition: 'left 0.3s ease',
                          }} />
                        </div>
                      </div>

                      {/* Mouse Reactive */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>Mouse Reactive</span>
                        <div
                          onClick={() => setParticleSettings({ mouseReactive: !particleSettings.mouseReactive })}
                          style={{
                            width: '44px',
                            height: '24px',
                            background: particleSettings.mouseReactive ? 'var(--color-primary)' : 'var(--color-surface-card)',
                            borderRadius: '12px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                          }}
                        >
                          <div style={{
                            width: '18px',
                            height: '18px',
                            background: 'white',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: particleSettings.mouseReactive ? '22px' : '3px',
                            transition: 'left 0.3s ease',
                          }} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', fontStyle: 'italic', textAlign: 'center', marginTop: '0.5rem' }}>
                All theme settings are automatically saved.
              </p>
            </>
          )}

          {/* === AUDIO TAB === */}
          {activeTab === 'audio' && <AudioSettings />}

          {/* === NOTIFICATIONS TAB === */}
          {activeTab === 'notifications' && (
            <section>
              <h2 style={{ color: 'var(--color-text-main)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Notifications & Alerts</h2>
              <div style={innerCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                   <div>
                      <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Test Notifications</div>
                      <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Send a test notification to verify audio and visual alerts.</div>
                   </div>
                   <NeonButton
                      variant="primary"
                      onClick={() => window.electron.automod.testNotification('TEST_GROUP')}
                   >
                      Test Notification
                   </NeonButton>
                </div>
              </div>
            </section>
          )}

          {/* === SECURITY TAB === */}
          {activeTab === 'security' && (
            <section>
              <h2 style={{ color: 'var(--color-text-main)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Security & Data</h2>
              <div style={innerCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Auto-Login</div>
                    <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Automatically sign in when application starts</div>
                  </div>
                  <div
                    onClick={() => setRememberMe(!rememberMe)}
                    style={{
                      width: '50px',
                      height: '26px',
                      background: rememberMe ? 'var(--color-primary)' : 'var(--color-surface-card)',
                      borderRadius: '13px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.3s ease',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: 'white',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '2px',
                      left: rememberMe ? '26px' : '2px',
                      transition: 'left 0.3s ease',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                   <NeonButton variant="secondary" onClick={handleClearCredentials} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                     Forget This Device
                   </NeonButton>
                   <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                     Completely removes your saved login data from this device. You will need to enter credentials and 2FA again.
                   </p>
                </div>
              </div>
            </section>
          )}

          {/* === OSC TAB === */}
          {activeTab === 'osc' && <OscSettings />}

          {/* === DISCORD TAB === */}
          {activeTab === 'discord' && (
            <>
              <DiscordWebhookSettings />
              <DiscordRpcSettings />
            </>
          )}

          {/* === ABOUT TAB === */}
          {activeTab === 'about' && (
            <section>
               <h2 style={{ color: 'var(--color-text-main)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>About System</h2>
               <div style={innerCardStyle}>
                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                   <div style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 0 10px var(--color-primary))' }}>🛡️</div>
                   <div>
                     <h3 style={{ margin: 0, fontSize: '1.2rem' }}>VRChat Group Guard</h3>
                     <p
                        style={{ color: 'var(--color-text-dim)', margin: '0.2rem 0', cursor: 'pointer', userSelect: 'none' }}
                        onClick={handleVersionClick}
                        title="Click 5 times to unlock debug mode"
                    >
                        Version 1.0.7 (Beta)
                    </p>
                     <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', opacity: 0.6, marginTop: '0.5rem' }}>
                       Developed by <a href="https://vrchat.com/home/user/usr_ef7c23be-3c3c-40b4-a01c-82f59b2a8229" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer' }}>AppleExpl01t</a> • Electron • React • Vite
                     </div>
                   </div>
                 </div>
               </div>
            </section>
          )}

          {/* === DEBUG TAB === */}
          {activeTab === 'debug' && debugModeEnabled && (
            <section>
               <h2 style={{ color: '#f87171', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Debug & Testing</h2>
               <div style={innerCardStyle}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Crash Test */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                       <div>
                          <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Crash Application</div>
                          <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Force a renderer crash to test the error boundary.</div>
                       </div>
                       <NeonButton
                          variant="danger"
                          onClick={() => setShouldCrash(true)}
                       >
                          Crash App
                       </NeonButton>
                    </div>

                    {/* Test Notification (Copied here for convenience) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                       <div>
                          <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Test Notification</div>
                          <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Trigger a test notification.</div>
                       </div>
                       <NeonButton
                          variant="secondary"
                          onClick={() => window.electron.automod.testNotification('TEST_GROUP')}
                       >
                          Test
                       </NeonButton>
                    </div>

                    {/* Show Setup Screen */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                       <div>
                          <div style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>Show Setup</div>
                          <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Go back to the initial setup screen.</div>
                       </div>
                       <NeonButton
                          variant="secondary"
                          onClick={async () => {
                             if (await confirm('Show setup screen? Your current storage will be preserved.')) {
                                await window.electron.storage.reconfigure();
                                window.location.reload();
                             }
                          }}
                       >
                          Show Setup
                       </NeonButton>
                    </div>
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
