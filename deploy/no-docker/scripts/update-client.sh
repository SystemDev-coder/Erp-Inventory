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
set +a
sh "$REPO_DIR/server/docker/entrypoint.sh" /bin/true

sudo -u "$APP_USER" pm2 restart "erp-$NAME" --update-env
sudo -u "$APP_USER" pm2 save

echo ""
echo "Client '$NAME' updated to the latest commit on '$BRANCH'."
echo "Other clients were not touched."
