#!/bin/sh
# Provision one more client with its OWN, fully separate copy of the code
# (its own git checkout, its own node_modules, its own build), so a custom
# feature/report added for one client can NEVER show up for another client.
#
# Each client still shares this VPS's Postgres server and Nginx, but gets:
#   - its own git branch (client/<name>) checked out into its own folder
#   - its own database (erp_<name>)
#   - its own Node.js process on its own port
#   - its own uploads/ folder
#
# Usage:
#   sudo sh deploy/no-docker/scripts/new-client.sh <clientName> <subdomain> <port> [demo]
#
# Example:
#   sudo sh deploy/no-docker/scripts/new-client.sh dubaicollection dubaicollection.madalict.com 5002
#
# BEFORE running this, the branch client/<clientName> must already exist on
# GitHub (see MULTI_CLIENT.md "Creating a client branch"). This script only
# deploys a branch that already exists - it does not create branches.
#
# Prereqs: the main instance must already be deployed once via
# deploy-update.sh, so /srv/pms-bench/backend/.env exists (used only to read
# the shared ADMIN_PGPASSWORD / PGUSER / PGPASSWORD for Postgres).

set -eu

NAME="${1:-}"
DOMAIN="${2:-}"
PORT="${3:-}"
DEMO_FLAG="${4:-}"

if [ -z "$NAME" ] || [ -z "$DOMAIN" ] || [ -z "$PORT" ]; then
  echo "Usage: $0 <clientName> <subdomain> <port> [demo]"
  echo "Example: $0 dubaicollection dubaicollection.madalict.com 5002"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo sh $0 $NAME $DOMAIN $PORT"
  exit 1
fi

APP_USER="${APP_USER:-erp}"
BENCH_DIR="${BENCH_DIR:-/srv/pms-bench}"
REPO_URL="${REPO_URL:-https://github.com/SystemDev-coder/Erp-Inventory.git}"
BRANCH="client/$NAME"
MAIN_ENV="$BENCH_DIR/backend/.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$MAIN_ENV" ]; then
  echo "ERROR: $MAIN_ENV not found. Deploy the main instance first (deploy-update.sh)."
  exit 1
fi

read_main_env_var() {
  key="$1"
  grep "^${key}=" "$MAIN_ENV" | head -n1 | cut -d= -f2-
}

# The ims_app Postgres role is shared cluster-wide across every client
# database, so it must reuse the same username/password every time -
# only the database name differs per client.
ADMIN_PGPASSWORD_VALUE="$(read_main_env_var ADMIN_PGPASSWORD)"
SHARED_PGUSER="$(read_main_env_var PGUSER)"
SHARED_PGPASSWORD="$(read_main_env_var PGPASSWORD)"
if [ -z "$ADMIN_PGPASSWORD_VALUE" ] || [ -z "$SHARED_PGUSER" ] || [ -z "$SHARED_PGPASSWORD" ]; then
  echo "ERROR: Could not read ADMIN_PGPASSWORD / PGUSER / PGPASSWORD from $MAIN_ENV"
  exit 1
fi

# Cloudinary is optional - if the main instance has it configured, every
# client reuses the SAME account/credentials (simplest to manage: one
# dashboard, one free-tier quota) but gets its own CLOUDINARY_FOLDER_PREFIX
# below so their images land in their own subfolder, not mixed with other
# clients'. Leave it blank in the main .env to skip Cloudinary entirely -
# uploads then fall back to each client's own local uploads/ folder, which
# is already isolated per-client.
SHARED_CLOUDINARY_CLOUD_NAME="$(read_main_env_var CLOUDINARY_CLOUD_NAME)"
SHARED_CLOUDINARY_API_KEY="$(read_main_env_var CLOUDINARY_API_KEY)"
SHARED_CLOUDINARY_API_SECRET="$(read_main_env_var CLOUDINARY_API_SECRET)"
SHARED_CLOUDINARY_UNSIGNED_PRESET="$(read_main_env_var CLOUDINARY_UNSIGNED_PRESET)"

DB_NAME="erp_${NAME}"
CLIENT_DIR="$BENCH_DIR/clients/$NAME"
REPO_DIR="$CLIENT_DIR/repo"

RUN_DEMO_SEED=false
if [ "$DEMO_FLAG" = "demo" ]; then
  RUN_DEMO_SEED=true
fi

echo "==> Fetching branch '$BRANCH' for client '$NAME'..."
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
else
  mkdir -p "$CLIENT_DIR"
  if ! git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"; then
    echo ""
    echo "ERROR: branch '$BRANCH' does not exist on $REPO_URL yet."
    echo "Create it first (from your own machine, once per client):"
    echo "  git checkout main && git pull"
    echo "  git checkout -b $BRANCH"
    echo "  git push -u origin $BRANCH"
    echo "Then re-run this script."
    exit 1
  fi
fi

echo "==> Installing + building backend for '$NAME'..."
cd "$REPO_DIR/server"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build
mkdir -p "$REPO_DIR/server/uploads"

echo "==> Installing + building frontend for '$NAME'..."
cd "$REPO_DIR/frontend"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

ENV_FILE="$REPO_DIR/server/.env"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
HOST=127.0.0.1

PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=$DB_NAME
PGUSER=$SHARED_PGUSER
PGPASSWORD=$SHARED_PGPASSWORD
PGSCHEMA=ims
APP_RUNTIME_ROLE=ims_runtime

ADMIN_PGUSER=postgres
ADMIN_PGPASSWORD=$ADMIN_PGPASSWORD_VALUE

AUTO_RESET_ON_SCHEMA_MISMATCH=false
RUN_DEMO_SEED=$RUN_DEMO_SEED
ALLOW_NEGATIVE_STOCK=false

CLIENT_ORIGIN=https://$DOMAIN

JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

COOKIE_NAME=rt
COOKIE_SECURE=true
COOKIE_SAMESITE=none

RESET_CODE_EXPIRES_MIN=10
DEV_RETURN_RESET_CODE=false

CLOUDINARY_CLOUD_NAME=$SHARED_CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY=$SHARED_CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=$SHARED_CLOUDINARY_API_SECRET
CLOUDINARY_UNSIGNED_PRESET=$SHARED_CLOUDINARY_UNSIGNED_PRESET
CLOUDINARY_FOLDER_PREFIX=$NAME
EOF
chmod 600 "$ENV_FILE"
chown -R "$APP_USER:$APP_USER" "$CLIENT_DIR"

echo "==> Bootstrapping database '$DB_NAME' (creates DB + schema + roles if missing)..."
set -a
. "$ENV_FILE"
set +a
sh "$REPO_DIR/server/docker/entrypoint.sh" /bin/true

echo "==> Writing PM2 app config for '$NAME'..."
PM2_FILE="$CLIENT_DIR/ecosystem.config.cjs"
cat > "$PM2_FILE" <<EOF
module.exports = {
  apps: [
    {
      name: "erp-$NAME",
      cwd: "$REPO_DIR/server",
      script: "$REPO_DIR/server/dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "$PORT",
        HOST: "127.0.0.1",
        PGHOST: "127.0.0.1",
        PGPORT: "5432",
        PGDATABASE: "$DB_NAME",
        PGUSER: "$SHARED_PGUSER",
        PGPASSWORD: "$SHARED_PGPASSWORD",
        PGSCHEMA: "ims",
        APP_RUNTIME_ROLE: "ims_runtime",
        ADMIN_PGUSER: "postgres",
        ADMIN_PGPASSWORD: "$ADMIN_PGPASSWORD_VALUE",
        AUTO_RESET_ON_SCHEMA_MISMATCH: "false",
        RUN_DEMO_SEED: "false",
        ALLOW_NEGATIVE_STOCK: "false",
        CLIENT_ORIGIN: "https://$DOMAIN",
        JWT_ACCESS_SECRET: "$JWT_ACCESS_SECRET",
        JWT_REFRESH_SECRET: "$JWT_REFRESH_SECRET",
        ACCESS_TOKEN_EXPIRES_IN: "15m",
        REFRESH_TOKEN_EXPIRES_DAYS: "7",
        COOKIE_NAME: "rt",
        COOKIE_SECURE: "true",
        COOKIE_SAMESITE: "none",
        RESET_CODE_EXPIRES_MIN: "10",
        DEV_RETURN_RESET_CODE: "false"
      },
      out_file: "$BENCH_DIR/logs/$NAME.out.log",
      error_file: "$BENCH_DIR/logs/$NAME.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
      restart_delay: 3000,
      kill_timeout: 10000
    }
  ]
};
EOF
chown "$APP_USER:$APP_USER" "$PM2_FILE"

echo "==> Writing Nginx site for '$DOMAIN'..."
NGINX_CONF="/etc/nginx/sites-available/erp-$NAME"
sed \
  -e "s/__DOMAIN__/$DOMAIN/g" \
  -e "s/__PORT__/$PORT/g" \
  -e "s/__NAME__/$NAME/g" \
  "$SCRIPT_DIR/../nginx/client-template.conf" > "$NGINX_CONF"
ln -sfn "$NGINX_CONF" "/etc/nginx/sites-enabled/erp-$NAME"
nginx -t
systemctl reload nginx

echo "==> Starting PM2 process 'erp-$NAME'..."
if sudo -u "$APP_USER" pm2 describe "erp-$NAME" >/dev/null 2>&1; then
  sudo -u "$APP_USER" pm2 restart "erp-$NAME" --update-env
else
  sudo -u "$APP_USER" pm2 start "$PM2_FILE"
fi
sudo -u "$APP_USER" pm2 save

echo ""
echo "Client '$NAME' is live, running its OWN code from branch '$BRANCH'."
echo "  Code:         $REPO_DIR"
echo "  Database:     $DB_NAME"
echo "  Port:         $PORT"
echo "  URL (http):   http://$DOMAIN"
echo "  Demo seed:    $RUN_DEMO_SEED"
echo ""
echo "Next step - enable HTTPS (run once DNS for $DOMAIN points at this server):"
echo "  sudo certbot --nginx -d $DOMAIN"
echo ""
echo "To update just this client later (after pushing changes to $BRANCH):"
echo "  sudo sh deploy/no-docker/scripts/update-client.sh $NAME"
