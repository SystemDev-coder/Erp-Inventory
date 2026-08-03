#!/bin/sh
set -eu

APP_USER="${APP_USER:-erp}"
REPO_DIR="${REPO_DIR:-/srv/ganacsikaal-erp}"
BENCH_DIR="${BENCH_DIR:-/srv/pms-bench}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo sh deploy/no-docker/scripts/prepare-server.sh"
  exit 1
fi

apt update
apt upgrade -y
apt install -y git curl build-essential ufw htop ca-certificates gnupg nginx postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "$BENCH_DIR" "$APP_USER"
fi

mkdir -p "$REPO_DIR" "$BENCH_DIR/config" "$BENCH_DIR/logs" "$BENCH_DIR/backups"
chown -R "$APP_USER:$APP_USER" "$REPO_DIR" "$BENCH_DIR"

systemctl enable --now nginx
systemctl enable --now postgresql

ufw allow OpenSSH
ufw allow 'Nginx Full'

echo "Server base packages are ready."
echo "Next: clone/pull the repo into $REPO_DIR and run deploy/no-docker/scripts/deploy-update.sh"
