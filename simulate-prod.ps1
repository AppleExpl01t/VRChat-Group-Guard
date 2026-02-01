# simulate-prod.ps1
# Simulates the Production Environment locally
# Use this to verify functionality BEFORE pushing to GCP.

Write-Host "🎭 Starting Production Simulation..." -ForegroundColor Cyan

# 1. Build the project (Simulate Build Step)
Write-Host "🏗️  Building Backend..." -ForegroundColor Yellow
Set-Location cloud-backend
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
}
catch {
    Write-Host "❌ Build Failed!" -ForegroundColor Red
    exit 1
}

# 2. Set Environment Variables (Simulate Prod Config)
# We use 'production' NODE_ENV to trigger helmet/rate-limit/trust-proxy
$env:NODE_ENV = "production"
$env:PORT = "3001"
$env:ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:3001,http://localhost:3000,http://127.0.0.1:5173" 

# 3. Warning about Database
Write-Host "⚠️  WARNING: Running against LOCAL Database (groupguard.db)" -ForegroundColor Magenta
Write-Host "    This does NOT use the Cloud SQL/Prod DB."
Write-Host "    This tests code logic, build integrity, and security headers."

# 4. Start the App (Simulate Runtime)
Write-Host "🚀 Starting in PRODUCTION Mode..." -ForegroundColor Green
Write-Host "    (Press Ctrl+C to stop)"
Write-Host ""

npm start
