# Multi-client hosting on one AWS server (folders + subdomains)

Goal: you host the same ERP for many clients on **one EC2**, but each client has:

- its own folder under `deploy/multi-client/clients/<clientName>`
- its own database volume (isolated)
- its own subdomain (example: `client1.madaldb.com`)

Somali: “client walbo” wuxuu yeelanayaa folder u gaar ah + database u gaar ah + subdomain u gaar ah, si marka cilad timaado aad u gasho client-kaas oo kaliya.

This is done by running a separate Docker Compose “project” per client using `-p <clientName>`.

## 1) One-time: run a reverse proxy (subdomains -> client ports)

Use Nginx Proxy Manager (GUI) so each subdomain points to a localhost port.

```bash
docker compose -f deploy/multi-client/proxy/docker-compose.yml up -d
```

Open the proxy manager UI:

- `http://<EC2_PUBLIC_IP>:81`

In AWS Security Group open:

- `80` and `443` (public)
- `81` (only your IP) or use VPN/SSM

## 2) Create a client folder

From repo root:

PowerShell:
```powershell
./deploy/multi-client/new-client.ps1 -Name "client1" -Domain "client1.madaldb.com" -FrontendPort 8081
```

If PowerShell blocks scripts on your PC, run it like:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/multi-client/new-client.ps1 -Name "client1" -Domain "client1.madaldb.com" -FrontendPort 8081
```

Bash (Linux):
```bash
./deploy/multi-client/new-client.sh client1 client1.madaldb.com 8081
```

## 3) Start that client (build + run)

```bash
docker compose -p client1 -f docker-compose.prod.yml -f deploy/multi-client/clients/client1/docker-compose.override.yml up -d --build
```

Now the client frontend is listening on `127.0.0.1:8081` on the EC2 instance.

## 4) Connect the subdomain in Nginx Proxy Manager

Create a “Proxy Host”:

- Domain: `client1.madaldb.com`
- Forward Hostname / IP: `127.0.0.1`
- Forward Port: `8081`
- Enable SSL (Let’s Encrypt) after DNS is correct

## 5) Debug / fix later

Each client has its own container names/logs because of `-p client1`:

```bash
docker compose -p client1 -f docker-compose.prod.yml -f deploy/multi-client/clients/client1/docker-compose.override.yml ps
docker compose -p client1 -f docker-compose.prod.yml -f deploy/multi-client/clients/client1/docker-compose.override.yml logs -f --tail=200
```

## Notes

- Each client gets a separate Postgres volume automatically (compose project prefix).
- Backend is not exposed publicly; only the frontend port is reachable via the reverse proxy.
- Update secrets in each client’s `server.env` file.
