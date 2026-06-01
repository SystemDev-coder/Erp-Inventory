# ERP Inventory No-Docker Migration Guide

This guide migrates the current Docker Compose deployment to Ubuntu 24.04 with Nginx, PM2, systemd, and PostgreSQL installed directly on the server.

Replace these placeholders before running commands:

- `YOUR_DOMAIN`: production domain, for example `erp.example.com`
- `REPO_URL`: Git remote URL
- `STRONG_POSTGRES_PASSWORD`, `STRONG_APP_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: production secrets

## 1. Current Docker Inventory

Services discovered from `docker-compose.yml`, `docker-compose.prod.yml`, and `docker-compose.aws.yml`:

| Service | Runtime | Docker ports | No-Docker target |
| --- | --- | --- | --- |
| `db` | `postgres:16-alpine` | prod `5433:5432`, AWS private | Local PostgreSQL 16 on `127.0.0.1:5432` |
| `server` | Node 20, Express, TypeScript | `5000:5000` or private | PM2 process on `127.0.0.1:5000` |
| `frontend` | Vite React build served by Nginx | `5173:80` or `80:80` | Static files under `/var/www/erp-inventory/frontend/current` |

Environment variables used by the backend:

```env
NODE_ENV=production
PORT=5000
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=erp_inventory
PGUSER=ims_app
PGPASSWORD=STRONG_APP_PASSWORD
PGSCHEMA=ims
APP_RUNTIME_ROLE=ims_runtime
ADMIN_PGUSER=postgres
ADMIN_PGPASSWORD=STRONG_POSTGRES_PASSWORD
AUTO_RESET_ON_SCHEMA_MISMATCH=false
RUN_DEMO_SEED=false
CLIENT_ORIGIN=https://YOUR_DOMAIN
JWT_ACCESS_SECRET=JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=JWT_REFRESH_SECRET
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
COOKIE_NAME=rt
COOKIE_SECURE=true
COOKIE_SAMESITE=none
RESET_CODE_EXPIRES_MIN=10
DEV_RETURN_RESET_CODE=false
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UNSIGNED_PRESET=
```

Persistent Docker volumes to migrate:

- `pgdata` maps to native PostgreSQL data managed by `postgresql.service`.
- `server_uploads` maps to `/var/lib/erp-inventory/uploads`.

Important dependency behavior:

- Docker backend entrypoint waits for PostgreSQL, creates the database/schema, applies `server/sql/Full_complete_scheme.sql`, applies other SQL files in sorted order, seeds core roles/permissions, grants runtime roles, then starts `node dist/server.js`.
- In this migration, systemd runs that same entrypoint as a one-shot migration service with `/bin/true`, then PM2 starts the API.

## 2. Production Folder Structure

```text
/opt/erp-inventory/
  repo/                         # Git checkout
  releases/current -> repo      # Stable path used by PM2/systemd
/var/www/erp-inventory/
  frontend/current/             # Built React/Vite assets
/var/lib/erp-inventory/
  uploads/                      # Backend upload persistence
/etc/erp-inventory/
  server.env                    # Production backend env vars, mode 600
/var/log/erp-inventory/
  api.out.log
  api.err.log
/var/backups/erp-inventory/
  *.dump                        # Nightly pg_dump backups
```

## 3. Install Packages

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib git curl build-essential ufw fail2ban certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node --version
npm --version
pm2 --version
psql --version
```

## 4. Create Linux User and Directories

```bash
sudo adduser --system --group --home /opt/erp-inventory erp
sudo mkdir -p /opt/erp-inventory /var/www/erp-inventory/frontend /var/lib/erp-inventory/uploads /etc/erp-inventory /var/log/erp-inventory /var/backups/erp-inventory
sudo chown -R erp:erp /opt/erp-inventory /var/www/erp-inventory /var/lib/erp-inventory /var/log/erp-inventory
sudo chmod 750 /etc/erp-inventory
```

## 5. Prepare PostgreSQL

```bash
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

Run inside `psql`:

```sql
ALTER USER postgres WITH PASSWORD 'STRONG_POSTGRES_PASSWORD';
CREATE DATABASE erp_inventory;
CREATE USER ims_app WITH PASSWORD 'STRONG_APP_PASSWORD';
GRANT CONNECT ON DATABASE erp_inventory TO ims_app;
\q
```

Keep PostgreSQL private. Confirm `listen_addresses` is localhost or default:

```bash
sudo grep -n "listen_addresses" /etc/postgresql/*/main/postgresql.conf
sudo systemctl restart postgresql
```

## 6. Deploy Code and Build

```bash
sudo -u erp git clone REPO_URL /opt/erp-inventory/repo
sudo -u erp ln -sfn /opt/erp-inventory/repo /opt/erp-inventory/releases/current
sudo -u erp ln -sfn /var/lib/erp-inventory/uploads /opt/erp-inventory/releases/current/server/uploads
sudo chmod +x /opt/erp-inventory/releases/current/deploy/no-docker/scripts/start-api.sh

cd /opt/erp-inventory/releases/current/server
sudo -u erp npm ci
sudo -u erp npm run build

cd /opt/erp-inventory/releases/current/frontend
sudo -u erp npm ci
sudo -u erp npm run build
sudo -u erp rsync -a --delete dist/ /var/www/erp-inventory/frontend/current/
```

If the frontend needs a production API URL at build time, create `frontend/.env.production` before `npm run build`. This app already proxies `/api/` through Nginx, so same-origin API calls are preferred.

## 7. Configure Backend Environment

```bash
sudo tee /etc/erp-inventory/server.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=5000
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=erp_inventory
PGUSER=ims_app
PGPASSWORD=STRONG_APP_PASSWORD
PGSCHEMA=ims
APP_RUNTIME_ROLE=ims_runtime
ADMIN_PGUSER=postgres
ADMIN_PGPASSWORD=STRONG_POSTGRES_PASSWORD
AUTO_RESET_ON_SCHEMA_MISMATCH=false
RUN_DEMO_SEED=false
CLIENT_ORIGIN=https://YOUR_DOMAIN
JWT_ACCESS_SECRET=replace-with-32-plus-random-chars
JWT_REFRESH_SECRET=replace-with-32-plus-random-chars
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
COOKIE_NAME=rt
COOKIE_SECURE=true
COOKIE_SAMESITE=none
RESET_CODE_EXPIRES_MIN=10
DEV_RETURN_RESET_CODE=false
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UNSIGNED_PRESET=
EOF
sudo chmod 600 /etc/erp-inventory/server.env
sudo chown erp:erp /etc/erp-inventory/server.env
```

## 8. Run Database Migration/Bootstrap

Install the supplied systemd unit:

```bash
sudo cp /opt/erp-inventory/releases/current/deploy/no-docker/systemd/erp-inventory-migrate.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start erp-inventory-migrate.service
sudo journalctl -u erp-inventory-migrate.service -n 200 --no-pager
```

Expected result: the service exits successfully after applying schema, migrations, permissions, and role grants.

## 9. Start API with PM2

```bash
sudo cp /opt/erp-inventory/releases/current/deploy/no-docker/pm2/ecosystem.config.cjs /opt/erp-inventory/ecosystem.config.cjs
sudo chown erp:erp /opt/erp-inventory/ecosystem.config.cjs
sudo -u erp pm2 start /opt/erp-inventory/ecosystem.config.cjs --env production
sudo -u erp pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u erp --hp /opt/erp-inventory
sudo systemctl enable pm2-erp
```

Health check:

```bash
curl -i http://127.0.0.1:5000/api/health
sudo -u erp pm2 status
sudo -u erp pm2 logs erp-inventory-api --lines 100
```

## 10. Configure Nginx

```bash
sudo cp /opt/erp-inventory/releases/current/deploy/no-docker/nginx/erp-inventory.conf /etc/nginx/sites-available/erp-inventory
sudo sed -i 's/YOUR_DOMAIN/your-real-domain.com/g' /etc/nginx/sites-available/erp-inventory
sudo ln -sfn /etc/nginx/sites-available/erp-inventory /etc/nginx/sites-enabled/erp-inventory
sudo nginx -t
sudo systemctl reload nginx
```

Before SSL, verify DNS points to this server:

```bash
curl -I http://YOUR_DOMAIN
curl -I http://YOUR_DOMAIN/api/health
```

## 11. Enable SSL with Let's Encrypt

```bash
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN --redirect --hsts --staple-ocsp
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

After SSL, update `/etc/erp-inventory/server.env` if needed:

```env
CLIENT_ORIGIN=https://YOUR_DOMAIN
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

Restart API:

```bash
sudo -u erp pm2 restart erp-inventory-api --update-env
```

## 12. Automatic Startup After Reboot

Enable services:

```bash
sudo systemctl enable nginx
sudo systemctl enable postgresql
sudo systemctl enable pm2-erp
sudo systemctl enable erp-inventory-migrate.service
```

Recommended boot order:

1. PostgreSQL starts.
2. `erp-inventory-migrate.service` runs idempotent DB bootstrap.
3. PM2 starts `erp-inventory-api`.
4. Nginx serves frontend and proxies `/api` and `/uploads`.

## 13. Logging, Monitoring, and Backups

Install nightly database backup timer:

```bash
sudo cp /opt/erp-inventory/releases/current/deploy/no-docker/systemd/erp-inventory-db-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now erp-inventory-db-backup.timer
systemctl list-timers erp-inventory-db-backup.timer
```

Useful commands:

```bash
sudo -u erp pm2 monit
sudo -u erp pm2 status
sudo -u erp pm2 logs erp-inventory-api --lines 200
sudo journalctl -u erp-inventory-migrate.service -n 200 --no-pager
sudo tail -f /var/log/nginx/erp-inventory.access.log /var/log/nginx/erp-inventory.error.log
sudo tail -f /var/log/erp-inventory/api.out.log /var/log/erp-inventory/api.err.log
sudo -u postgres psql -d erp_inventory -c "select now();"
```

Add logrotate:

```bash
sudo tee /etc/logrotate.d/erp-inventory >/dev/null <<'EOF'
/var/log/erp-inventory/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
EOF
```

## 14. Security Hardening

- Open only `22`, `80`, and `443` in the cloud firewall/security group.
- Restrict SSH to your IP where possible; disable password SSH login after key access is verified.
- Keep PostgreSQL bound to localhost; never expose `5432` publicly.
- Use unique production JWT secrets and database passwords.
- Keep `/etc/erp-inventory/server.env` owned by `erp:erp` with mode `600`.
- Set `DEV_RETURN_RESET_CODE=false` in production.
- Use `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` for HTTPS deployments.
- Enable UFW:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

- Enable fail2ban:

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

- Keep packages updated:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

## 15. Migration Plan

1. Lower DNS TTL to 300 seconds at least one hour before cutover.
2. Take Docker backup on old host:

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres -Fc erp_inventory > erp_inventory-precutover.dump
docker compose -f docker-compose.prod.yml cp server:/app/uploads ./server_uploads_backup
```

3. Provision Ubuntu 24.04 server and install packages.
4. Clone repo and create `/etc/erp-inventory/server.env`.
5. Restore database if migrating real data:

```bash
sudo -u postgres pg_restore --clean --if-exists --no-owner --no-privileges -d erp_inventory erp_inventory-precutover.dump
```

6. Copy uploads:

```bash
sudo rsync -a server_uploads_backup/ /var/lib/erp-inventory/uploads/
sudo chown -R erp:erp /var/lib/erp-inventory/uploads
```

7. Build backend and frontend.
8. Run `erp-inventory-migrate.service`.
9. Start PM2 API.
10. Enable Nginx and test HTTP.
11. Issue Let's Encrypt certificate.
12. Point DNS to the new server.
13. Watch logs and validate login, dashboard, uploads, imports, and key inventory workflows.

## 16. Rollback Procedure

Keep the Docker deployment running until the new deployment passes verification.

Rollback if health checks, login, or critical workflows fail:

1. Change DNS A record back to the old Docker server.
2. If DNS was already cut over, temporarily show maintenance on Nginx:

```bash
sudo systemctl stop nginx
```

3. Stop the new API:

```bash
sudo -u erp pm2 stop erp-inventory-api
```

4. Keep the new database untouched for investigation.
5. Resume old Docker stack if it was paused:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.aws.yml up -d
```

6. Compare logs and database dumps before attempting a second cutover.

## 17. Troubleshooting

API health fails:

```bash
sudo -u erp pm2 logs erp-inventory-api --lines 200
curl -v http://127.0.0.1:5000/api/health
```

Database auth fails:

```bash
sudo -u postgres psql -d erp_inventory -c "\du"
sudo -u postgres psql -d erp_inventory -c "alter user ims_app with password 'STRONG_APP_PASSWORD';"
sudo systemctl start erp-inventory-migrate.service
```

Nginx returns 502:

```bash
sudo -u erp pm2 status
sudo ss -ltnp | grep 5000
sudo nginx -t
sudo tail -n 100 /var/log/nginx/erp-inventory.error.log
```

Frontend shows blank page:

```bash
ls -la /var/www/erp-inventory/frontend/current
sudo tail -n 100 /var/log/nginx/erp-inventory.error.log
```

SSL fails:

```bash
dig +short YOUR_DOMAIN
sudo certbot certificates
sudo certbot renew --dry-run
```
