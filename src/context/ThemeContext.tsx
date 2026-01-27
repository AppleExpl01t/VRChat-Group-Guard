import React, { createContext, useContext, useEffect, useState } from 'react';

// Theme mode type
export type ThemeMode = 'dark' | 'light' | 'midnight' | 'sunset';

// Particle settings interface
export interface ParticleSettings {
  enabled: boolean;
  count: number;
  showOrbs: boolean;
  colorShift: boolean;
  mouseReactive: boolean;
}

// Define the shape of our Theme State
interface ThemeState {
  // Color settings
  primaryHue: number;
  setPrimaryHue: (hue: number) => void;
  accentHue: number;
  setAccentHue: (hue: number) => void;

  // Background settings
  backgroundHue: number;
  setBackgroundHue: (hue: number) => void;
  backgroundSaturation: number;
  setBackgroundSaturation: (sat: number) => void;
  backgroundLightness: number;
  setBackgroundLightness: (light: number) => void;

  // Theme mode
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  // Glass/UI effects
  glassBlur: number;
  setGlassBlur: (px: number) => void;
  glassOpacity: number;
  setGlassOpacity: (opacity: number) => void;

  // Particle settings
  particleSettings: ParticleSettings;
  setParticleSettings: (settings: Partial<ParticleSettings>) => void;

  // Header gradient
  headerGradientEnabled: boolean;
  setHeaderGradientEnabled: (enabled: boolean) => void;

  // UI scale
  uiScale: number;
  setUiScale: (scale: number) => void;

  // Border radius
  borderRadius: number;
  setBorderRadius: (radius: number) => void;

  // Reset
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Default values
const DEFAULTS = {
  primaryHue: 270,
  accentHue: 180,
  backgroundHue: 240,
  backgroundSaturation: 20,
  backgroundLightness: 5,
  themeMode: 'dark' as ThemeMode,
  glassBlur: 20,
  glassOpacity: 45,
  uiScale: 1,
  borderRadius: 12,
  headerGradientEnabled: true,
  particleSettings: {
    enabled: true,
    count: 15,
    showOrbs: true,
    colorShift: false,
    mouseReactive: false,
  },
};

// Theme mode presets - comprehensive style changes for distinct looks
const THEME_PRESETS: Record<ThemeMode, typeof DEFAULTS> = {
  dark: {
    // Original neon cyberpunk theme
    primaryHue: 270,        // Purple/Violet neon
    accentHue: 180,         // Cyan neon
    backgroundHue: 240,     // Deep blue-black
    backgroundSaturation: 20,
    backgroundLightness: 5,
    themeMode: 'dark' as ThemeMode,
    glassBlur: 20,
    glassOpacity: 45,
    borderRadius: 12,
    headerGradientEnabled: true,
    uiScale: 1,
    particleSettings: {
      enabled: true,
      count: 15,
      showOrbs: true,
      colorShift: false,
      mouseReactive: false,
    },
  },
  light: {
    // Clean, bright professional theme
    primaryHue: 220,        // Professional blue
    accentHue: 280,         // Soft purple accent
    backgroundHue: 220,     // Light blue-gray
    backgroundSaturation: 15,
    backgroundLightness: 96,
    themeMode: 'light' as ThemeMode,
    glassBlur: 12,
    glassOpacity: 80,
    borderRadius: 16,
    headerGradientEnabled: true,
    uiScale: 1,
    particleSettings: {
      enabled: true,
      count: 8,
      showOrbs: false,
      colorShift: false,
      mouseReactive: false,
    },
  },
  midnight: {
    // Deep space, ultra dark with glowing accents
    primaryHue: 280,        // Deep purple
    accentHue: 200,         // Electric blue
    backgroundHue: 260,     // Near-black purple
    backgroundSaturation: 50,
    backgroundLightness: 2,
    themeMode: 'midnight' as ThemeMode,
    glassBlur: 30,
    glassOpacity: 25,
    borderRadius: 8,
    headerGradientEnabled: true,
    uiScale: 1,
    particleSettings: {
      enabled: true,
      count: 25,
      showOrbs: true,
      colorShift: true,
      mouseReactive: true,
    },
  },
  sunset: {
    // Warm, cozy orange/pink vibes
    primaryHue: 25,         // Warm orange
    accentHue: 340,         // Pink/magenta
    backgroundHue: 10,      // Dark warm brown
    backgroundSaturation: 35,
    backgroundLightness: 5,
    themeMode: 'sunset' as ThemeMode,
    glassBlur: 18,
    glassOpacity: 40,
    borderRadius: 14,
    headerGradientEnabled: true,
    uiScale: 1,
    particleSettings: {
      enabled: true,
      count: 12,
      showOrbs: true,
      colorShift: false,
      mouseReactive: false,
    },
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from LocalStorage or Default
  const [primaryHue, setPrimaryHue] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_primaryHue') || String(DEFAULTS.primaryHue)));
  const [accentHue, setAccentHue] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_accentHue') || String(DEFAULTS.accentHue)));
  const [backgroundHue, setBackgroundHue] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_backgroundHue') || String(DEFAULTS.backgroundHue)));
  const [backgroundSaturation, setBackgroundSaturation] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_backgroundSaturation') || String(DEFAULTS.backgroundSaturation)));
  const [backgroundLightness, setBackgroundLightness] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_backgroundLightness') || String(DEFAULTS.backgroundLightness)));
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() =>
    (localStorage.getItem('theme_mode') as ThemeMode) || DEFAULTS.themeMode);
  const [glassBlur, setGlassBlur] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_glassBlur') || String(DEFAULTS.glassBlur)));
  const [glassOpacity, setGlassOpacity] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_glassOpacity') || String(DEFAULTS.glassOpacity)));
  const [uiScale, setUiScale] = useState<number>(() =>
    parseFloat(localStorage.getItem('theme_uiScale') || String(DEFAULTS.uiScale)));
  const [borderRadius, setBorderRadius] = useState<number>(() =>
    parseInt(localStorage.getItem('theme_borderRadius') || String(DEFAULTS.borderRadius)));
  const [headerGradientEnabled, setHeaderGradientEnabled] = useState<boolean>(() =>
    localStorage.getItem('theme_headerGradient') !== 'false');
  const [particleSettings, setParticleSettingsState] = useState<ParticleSettings>(() => {
    const stored = localStorage.getItem('theme_particleSettings');
    return stored ? JSON.parse(stored) : DEFAULTS.particleSettings;
  });

  // Set theme mode with presets - applies all preset values for a complete theme change
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    const preset = THEME_PRESETS[mode];

    // Apply all color settings
    setPrimaryHue(preset.primaryHue);
    setAccentHue(preset.accentHue);
    setBackgroundHue(preset.backgroundHue);
    setBackgroundSaturation(preset.backgroundSaturation);
    setBackgroundLightness(preset.backgroundLightness);

    // Apply glass/UI settings
    setGlassBlur(preset.glassBlur);
    setGlassOpacity(preset.glassOpacity);
    setBorderRadius(preset.borderRadius);

    // Apply particle settings
    setParticleSettingsState(preset.particleSettings);

    // Apply other settings
    setHeaderGradientEnabled(preset.headerGradientEnabled);
  };

  // Partial update for particle settings
  const setParticleSettings = (settings: Partial<ParticleSettings>) => {
    setParticleSettingsState(prev => ({ ...prev, ...settings }));
  };

  // Sync state to CSS Variables and localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary-hue', primaryHue.toString());
    localStorage.setItem('theme_primaryHue', primaryHue.toString());
  }, [primaryHue]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-hue', accentHue.toString());
    localStorage.setItem('theme_accentHue', accentHue.toString());
  }, [accentHue]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-hue', backgroundHue.toString());
    localStorage.setItem('theme_backgroundHue', backgroundHue.toString());
  }, [backgroundHue]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-sat', `${backgroundSaturation}%`);
    localStorage.setItem('theme_backgroundSaturation', backgroundSaturation.toString());
  }, [backgroundSaturation]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-light', `${backgroundLightness}%`);
    localStorage.setItem('theme_backgroundLightness', backgroundLightness.toString());

    const isLightMode = backgroundLightness > 50;
    root.setAttribute('data-theme', isLightMode ? 'light' : 'dark');

    // Adjust text colors based on background lightness
    if (isLightMode) {
      root.style.setProperty('--color-text-main', '#1a1a2e');
      root.style.setProperty('--color-text-dim', 'rgba(26, 26, 46, 0.6)');
      // Light mode surface colors
      root.style.setProperty('--color-surface-dark', `hsl(${backgroundHue}, ${backgroundSaturation}%, 88%)`);
      root.style.setProperty('--color-surface-overlay', `hsla(${backgroundHue}, ${backgroundSaturation}%, 100%, 0.7)`);
      root.style.setProperty('--color-surface-card', `hsla(${backgroundHue}, ${backgroundSaturation}%, 100%, 0.6)`);
      root.style.setProperty('--color-surface-elevated', `hsla(${backgroundHue}, ${backgroundSaturation}%, 100%, 0.9)`);
      root.style.setProperty('--color-surface-terminal', `hsl(${backgroundHue}, ${backgroundSaturation}%, 95%)`);
      root.style.setProperty('--color-terminal-border', `hsla(${backgroundHue}, ${backgroundSaturation}%, 80%, 1)`);
      // Light mode borders
      root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--border-highlight', 'rgba(255, 255, 255, 0.8)');
      root.style.setProperty('--border-shadow', 'rgba(0, 0, 0, 0.1)');
      // Light mode shadows
      root.style.setProperty('--shadow-floating', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)');
      root.style.setProperty('--shadow-floating-hover', '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 20px 25px -5px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.9)');
      // Light mode panel background
      root.style.setProperty('--color-bg-panel', `hsla(${backgroundHue}, ${backgroundSaturation}%, 100%, ${glassOpacity / 100})`);
    } else {
      root.style.setProperty('--color-text-main', '#ffffff');
      root.style.setProperty('--color-text-dim', 'rgba(255, 255, 255, 0.6)');
      // Dark mode surface colors
      root.style.setProperty('--color-surface-dark', `hsl(${backgroundHue}, ${backgroundSaturation}%, 3%)`);
      root.style.setProperty('--color-surface-overlay', `hsla(${backgroundHue}, ${backgroundSaturation}%, 5%, 0.45)`);
      root.style.setProperty('--color-surface-card', `hsla(${backgroundHue}, ${backgroundSaturation}%, 8%, 0.6)`);
      root.style.setProperty('--color-surface-elevated', `hsla(${backgroundHue}, ${backgroundSaturation}%, 10%, 0.8)`);
      root.style.setProperty('--color-surface-terminal', `hsl(${backgroundHue}, ${backgroundSaturation}%, 2%)`);
      root.style.setProperty('--color-terminal-border', `hsla(${backgroundHue}, ${backgroundSaturation}%, 12%, 1)`);
      // Dark mode borders
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.1)');
      root.style.setProperty('--border-highlight', 'rgba(255, 255, 255, 0.25)');
      root.style.setProperty('--border-shadow', 'rgba(0, 0, 0, 0.3)');
      // Dark mode shadows
      root.style.setProperty('--shadow-floating', '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 10px 15px -3px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)');
      root.style.setProperty('--shadow-floating-hover', '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 20px 25px -5px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.25)');
      // Dark mode panel background
      root.style.setProperty('--color-bg-panel', `hsla(${backgroundHue}, ${backgroundSaturation}%, 10%, ${glassOpacity / 100})`);
    }
  }, [backgroundLightness, backgroundHue, backgroundSaturation, glassOpacity]);

  useEffect(() => {
    localStorage.setItem('theme_mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--glass-blur', `${glassBlur}px`);
    localStorage.setItem('theme_glassBlur', glassBlur.toString());
  }, [glassBlur]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--glass-opacity', (glassOpacity / 100).toString());
    localStorage.setItem('theme_glassOpacity', glassOpacity.toString());
    // Note: --color-bg-panel is now updated in the backgroundLightness effect
  }, [glassOpacity]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', uiScale.toString());
    localStorage.setItem('theme_uiScale', uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--border-radius', `${borderRadius}px`);
    localStorage.setItem('theme_borderRadius', borderRadius.toString());
  }, [borderRadius]);

  useEffect(() => {
    localStorage.setItem('theme_headerGradient', String(headerGradientEnabled));
  }, [headerGradientEnabled]);

  useEffect(() => {
    localStorage.setItem('theme_particleSettings', JSON.stringify(particleSettings));
  }, [particleSettings]);

  const resetTheme = () => {
    setPrimaryHue(DEFAULTS.primaryHue);
    setAccentHue(DEFAULTS.accentHue);
    setBackgroundHue(DEFAULTS.backgroundHue);
    setBackgroundSaturation(DEFAULTS.backgroundSaturation);
    setBackgroundLightness(DEFAULTS.backgroundLightness);
    setThemeModeState(DEFAULTS.themeMode);
    setGlassBlur(DEFAULTS.glassBlur);
    setGlassOpacity(DEFAULTS.glassOpacity);
    setUiScale(DEFAULTS.uiScale);
    setBorderRadius(DEFAULTS.borderRadius);
    setHeaderGradientEnabled(DEFAULTS.headerGradientEnabled);
    setParticleSettingsState(DEFAULTS.particleSettings);
  };

  return (
    <ThemeContext.Provider value={{
      primaryHue, setPrimaryHue,
      accentHue, setAccentHue,
      backgroundHue, setBackgroundHue,
      backgroundSaturation, setBackgroundSaturation,
      backgroundLightness, setBackgroundLightness,
      themeMode, setThemeMode,
      glassBlur, setGlassBlur,
      glassOpacity, setGlassOpacity,
      particleSettings, setParticleSettings,
      headerGradientEnabled, setHeaderGradientEnabled,
      uiScale, setUiScale,
      borderRadius, setBorderRadius,
      resetTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

