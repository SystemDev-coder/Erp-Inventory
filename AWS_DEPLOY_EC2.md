# AWS Deploy (EC2 + Docker Compose)

This repo already includes Docker Compose files for production.

## 1) Create EC2 + Security Group

- Inbound rules:
  - `22` (SSH) from **your IP**
  - `80` (HTTP) from `0.0.0.0/0`
  - (optional) `443` (HTTPS) from `0.0.0.0/0`

## 2) Install Docker on the server

### Ubuntu 22.04/24.04

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Docker Compose v2 is included with recent Docker installs. Verify:

```bash
docker --version
docker compose version
```

## 3) Deploy

```bash
git clone <your-repo-url>
cd Erp-Inventory
docker compose -f docker-compose.prod.yml -f docker-compose.aws.yml up -d --build
```

Open:

- `http://<EC2_PUBLIC_IP>/`

On first start, the backend container applies the SQL schema from `server/sql` automatically (idempotent).

Uploads (logo/banner/product images) are stored under `/app/uploads` in the backend container and persisted via the `server_uploads` Docker volume.

## Multi-client (freelancer setup)

If you want to host multiple clients on one EC2 (each with its own folder + subdomain), use:

- `deploy/multi-client/README.md`

## 4) Required env changes (production)

Edit `server/.env.docker` before deploying:

- Change `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (32+ chars)
- Set `CLIENT_ORIGIN` to your site origin, e.g. `http://<EC2_PUBLIC_IP>` or `https://yourdomain.com`
- If using HTTPS: set `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`
- (optional) Use **S3** for logo/banner uploads instead of local disk:
  - Set `S3_BUCKET` and `S3_REGION`
  - (recommended) Set `S3_PUBLIC_BASE_URL` to your CloudFront domain (or leave empty to use the direct S3 URL)
  - (optional) Set `S3_KEY_PREFIX` (default: `erp-inventory`)

Note: your bucket must allow reading the uploaded objects (via CloudFront or bucket policy). If the files are private, the app will need signed URLs (not enabled by default).

## 5) Operations

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=200
docker compose -f docker-compose.prod.yml down
```

## pgAdmin / Database access (safe)

If your pgAdmin is currently reachable from the internet, do this first:

- Remove the inbound rule for the pgAdmin port (commonly `5050` or `80/81`) from the EC2 Security Group (or restrict it to your IP only).
- Make sure Postgres is not exposed publicly (don’t open `5432` on the Security Group).
- Rotate DB passwords in the client `server.env` (or `server/.env.docker` if single instance).

### Option A (recommended): use `psql` inside the DB container

Single instance:

```bash
docker compose -f docker-compose.prod.yml exec -it db psql -U postgres -d erp_inventory
```

Multi-client example (client1):

```bash
docker compose -p client1 -f docker-compose.prod.yml -f deploy/multi-client/clients/client1/docker-compose.override.yml exec -it db psql -U postgres -d erp_inventory
```

### Option B: keep pgAdmin private + SSH tunnel

- Bind pgAdmin to localhost only on EC2 (example `127.0.0.1:5050:80`).
- From your PC, SSH tunnel: `ssh -L 5050:127.0.0.1:5050 ubuntu@<EC2_PUBLIC_IP>` then open `http://127.0.0.1:5050`.
