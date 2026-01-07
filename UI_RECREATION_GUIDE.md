# UI Recreation Guide

This guide documents how to recreate the exact UI stack and design system from the "Group Guard" application for a new project.

## 1. Technology Stack

- **Core**: [Electron](https://www.electronjs.org/) (Process Manager), [React](https://react.dev/) (UI Library), [Vite](https://vitejs.dev/) (Bundler).
- **Styling**: Vanilla CSS with **CSS Variables** for theming and **CSS Modules** for component-scoped styles. _No Tailwind is strictly required, although utility classes are used._
- **Animation**: [Framer Motion](https://www.framer.com/motion/) for complex transitions (modals, entering elements).
- **Icons**: [Lucide React](https://lucide.dev/).
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) (optional, but used in the original for UI state like modal counts).

## 2. Project Setup

Initialize a new Vite + React project (or use an Electron-Vite template):

```bash
npm create vite@latest my-new-app -- --template react-ts
cd my-new-app
npm install
```

Install necessary dependencies:

```bash
npm install framer-motion lucide-react clsx
# If using Electron
npm install --save-dev electron electron-builder wait-on concurrently cross-env
```

## 3. Design System Implementation

The design relies on a global variable system (HSL-based) and utility classes for the "Glassmorphism" effect.

### A. Theme Variables (`src/styles/theme.css`)

Create this file to define your color palette and design tokens.

```css
:root {
  /* --- CORE PALETTE (HSL) --- */
  --primary-hue: 330; /* Neon Pink */
  --primary-sat: 100%;
  --primary-light: 60%;

  --accent-hue: 190; /* Neon Cyan */
  --accent-sat: 100%;
  --accent-light: 60%;

  --bg-hue: 240; /* Dark Blue-Black */
  --bg-sat: 20%;
  --bg-light: 5%;

  /* --- GENERATED COLORS --- */
  --color-primary: hsl(
    var(--primary-hue),
    var(--primary-sat),
    var(--primary-light)
  );
  --color-primary-glow: hsl(
    var(--primary-hue),
    var(--primary-sat),
    var(--primary-light),
    0.6
  );
  --color-accent: hsl(
    var(--accent-hue),
    var(--accent-sat),
    var(--accent-light)
  );

  --color-bg-app: hsl(var(--bg-hue), var(--bg-sat), var(--bg-light));
  --color-bg-panel: hsla(
    var(--bg-hue),
    var(--bg-sat),
    10%,
    0.45
  ); /* Glass Background */
  --color-text-main: #ffffff;
  --color-text-dim: rgba(255, 255, 255, 0.6);

  /* --- AESTHETICS --- */
  --glass-blur: 20px;
  --border-radius: 12px;
  --border-color: rgba(255, 255, 255, 0.1);
  --transition-fast: 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

body {
  background-color: var(--color-bg-app);
  color: var(--color-text-main);
  font-family: "Inter", system-ui, sans-serif;
}
```

### B. Global Utilities (`src/styles/global.css`)

Define the glass panel class here, which is the cornerstone of the UI.

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* The Core Glass Effect */
.glass-panel {
  background: var(--color-bg-panel);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--border-radius);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.text-gradient {
  background: linear-gradient(
    90deg,
    var(--color-primary) 0%,
    var(--color-accent) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

**Important**: Import these files in your `src/main.tsx` or `src/App.tsx`.

```tsx
import "./styles/theme.css";
import "./styles/global.css";
```

## 4. Reusable UI Components

### GlassPanel (`src/components/ui/GlassPanel.tsx`)

A simple wrapper component to apply the glass effect.

```tsx
import React, { type ReactNode } from "react";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = "",
  style,
  ...props
}) => {
  return (
    <div
      className={`glass-panel ${className}`}
      style={{ padding: "1.5rem", ...style }}
      {...props}
    >
      {children}
    </div>
  );
};
```

### NeonButton (`src/components/ui/NeonButton.tsx`)

The primary interactive element with glow effects.

**1. The Component:**

```tsx
import React from "react";
import styles from "./NeonButton.module.css";

interface NeonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

export const NeonButton: React.FC<NeonButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  glow = true,
  className,
  ...props
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${
        glow ? styles.glow : ""
      } ${className || ""}`}
      {...props}
    >
      <span className={styles.content}>{children}</span>
      {glow && <div className={styles.glowLayer} />}
    </button>
  );
};
```

**2. The Styles (`src/components/ui/NeonButton.module.css`):**

```css
.button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  overflow: hidden;
  transition: all var(--transition-fast);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.primary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  box-shadow: 0 0 10px var(--color-primary-glow);
}

.primary:hover {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 20px var(--color-primary-glow);
  transform: translateY(-1px);
  color: white;
}

.secondary {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--color-text-main);
}
/* Add other variants (danger, ghost, sizes) as needed */
```

### Modal with Framer Motion (`src/components/ui/Modal.tsx`)

Used for dialogs, featuring a spring animation.

```tsx
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { GlassPanel } from "./GlassPanel";

// ... interfaces ...

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  // Portal to document.body
  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
            }}
          />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ zIndex: 10, position: "relative" }}
          >
            <GlassPanel>
              <h2>{title}</h2>
              <div>{children}</div>
            </GlassPanel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
```

## 5. Complex UI Elements

### The Neon Dock (`src/components/layout/NeonDock.tsx`)

The floating navigation bar with glow effects and Framer Motion layout transitions.

**1. The Component:**

```tsx
import React, { memo } from "react";
import styles from "./NeonDock.module.css";
import { motion, AnimatePresence } from "framer-motion";

// Simple item component
const DockItem = memo(
  ({ label, isActive, onClick, icon, color = "var(--color-primary)" }: any) => {
    return (
      <button
        onClick={onClick}
        className={`${styles.dockItem} ${
          isActive ? styles.dockItemActive : ""
        }`}
        style={{ "--item-color": color } as React.CSSProperties}
      >
        {isActive && (
          <motion.div
            layoutId="activeGlow"
            className={styles.glowEffect}
            transition={{ duration: 0.2 }}
          />
        )}

        <div
          className={`${styles.iconWrapper} ${
            isActive ? styles.iconWrapperActive : ""
          }`}
        >
          {icon}
        </div>

        <span
          className={`${styles.label} ${isActive ? styles.labelActive : ""}`}
        >
          {label}
        </span>

        {/* Active Indicator Dot */}
        {isActive && (
          <motion.div
            layoutId="activeDot"
            className={styles.activeDot}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
      </button>
    );
  }
);

export const NeonDock = ({ currentView, onViewChange }: any) => {
  return (
    <div className={styles.dockContainer}>
      <motion.div className={styles.dock} layout>
        {/* Example Item */}
        <DockItem
          label="Home"
          isActive={currentView === "home"}
          onClick={() => onViewChange("home")}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            </svg>
          }
        />
        {/* Add more items here */}
      </motion.div>
    </div>
  );
};
```

**2. The Styles (`src/components/layout/NeonDock.module.css`):**

```css
.dockContainer {
  position: fixed;
  bottom: 1.5rem;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 1000;
  pointer-events: none;
}

.dock {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 4px 6px;
  background: rgba(10, 10, 15, 0.45);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  transform: translateZ(0);
}

.dockItem {
  background: transparent;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  padding: 8px;
  position: relative;
  color: var(--color-text-dim);
  min-width: 70px;
  transition: transform 0.15s ease, color 0.15s ease;
}

.dockItem:hover {
  transform: scale(1.1) translateY(-3px);
}

.dockItemActive {
  color: white;
}

.glowEffect {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  filter: blur(10px);
  z-index: -1;
  background: radial-gradient(
    circle at center,
    var(--item-color) 0%,
    transparent 70%
  );
}

.activeDot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--item-color);
  box-shadow: 0 0 8px var(--item-color);
  margin-top: 0.2rem;
}

.label {
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.7;
}

.labelActive {
  font-weight: 600;
  opacity: 1;
}
```

### Stat Cards (`StatTile.tsx`)

Simple interactive cards used for displaying dashboard metrics.

**1. The Component:**

```tsx
import React from "react";
import styles from "./StatTile.module.css";

export const StatTile = ({
  label,
  value,
  color = "var(--color-primary)",
  onClick,
}: any) => {
  return (
    <div className={styles.tile} onClick={onClick}>
      <div className={styles.header}>
        <small className={styles.label} style={{ color }}>
          {label}
        </small>
      </div>
      <div className={styles.value}>{value}</div>
    </div>
  );
};
```

**2. The Styles (`StatTile.module.css`):**

```css
.tile {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.8rem;
  border-radius: 8px;
  min-width: 130px;
  cursor: pointer;
  transition: background 0.2s ease;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
}

.tile:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.1);
}

.label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.value {
  font-size: 1.5rem;
  font-weight: bold;
}
```

```

```
