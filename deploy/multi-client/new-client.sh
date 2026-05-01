#!/usr/bin/env sh
set -eu

NAME="${1:-}"
DOMAIN="${2:-}"
FRONTEND_PORT="${3:-}"

if [ -z "$NAME" ] || [ -z "$DOMAIN" ] || [ -z "$FRONTEND_PORT" ]; then
  echo "Usage: $0 <clientName> <domain> <frontendPort>"
  exit 1
fi

CLIENT_DIR="$(cd "$(dirname "$0")" && pwd)/clients/$NAME"
mkdir -p "$CLIENT_DIR"

JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

SERVER_ENV_PATH="$CLIENT_DIR/server.env"
OVERRIDE_PATH="$CLIENT_DIR/docker-compose.override.yml"

cat > "$SERVER_ENV_PATH" <<EOF
# Production env for client: $NAME
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
CLIENT_ORIGIN=https://$DOMAIN

# JWT Secrets (must be 32+ chars)
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
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
EOF

cat > "$OVERRIDE_PATH" <<EOF
services:
  db:
    env_file:
      - $SERVER_ENV_PATH

  server:
    env_file:
      - $SERVER_ENV_PATH

  frontend:
    # Only listen on localhost; public access should be via the reverse proxy (NPM).
    ports:
      - "127.0.0.1:${FRONTEND_PORT}:80"
EOF

echo "Created:"
echo " - $SERVER_ENV_PATH"
echo " - $OVERRIDE_PATH"
echo ""
echo "Next:"
echo "docker compose -p $NAME -f docker-compose.prod.yml -f deploy/multi-client/clients/$NAME/docker-compose.override.yml up -d --build"

