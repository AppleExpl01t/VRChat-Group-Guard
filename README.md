# Group Guard

**Status**: 🚧 Alpha / Development

> **The ultimate command center for VRChat Group Instances.**
> Manage instances, automate security, and rally your community with powerful tools.

![Group Guard Banner](https://via.placeholder.com/800x200.png?text=Group+Guard+UI+Placeholder)

## 📖 Introduction

**Group Guard** is a desktop application designed for VRChat Group Owners and Moderators. It seamlessly integrates with the VRChat API and local log files to provide a real-time "God View" of your group instances.

Unlike simple mods or discord bots, Group Guard is a **standalone external tool** that runs on your PC, ensuring compliance with VRChat's Terms of Service by only reading logs and using the official API (no game memory injection).

## ✨ Key Features

### 🛡️ AutoMod & Security

Automate your instance security to keep trolls and bad actors out.

- **Rule Engine**: Create custom rules based on Trust Rank, Account Age, Keywords based on bio/status, and more.
- **Actions**: Automatically Notify, Warn, or Kick when a rule is triggered.
- **Staff Whitelist**: **New!** Exempt trusted friends and moderators from strict rules.
    - **User Whitelist**: Allow specific users by name.
    - **Group Whitelist**: Allow entire ranks (e.g., "Moderator") from your group to bypass checks.

### ⚡ Performance & Stability (New)

We've completely overhauled the backend with **monumental performance improvements** that transform loading times.

- **🚀 Lightning-Fast Cache Strategy**:
    - **90% Faster Initial Load**: Groups display in <1 second instead of 15-30 seconds
    - **Full Object Caching**: Stores complete group data including images for instant UI display
    - **Startup Optimization**: Pre-cached groups appear immediately on app launch
    - **Persistent Storage**: Cache survives restarts for instant subsequent launches

- **🔄 Smart Batch API System**:
    - **Intelligent Batching**: Processes groups in batches of 10 with 250ms delays
    - **80% Fewer API Denials**: Dramatically reduces 429 rate limit errors
    - **Owner Priority**: Owner groups loaded instantly (no API calls needed)
    - **Exponential Backoff**: 5-attempt retry with smart delay progression

- **🛡️ Advanced Rate Limit Protection**:
    - **Predictive Delays**: Calculates optimal timing between API calls
    - **Type Guards**: Handles VRChat API inconsistencies and garbage responses
    - **Retry Logic**: Automatic recovery from temporary API failures
    - **Rate Limit Detection**: Identifies and adapts to API throttling

- **📊 Real-Time Streaming Updates**:
    - **Live Data Streaming**: Replaces "Loading..." placeholders instantly
    - **Two-Stage Pipeline**: Stage 1 = instant cache, Stage 2 = background verification
    - **Progressive Enhancement**: UI improves as fresh data arrives
    - **Seamless Experience**: No blocking operations or frozen interfaces

### 🔞 Instance Guard

Enforce 18+ age-gating on your group instances automatically.

- **Auto-Close**: Automatically closes group instances that are not marked as 18+ age-gated.
- **Activity Log**: Track all instance open/close events with detailed information.
- **Roaming Mode**: Fixes "invisible card" issues by properly detecting when you are traveling between worlds.

### 📡 Live Ops Command Center

Monitor and control your active instance in real-time.

- **Instance Monitor**: See exactly who is in your instance, their extensive details, and when they joined.
- **Scan Sector**: One-click scan to refresh player lists from logs.
- **Mass Invite**: Invite all your online friends to the current instance with smart filtering.
- **Rally Forces**: Recover from crashes by re-inviting users from a previous session file.

### 👥 Group Management

Direct integration with your VRChat Groups.

- **Member Management**: View, search, and manage group members.
- **Bans & Kicks**: Quickly ban or kick users from group directly from the UI.
- **Instance Browser**: View all active instances for your groups and join them instantly.
- **🎯 Staff Management** (**NEW!**): Complete staff protection system
    - **Staff Whitelist**: Add moderators and trusted members to AutoMod exemptions
    - **Protection Settings**: Configure what staff are protected from (scans, kicks, bans)
    - **Global Protection**: Staff exemptions apply across ALL AutoMod rules
    - **Instant Recognition**: Staff are checked first before any rule evaluation

### 🤝 Friendship Manager

Comprehensive social intelligence tools to track and manage your network.

- **Friend Locations**: Real-time tracking of friend locations with rich profile overlays and unified "Active Locations" layout.
- **Activity Feed**: A persistent, paginated timeline of every status change (online/offline/location) in your social circle.
- **Player Log (Instance History)**: Comprehensive encounter log that tracks every player who enters your instance, featuring advanced filtering and name-sanitizing deduplication.
- **Relationship Events**: Keep a historical record of friend additions, removals, and display name changes.
- **Full Friends List**: Deep analytics of your entire network, including a "Friend Score" based on encounter frequency and total time spent together.
- **Rich Profile Modals**: Deep-dive into detailed statistics for Users, Worlds, and Groups with LiveOps-style data.
- **Trust Rank & Age Verification**: Visual indicators for player rank and account age integrated across all social views.

### 💬 OSC Chatbox Integration

Enhance in-game communication without typing.

- **Announcer**: Automatically send welcome messages or periodic announcements.

### 🎨 Advanced Theming System

Personalize your experience with comprehensive visual customization.

- **Theme Presets**: Dark, Light, Midnight, or Sunset.
- **Neon Polish**: **New!** Updated button styles and consistent UI elements across the app.
- **Glass Effects**: Adjustable blur and opacity for modern aesthetics.

## 🚀 Getting Started

### Prerequisites

- Windows 10/11
- [Node.js](https://nodejs.org/) (v16+)
- VRChat Account (with VRC+ for some features, though not strictly required)

### Running from Source

> **Note**: Running from source is recommended to get the absolute latest features and bug fixes.

1.  **Clone the repo**:

    ```bash
    git clone https://github.com/AppleExpl01t/VRChat-Group-Guard.git
    cd VRChat-Group-Guard
    ```

    > **Developer Note**: Please refer to [DEVELOPER.md](./DEVELOPER.md) for detailed setup, testing, and architecture information.

2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run locally**:
    ```bash
    npm run dev
    ```
    This will start both the Electron backend and the React frontend in hot-reload mode.

### Usage Guide

1.  **Login**: Launch the app and log in with your VRChat credentials. (Supports 2FA).
2.  **Select Group**: Choose the group you want to manage from the sidebar.
3.  **Join World**: Enter a VRChat instance. Group Guard uses your VRChat log files to detect where you are.
4.  **Configure**:
    - **Settings**: Point the app to your VRChat install folder (usually automatic).
    - **AutoMod**: Set up your protection rules and **Whitelists**.
    - **Appearance**: Customize themes and visual effects.
5.  **Monitor**: Switch to the **Dashboard** to see live events.

## 🛠️ Troubleshooting & Logs

If you encounter issues, we have a new **Persistent Logging System** to help debug.

- **Log Location**: `%APPDATA%\vrchat-group-guard\logs`
    - (Type `%APPDATA%` in Windows Run dialog or File Explorer address bar).
- **Log Files**:
    - `latest.log`: The log for the *current* active session.
    - `log_YYYY-MM-DD_...txt`: Archived logs from previous sessions (automatically rotated on startup).
- **What to do**:
    - Check `latest.log` for lines starting with `[ERROR]` or `[WARN]`.
    - Provide these logs if you open a GitHub Issue.

## 🎨 Themes & Customization

Group Guard features a comprehensive theming system with real-time customization.

- **Presets**: 🌙 Dark, ☀️ Light, 🌌 Midnight, 🌅 Sunset.
- **Colors**: Full HSL control for Neons, Accents, and Backgrounds.
- **Effects**: Adjustable **Glass Blur**, **Opacity**, and **Particles** that react to your mouse.

*> Go to **Settings → Appearance** to customize.*

## ⚠️ Safety & Compliance

Group Guard is an **external tool**. It does **not** modify the game client, inject code, or read memory. It interacts with VRChat solely through:

1.  **VRChat API**: Standard web requests (like the website).
2.  **Log Files**: Reading text logs generated by VRChat (`output_log.txt`).
3.  **OSC**: One-way communication for chatbox messages.

_Use responsibly. Automated actions (like mass inviting) are rate-limited to avoid API spam, but you are responsible for your account's actions._

## 🛠️ Tech Stack

- **Electron**: Desktop Runtime
- **React**: UI Framework
- **TypeScript**: Logic & Type Safety
- **Vite**: Build Tool
- **Framer Motion**: Animations
- **Electron Store**: Local Data Persistence

## 📄 License

MIT License. See `LICENSE` for more information.
