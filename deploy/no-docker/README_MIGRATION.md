# ERP Inventory Nginx Site Setup

This guide converts the Docker Compose deployment into a no-Docker Ubuntu deployment using:

- Nginx on the host
- PostgreSQL on the host
- Node.js backend managed by PM2/systemd
- React/Vite frontend served from Nginx
- `/srv/pms-bench` structure from the Nginx setup document

This setup is for this repo's real backend: Node.js, Express, TypeScript, PostgreSQL, and PM2 on port `5000`.

Replace placeholders before running commands:

- `REPO_URL`
- `YOUR_SERVER_IP_OR_DOMAIN`
- `STRONG_POSTGRES_PASSWORD`
- `STRONG_APP_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

## 1. Target Structure

```text
/srv/ganacsikaal-erp/
  server/                 # original backend source
  frontend/               # original React/Vite frontend source
  deploy/no-docker/

/srv/pms-bench/
  backend -> /srv/ganacsikaal-erp/server
  frontend -> /srv/ganacsikaal-erp/frontend
  config/
    nginx.conf
    ecosystem.config.cjs
    start-api.sh
  logs/
  backups/
```

## 2. Core VPS Setup

If this repo is already on the server, you can run the prepared script:

```bash
cd /srv/ganacsikaal-erp
sudo sh deploy/no-docker/scripts/prepare-server.sh
```

On a fresh server where the repo is not cloned yet, run the commands manually first:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl build-essential ufw htop ca-certificates gnupg nginx postgresql postgresql-contrib

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo systemctl enable --now nginx
sudo systemctl enable --now postgresql

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 3. Create PostgreSQL DB and User

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
ALTER USER postgres WITH PASSWORD 'STRONG_POSTGRES_PASSWORD';
CREATE DATABASE erp_inventory;
CREATE USER ims_app WITH PASSWORD 'STRONG_APP_PASSWORD';
GRANT CONNECT ON DATABASE erp_inventory TO ims_app;
\q
```

Keep PostgreSQL private on localhost.

## 4. Create Bench and Clone Repo

```bash
sudo adduser --system --group --home /srv/pms-bench erp
sudo mkdir -p /srv/pms-bench /srv/ganacsikaal-erp
sudo chown -R erp:erp /srv/pms-bench /srv/ganacsikaal-erp

sudo -u erp git clone REPO_URL /srv/ganacsikaal-erp

cd /srv/pms-bench
sudo -u erp ln -sfn /srv/ganacsikaal-erp/server backend
sudo -u erp ln -sfn /srv/ganacsikaal-erp/frontend frontend
sudo -u erp mkdir -p config logs backups
```

## 5. Backend Production Env

Create:

```bash
sudo -u erp cp /srv/ganacsikaal-erp/deploy/no-docker/env/server.env.example /srv/pms-bench/backend/.env
sudo -u erp nano /srv/pms-bench/backend/.env
```

Content:

```env
NODE_ENV=production
PORT=5000
HOST=127.0.0.1

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

CLIENT_ORIGIN=http://YOUR_SERVER_IP_OR_DOMAIN

JWT_ACCESS_SECRET=JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=JWT_REFRESH_SECRET
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

COOKIE_NAME=rt
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UNSIGNED_PRESET=
```

Secure it:

```bash
sudo chmod 600 /srv/pms-bench/backend/.env
sudo chown erp:erp /srv/pms-bench/backend/.env
```

For HTTPS, later change:

```env
CLIENT_ORIGIN=https://YOUR_SERVER_IP_OR_DOMAIN
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

## 6. Frontend Env

```bash
sudo -u erp cp /srv/ganacsikaal-erp/deploy/no-docker/env/frontend.env.production.example /srv/pms-bench/frontend/.env.production
```

`VITE_API_URL` can stay empty for same-origin production. The frontend will use `window.location.origin`, and Nginx will proxy `/api` to the backend.

## 7. Build Backend and Frontend

```bash
cd /srv/pms-bench/backend
sudo -u erp npm ci
sudo -u erp npm run build

cd /srv/pms-bench/frontend
sudo -u erp npm ci
sudo -u erp npm run build
```

Nginx serves the frontend directly from:

```text
/srv/pms-bench/frontend/dist
```

## 8. Install Config Files

```bash
sudo cp /srv/ganacsikaal-erp/deploy/no-docker/nginx/erp-inventory.conf /srv/pms-bench/config/nginx.conf
sudo cp /srv/ganacsikaal-erp/deploy/no-docker/pm2/ecosystem.config.cjs /srv/pms-bench/config/ecosystem.config.cjs
sudo cp /srv/ganacsikaal-erp/deploy/no-docker/scripts/start-api.sh /srv/pms-bench/config/start-api.sh
sudo chmod +x /srv/pms-bench/config/start-api.sh
sudo chown -R erp:erp /srv/pms-bench/config /srv/pms-bench/logs /srv/pms-bench/backups
sudo sed -i 's/YOUR_SERVER_IP_OR_DOMAIN/your-real-domain-or-ip/g' /srv/pms-bench/config/nginx.conf
```

The same install/build/service steps can be automated after the `.env` file is ready:

```bash
cd /srv/ganacsikaal-erp
sudo DOMAIN=your-real-domain-or-ip sh deploy/no-docker/scripts/deploy-update.sh
```

If `.env` does not exist yet, `deploy-update.sh` creates it from the template and stops. Edit the secrets, then run the same command again.

## 9. Run Database Bootstrap

This project already has a Docker entrypoint that waits for PostgreSQL and applies schema/bootstrap SQL. The no-Docker migration service reuses it once.

```bash
sudo cp /srv/ganacsikaal-erp/deploy/no-docker/systemd/erp-inventory-migrate.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start erp-inventory-migrate.service
sudo journalctl -u erp-inventory-migrate.service -n 200 --no-pager
```

Expected result: the service exits successfully after schema/bootstrap work.

## 10. Start Backend with PM2

```bash
sudo -u erp pm2 start /srv/pms-bench/config/ecosystem.config.cjs --env production
sudo -u erp pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u erp --hp /srv/pms-bench
sudo systemctl enable pm2-erp
```

Health check:

```bash
curl -i http://127.0.0.1:5000/api/health
sudo -u erp pm2 status
sudo -u erp pm2 logs erp-inventory-api --lines 100
```

## 11. Link Nginx Site

```bash
sudo ln -sfn /srv/pms-bench/config/nginx.conf /etc/nginx/sites-available/pms
sudo ln -sfn /etc/nginx/sites-available/pms /etc/nginx/sites-enabled/pms
sudo rm /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
```

Final checks:

```bash
curl -I http://YOUR_SERVER_IP_OR_DOMAIN
curl -I http://YOUR_SERVER_IP_OR_DOMAIN/api/health
curl -I http://YOUR_SERVER_IP_OR_DOMAIN/ready
```

## 12. Optional SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_SERVER_IP_OR_DOMAIN --redirect
sudo certbot renew --dry-run
```

After SSL, update `.env` to use HTTPS and restart:

```bash
sudo -u erp pm2 restart erp-inventory-api --update-env
sudo systemctl reload nginx
```

## 13. Backups

```bash
sudo cp /srv/ganacsikaal-erp/deploy/no-docker/systemd/erp-inventory-db-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now erp-inventory-db-backup.timer
systemctl list-timers erp-inventory-db-backup.timer
```

Backups are written to:

```text
/srv/pms-bench/backups
```

## 14. Useful Commands

```bash
sudo -u erp pm2 status
sudo -u erp pm2 logs erp-inventory-api --lines 200
sudo journalctl -u erp-inventory-migrate.service -n 200 --no-pager
sudo tail -f /srv/pms-bench/logs/nginx-access.log /srv/pms-bench/logs/nginx-error.log
sudo tail -f /srv/pms-bench/logs/api.out.log /srv/pms-bench/logs/api.err.log
sudo -u postgres psql -d erp_inventory -c "select now();"
```

## 15. Deploy After Git Pull

```bash
cd /srv/ganacsikaal-erp
sudo -u erp git pull

cd /srv/pms-bench/backend
sudo -u erp npm ci
sudo -u erp npm run build
sudo systemctl start erp-inventory-migrate.service

cd /srv/pms-bench/frontend
sudo -u erp npm ci
sudo -u erp npm run build

sudo -u erp pm2 restart erp-inventory-api --update-env
sudo nginx -t
sudo systemctl reload nginx
```

Or use the bundled updater:

```bash
cd /srv/ganacsikaal-erp
sudo DOMAIN=your-real-domain-or-ip sh deploy/no-docker/scripts/deploy-update.sh
```

## 16. Notes

- Redis from the PDF is not included because this Node backend does not use Redis dependencies.
- `/media/` from the PDF is adapted to this repo's `/uploads/`.
- `/ready` is mapped to `/api/health`.
- The original Docker deployment files remain available if you need rollback.
