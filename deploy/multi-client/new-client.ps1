param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]*$')]
  [string]$Name,

  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1024, 65535)]
  [int]$FrontendPort
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-RandomBase64([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer)
}

$clientDir = Join-Path $PSScriptRoot "clients\$Name"
New-Item -ItemType Directory -Force -Path $clientDir | Out-Null

$jwtAccess = New-RandomBase64 48
$jwtRefresh = New-RandomBase64 48

$serverEnvPath = Join-Path $clientDir "server.env"
$overridePath = Join-Path $clientDir "docker-compose.override.yml"

@"
# Production env for client: $Name
NODE_ENV=production
PORT=5000

# PostgreSQL (container)
PGHOST=db
PGPORT=5432
PGDATABASE=erp_inventory
PGUSER=ims_app
PGPASSWORD=CHANGE_ME_DB_PASSWORD
PGSCHEMA=ims
AUTO_RESET_ON_SCHEMA_MISMATCH=false
RUN_DEMO_SEED=false

# Admin database user for migrations / bootstrap
ADMIN_PGUSER=postgres
ADMIN_PGPASSWORD=CHANGE_ME_ADMIN_DB_PASSWORD

# Values used by postgres container
POSTGRES_DB=erp_inventory
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME_ADMIN_DB_PASSWORD

# Frontend URL (CORS)
CLIENT_ORIGIN=https://$Domain

# JWT Secrets (must be 32+ chars)
JWT_ACCESS_SECRET=$jwtAccess
JWT_REFRESH_SECRET=$jwtRefresh
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

# Cookie Configuration (HTTPS)
COOKIE_NAME=rt
COOKIE_SECURE=true
COOKIE_SAMESITE=none

# Password Reset
RESET_CODE_EXPIRES_MIN=10
DEV_RETURN_RESET_CODE=false

# Cloudinary Configuration (optional)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UNSIGNED_PRESET=
"@ | Set-Content -Encoding UTF8 $serverEnvPath

@"
services:
  db:
    env_file:
      - $serverEnvPath

  server:
    env_file:
      - $serverEnvPath

  frontend:
    # Only listen on localhost; public access should be via the reverse proxy (NPM).
    ports:
      - "127.0.0.1:${FrontendPort}:80"
"@ | Set-Content -Encoding UTF8 $overridePath

Write-Host "Created:" -ForegroundColor Green
Write-Host " - $serverEnvPath"
Write-Host " - $overridePath"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "docker compose -p $Name -f docker-compose.prod.yml -f deploy/multi-client/clients/$Name/docker-compose.override.yml up -d --build"

