# Security & Setup Instructions

Follow these steps faithfully to secure your deployment pipeline.

## 1. SSH Key Generation (Recommended)

**Yes, you should use a new key.** Using your personal key is a security risk because:

1.  **Separation Setup**: If the CI/CD key leaks, you can revoke it without losing your own access.
2.  **Passphrases**: Your personal key _should_ have a passphrase (which CI/CD cannot use).
3.  **Co-Dev Access**: If the key file exists in this project folder, your co-developer might access it. A generated key stays only in GitHub Secrets.

Run this command in your local terminal:

```bash
ssh-keygen -t ed25519 -C "github-action-deploy" -f github_deploy_key -N ""
```

## 2. Server Configuration

nano ~/group-guard-backend/.env

```

Paste your production environment variables here. Save and exit.

## 3. GitHub Repository Secrets

Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.

Add the following 3 secrets:

| Name              | Value                                    | Description                                                                  |
| :---------------- | :--------------------------------------- | :--------------------------------------------------------------------------- |
| `SERVER_IP`       | `35.212.148.66` (Verify this is current) | Your Google Cloud Instance External IP.                                      |
| `SERVER_USER`     | `ubuntu`                                 | The linux username (Found in your `deploy-gcp.ps1`).                         |
| `SSH_PRIVATE_KEY` | Content of `github_deploy_key`           | **Copy the entire content** of the NEW private key file generated in Step 1. |

## 4. Branch Protection (Manual Agreement)
**Note:** Strict "Branch Protection" (preventing direct pushes) requires a paid GitHub Team plan for private repositories.

Since you are on the free plan, you must rely on a **process** with your co-developer:

1.  **Rule**: "Nobody pushes directly to `main`."
2.  **Process**:
    *   Co-developer works on a new branch (e.g., `feature/login`).
    *   They open a **Pull Request** to merge into `main`.
    *   **You** review the code on GitHub.
    *   **Be careful:** Check `.github/workflows/deploy.yml` and `cloud-backend/deploy.sh` specifically.
    *   If safe, **You** click Merge.

**Protection:** Since the deployment is now **Manual Only** (button press), bad code won't go live automatically. You have the final control. Just double-check the commits before you hit "Run".

## 5. Deployment

Once set up, you can deploy by:

1. Pushing a commit to the `main` branch.
2. OR Manually triggering the workflow from the **Actions** tab in GitHub.
```
