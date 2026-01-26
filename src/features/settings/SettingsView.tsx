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
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid rgba(255,255,255,0.05)',
};

// Searchable text for each section
const SECTION_SEARCH_DATA = {
    appearance: ['Appearance', 'Theme', 'Primary Neon', 'Accent Neon', 'Color', 'Hue'],
    audio: ['Audio', 'Notification Sound', 'Volume', 'Alert', 'Music'],
    notifications: ['Notifications', 'Test', 'Alert', 'Visual'],
    security: ['Security', 'Data', 'Auto-Login', 'Credentials', 'Sign in', 'Remember', 'Forget Device'],
    osc: ['OSC', 'Integration', 'VRChat', 'Open Sound Control', 'Port', 'IP', 'Chatbox'],
    discordWebhook: ['Discord', 'Webhook', 'Logs', 'Channel', 'Events'],
    discordRpc: ['Discord', 'RPC', 'Rich Presence', 'Status', 'Activity'],
    about: ['About', 'System', 'Version', 'Group Guard'],
    debug: ['Debug', 'Crash', 'Test', 'Internal'],
};

// Map sections to tabs
const TAB_SECTIONS: Record<SettingsTab, (keyof typeof SECTION_SEARCH_DATA)[]> = {
    general: ['appearance', 'audio', 'notifications', 'security'],
    integrations: ['osc', 'discordWebhook', 'discordRpc'],
    about: ['about'],
    debug: ['debug'],
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
  const { primaryHue, setPrimaryHue, accentHue, setAccentHue, resetTheme } = useTheme();
  const { confirm } = useConfirm();
  const { addNotification } = useNotificationStore();
  const { debugModeEnabled, setDebugMode } = useUIStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
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

  // Determine which sections are visible based on search
  const visibleSections = useMemo(() => {
    const result: Record<keyof typeof SECTION_SEARCH_DATA, boolean> = {
        appearance: false,
        audio: false,
        notifications: false,
        security: false,
        osc: false,
        discordWebhook: false,
        discordRpc: false,
        about: false,
        debug: false,
    };
    
    for (const [section, keywords] of Object.entries(SECTION_SEARCH_DATA)) {
        result[section as keyof typeof SECTION_SEARCH_DATA] = matchesSearch(searchQuery, ...keywords);
    }
    
    return result;
  }, [searchQuery]);

  // Count visible sections per tab (for search badges)
  const tabCounts = useMemo(() => {
    if (!searchQuery.trim()) return undefined;
    
    const counts: Record<SettingsTab, number> = { general: 0, integrations: 0, about: 0, debug: 0 };
    
    for (const [tab, sections] of Object.entries(TAB_SECTIONS)) {
        counts[tab as SettingsTab] = sections.filter(s => visibleSections[s]).length;
    }
    
    return counts;
  }, [searchQuery, visibleSections]);

  // Get sections to render for current tab
  const currentTabSections = TAB_SECTIONS[activeTab];
  const visibleInCurrentTab = currentTabSections.filter(s => visibleSections[s]);
  const hasNoResults = searchQuery.trim() && visibleInCurrentTab.length === 0;

  // Auto-switch to a tab with results when current tab has none
  React.useEffect(() => {
    if (!searchQuery.trim()) return;
    
    // If current tab has results, stay here
    if (visibleInCurrentTab.length > 0) return;
    
    // Find the first tab that has results
    const tabOrder: SettingsTab[] = ['general', 'integrations', 'about', 'debug'];
    for (const tab of tabOrder) {
      const sections = TAB_SECTIONS[tab];
      const hasResults = sections.some(s => visibleSections[s]);
      if (hasResults) {
        setActiveTab(tab);
        return;
      }
    }
  }, [searchQuery, visibleSections, visibleInCurrentTab.length]);

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

          {/* === GENERAL TAB === */}
          {activeTab === 'general' && (
            <>
              {/* Appearance Section */}
              {visibleSections.appearance && (
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                     <h2 style={{ color: 'white', margin: 0 }}>Appearance</h2>
                     <NeonButton variant="ghost" onClick={resetTheme} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Reset Theme</NeonButton>
                  </div>
                  
                  <div style={innerCardStyle}>
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
                    
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
                      Theme settings are automatically saved.
                    </p>
                  </div>
                </section>
              )}

              {/* Audio Settings */}
              {visibleSections.audio && <AudioSettings />}

              {/* Notifications Section */}
              {visibleSections.notifications && (
                <section>
                  <h2 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Notifications</h2>
                  <div style={innerCardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                       <div>
                          <div style={{ color: 'white', fontWeight: 600 }}>Test Notifications</div>
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

              {/* Security Section */}
              {visibleSections.security && (
                <section>
                  <h2 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Security & Data</h2>
                  <div style={innerCardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                      <div>
                        <div style={{ color: 'white', fontWeight: 600 }}>Auto-Login</div>
                        <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Automatically sign in when application starts</div>
                      </div>
                      <div 
                        onClick={() => setRememberMe(!rememberMe)}
                        style={{
                          width: '50px',
                          height: '26px',
                          background: rememberMe ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                          borderRadius: '13px',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.3s ease',
                          border: '1px solid rgba(255,255,255,0.1)'
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

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
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
            </>
          )}

          {/* === INTEGRATIONS TAB === */}
          {activeTab === 'integrations' && (
            <>
              {visibleSections.osc && <OscSettings />}
              {visibleSections.discordWebhook && <DiscordWebhookSettings />}
              {visibleSections.discordRpc && <DiscordRpcSettings />}
            </>
          )}

          {/* === ABOUT TAB === */}
          {activeTab === 'about' && visibleSections.about && (
            <section>
               <h2 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>About System</h2>
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
          {activeTab === 'debug' && visibleSections.debug && debugModeEnabled && (
            <section>
               <h2 style={{ color: '#f87171', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Debug & Testing</h2>
               <div style={innerCardStyle}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Crash Test */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                       <div>
                          <div style={{ color: 'white', fontWeight: 600 }}>Crash Application</div>
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
                          <div style={{ color: 'white', fontWeight: 600 }}>Test Notification</div>
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
                          <div style={{ color: 'white', fontWeight: 600 }}>Show Setup</div>
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
