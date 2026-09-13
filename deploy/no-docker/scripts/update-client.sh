#!/bin/sh
# Redeploy ONE client after you pushed new commits to their branch
# (client/<name>) - e.g. after merging a core fix into their branch, or
# after committing a feature/report that only they should have.
#
# This only touches that one client's own folder, database connection, and
# PM2 process - every other client is completely unaffected.
#
# Usage:
#   sudo sh deploy/no-docker/scripts/update-client.sh <clientName>

set -eu

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Usage: $0 <clientName>"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo sh $0 $NAME"
  exit 1
fi

APP_USER="${APP_USER:-erp}"
BENCH_DIR="${BENCH_DIR:-/srv/pms-bench}"
CLIENT_DIR="$BENCH_DIR/clients/$NAME"
REPO_DIR="$CLIENT_DIR/repo"
BRANCH="client/$NAME"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: $REPO_DIR does not exist. Run new-client.sh first to provision '$NAME'."
  exit 1
fi

echo "==> Pulling latest '$BRANCH' for client '$NAME'..."
git -C "$REPO_DIR" fetch origin "$BRANCH"
git -C "$REPO_DIR" checkout "$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
chown -R "$APP_USER:$APP_USER" "$CLIENT_DIR"

echo "==> Rebuilding backend..."
cd "$REPO_DIR/server"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

echo "==> Rebuilding frontend..."
cd "$REPO_DIR/frontend"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

echo "==> Re-applying database schema (safe/idempotent) and restarting..."
set -a
. "$REPO_DIR/server/.env"
MIGRATIONS_DIR="$REPO_DIR/server/sql"
set +a
sh "$REPO_DIR/server/docker/entrypoint.sh" /bin/true

# `pm2 restart` on a missing process only prints a warning and still exits 0, so the
# deploy would look successful while the old build kept serving. Start it instead.
PM2_FILE="$CLIENT_DIR/ecosystem.config.cjs"
if sudo -u "$APP_USER" pm2 describe "erp-$NAME" >/dev/null 2>&1; then
  sudo -u "$APP_USER" pm2 restart "erp-$NAME" --update-env
elif [ -f "$PM2_FILE" ]; then
  echo "PM2 process 'erp-$NAME' was not running; starting it from $PM2_FILE"
  sudo -u "$APP_USER" pm2 start "$PM2_FILE"
else
  echo "ERROR: PM2 process 'erp-$NAME' is not running and $PM2_FILE is missing."
  echo "Run new-client.sh to provision '$NAME' before updating it."
  exit 1
fi
sudo -u "$APP_USER" pm2 save

echo "==> Verifying '$NAME' is online..."
sudo -u "$APP_USER" pm2 describe "erp-$NAME" | grep -E "status|script path" || true

echo ""
echo "Client '$NAME' updated to the latest commit on '$BRANCH'."
echo "Other clients were not touched."
