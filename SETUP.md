# Developer Setup Guide (Alpha GCP Integration)

This branch introduces the Admin Panel with GCP Cloud Backend integration.

## 🔑 Crucial Step: Environment Configuration

To connect to the Production Backend, you must configure your local environment. We do **not** commit the backend IP to the repository for security details.

1.  **Duplicate the example file**:
    Copy `.env.example` to `.env.local`

    ```bash
    cp .env.example .env.local
    ```

2.  **Edit `.env.local`**:
    _(Optional: Turn-key setup is now automatic via `src/config.ts`. Only used to override defaults.)_

    ```ini
    VITE_PROD_API_URL=http://<ACTUAL_IP>:3000/api/v1
    VITE_LOCAL_API_URL=http://localhost:3001/api/v1
    ```

    > **Note**: The app is pre-configured to connect to the official Alpha Backend. You only need this if you are running your own backend instance.

## 🚀 Running the App

1.  Start the app:

    ```bash
    npm run dev
    ```

2.  **Accessing the Admin Panel**:
    - On the Login Screen (or within the app), verify the Environment Toggle.
    - Set it to **PROD** (if available) or check the console logs to ensure it's connecting to the remote IP.

## 👑 Creating Your Admin Account

If you have been given an **Invite Token**:

1.  Open the Admin Panel (Secret access or via UI).
2.  Switch to **PROD** environment (if applicable).
3.  Click "Have an invite token? Register here".
4.  Enter your username, password, and the **Token**.
5.  Login!
