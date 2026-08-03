#!/bin/sh
set -eu

APP_USER="${APP_USER:-erp}"
REPO_DIR="${REPO_DIR:-/srv/ganacsikaal-erp}"
BENCH_DIR="${BENCH_DIR:-/srv/pms-bench}"
DOMAIN="${DOMAIN:-YOUR_SERVER_IP_OR_DOMAIN}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo DOMAIN=your-domain.com sh deploy/no-docker/scripts/deploy-update.sh"
  exit 1
fi

if [ ! -d "$REPO_DIR/server" ] || [ ! -d "$REPO_DIR/frontend" ]; then
  echo "Repo not found at $REPO_DIR. Clone it first."
  exit 1
fi

mkdir -p "$BENCH_DIR/config" "$BENCH_DIR/logs" "$BENCH_DIR/backups"
ln -sfn "$REPO_DIR/server" "$BENCH_DIR/backend"
ln -sfn "$REPO_DIR/frontend" "$BENCH_DIR/frontend"

cp "$REPO_DIR/deploy/no-docker/nginx/erp-inventory.conf" "$BENCH_DIR/config/nginx.conf"
cp "$REPO_DIR/deploy/no-docker/pm2/ecosystem.config.cjs" "$BENCH_DIR/config/ecosystem.config.cjs"
cp "$REPO_DIR/deploy/no-docker/scripts/start-api.sh" "$BENCH_DIR/config/start-api.sh"
chmod +x "$BENCH_DIR/config/start-api.sh"
sed -i "s/YOUR_SERVER_IP_OR_DOMAIN/$DOMAIN/g" "$BENCH_DIR/config/nginx.conf"

if [ ! -f "$BENCH_DIR/backend/.env" ]; then
  cp "$REPO_DIR/deploy/no-docker/env/server.env.example" "$BENCH_DIR/backend/.env"
  echo "Created $BENCH_DIR/backend/.env from template. Edit secrets before starting services."
  exit 1
fi

if [ ! -f "$BENCH_DIR/frontend/.env.production" ]; then
  cp "$REPO_DIR/deploy/no-docker/env/frontend.env.production.example" "$BENCH_DIR/frontend/.env.production"
fi

chown -R "$APP_USER:$APP_USER" "$BENCH_DIR" "$REPO_DIR"
chmod 600 "$BENCH_DIR/backend/.env"

cd "$BENCH_DIR/backend"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

cd "$BENCH_DIR/frontend"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

cp "$REPO_DIR/deploy/no-docker/systemd/erp-inventory-migrate.service" /etc/systemd/system/
cp "$REPO_DIR/deploy/no-docker/systemd/erp-inventory-db-backup.service" /etc/systemd/system/
cp "$REPO_DIR/deploy/no-docker/systemd/erp-inventory-db-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl start erp-inventory-migrate.service

if sudo -u "$APP_USER" pm2 describe erp-inventory-api >/dev/null 2>&1; then
  sudo -u "$APP_USER" pm2 restart erp-inventory-api --update-env
else
  sudo -u "$APP_USER" pm2 start "$BENCH_DIR/config/ecosystem.config.cjs" --env production
fi
sudo -u "$APP_USER" pm2 save
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$BENCH_DIR" >/dev/null
systemctl enable "pm2-$APP_USER" >/dev/null 2>&1 || true

ln -sfn "$BENCH_DIR/config/nginx.conf" /etc/nginx/sites-available/pms
ln -sfn /etc/nginx/sites-available/pms /etc/nginx/sites-enabled/pms
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

systemctl enable erp-inventory-db-backup.timer
systemctl start erp-inventory-db-backup.timer

echo "Deploy complete."
echo "Frontend: http://$DOMAIN"
echo "API health: http://$DOMAIN/api/health"
