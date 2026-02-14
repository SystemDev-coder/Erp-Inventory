# Script to fix Docker mount issues on Windows
# Run this script in PowerShell as Administrator

Write-Host "=== Docker Mount Fix Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Docker
Write-Host "Step 1: Stopping Docker Desktop..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Step 2: Clean up Docker resources
Write-Host "Step 2: Cleaning up Docker resources..." -ForegroundColor Yellow
docker system prune -a -f --volumes 2>$null
Start-Sleep -Seconds 2

# Step 3: Restart Docker Desktop
Write-Host "Step 3: Starting Docker Desktop..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Write-Host "Waiting for Docker Desktop to start (60 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Step 4: Navigate to project
Write-Host "Step 4: Starting containers..." -ForegroundColor Yellow
Set-Location "F:\allprogramingdataa\baarbe\Erp-Inventory"

# Step 5: Start containers
docker-compose up -d

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Check status with: docker-compose ps" -ForegroundColor Cyan
