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

We've completely overhauled the backend to be faster, smarter, and safer.

- **2-Stage "Lightning" Loading**:
    - **Stage 1 (Instant)**: Loads cached groups immediately on startup so you can interact instantly.
    - **Stage 2 (Background)**: Verifies permissions silently in the background.
- **Tortoise Mode (Rate Limit Protection)**:
    - Smart serial queue that processes group updates one-by-one to respect VRChat's strict API limits.
    - No more 429 Too Many Requests errors during large scans.
- **Predictive Caching**:
    - Quietly fetches and caches moderation permissions for your groups while the app is idle.
    - Result: Clicking a group feels instant because the data is already there.
- **Strict Cache Isolation**:
    - **Security:** Ensures cached data from one account is *never* shown to another.
    - Automatically wipes local cache on logout or forced account switch.

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
- **Bans & Kicks**: Quickly ban or kick users from the group directly from the UI.
- **Instance Browser**: View all active instances for your groups and join them instantly.

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


## 🛠️ Tech Stack

- **Electron**: Desktop Runtime
- **React**: UI Framework
- **TypeScript**: Logic & Type Safety
- **Vite**: Build Tool
- **Framer Motion**: Animations
- **Electron Store**: Local Data Persistence

## 📄 License

MIT License. See `LICENSE` for more information.
