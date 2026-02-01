# Deployment Guide

## Prerequisites

- **OCI Infrastructure**: Must be provisioned (at least the Object Storage Bucket).
- **Server Access**: SSH access to your Ubuntu instance.
- **Tools**: `scp` (comes with Windows OpenSSH) or FileZilla.

## 1. Environment Configuration

You need to update your backend `.env` file for production.

### Required Variables

```env
# Server Port
PORT=3001
NODE_ENV=production

# Database (SQLite is file-based, so just a path)
DATABASE_URL="file:../data/db.sqlite"

# OCI Object Storage (For Backups)
OCI_CONFIG_PATH="./oci_config.json"
OCI_BUCKET_NAME="groupguard-data"
OCI_NAMESPACE="<your_namespace_from_terraform_output>"

# Security (Generate new secrets for prod!)
JWT_SECRET="<generate_random_string>"
```

## 2. Prepare OCI Config for Backend

The backend uses the OCI SDK, which needs a config file and the private key **on the server**.

1.  **Create `oci_config.json`** locally:
    ```json
    {
      "user": "ocid1.user.oc1...",
      "fingerprint": "xx:xx:xx...",
      "tenancy": "ocid1.tenancy.oc1...",
      "region": "us-phoenix-1",
      "key_file": "./oci_private_key.pem"
    }
    ```
2.  **Copy Files to Server**:
    You need to copy:
    - `oci_config.json`
    - Your Private Key (`.pem` file)

## 3. Build & Deploy

### A. Build Locally

```bash
cd backend
npm install
npm run build
```

This creates a `dist/` folder.

### B. Upload to Server

Target directory: `/home/ubuntu/groupguard-backend`

```powershell
# Example SCP command
scp -r dist package.json package-lock.json ubuntu@<server_ip>:/home/ubuntu/groupguard-backend
```

### C. Run on Server

SSH into the server:

```bash
ssh ubuntu@<server_ip>
```

Install dependencies and start:

```bash
cd groupguard-backend
npm install --production

# Start with PM2 (recommended for production)
sudo npm install -g pm2
pm2 start dist/index.js --name groupguard
```

## Troubleshooting Terraform

If you need to re-run Terraform and it's not in your PATH:

```powershell
& "C:\Users\frank\Documents\terraform_1.7.0_windows_amd64\terraform.exe" apply
```
