# Hosting many clients on one VPS - each with fully separate code

Goal: sell/host this same ERP to many separate businesses (clients), each on
their own subdomain (`demomadal.madalict.com`, `dubaicollection.madalict.com`, ...),
where:

- each client's **data** is fully isolated (separate database), and
- each client's **code** is fully isolated too - if you add a custom report
  or feature for one client, no other client ever gets it, sees it, or is
  put at risk by it.

That second requirement means clients cannot share one build/deploy of the
code - each one needs its **own git branch**, checked out into its **own
folder** on the VPS, built independently.

## How it works

One VPS runs:

- **One PostgreSQL server**, with a **separate database per client** (`erp_demomadal`, `erp_dubaicollection`, ...). Databases are fully isolated from each other on Postgres even on the same server.
- **One full git checkout per client**, each on its own branch (`client/demomadal`, `client/dubaicollection`, ...), each `npm install`-ed and built independently (`/srv/pms-bench/clients/<name>/repo/`). Editing one client's branch can never affect another client's files.
- **One Node.js process per client** (PM2), each on its own port, each running from its own checkout, pointed at its own database.
- **One Nginx site per client subdomain**, serving that client's own frontend build and proxying to that client's own backend port.

```
main                        <- the core product, all shared improvements land here
 ├── client/demomadal        <- demomadal's own branch (starts as a copy of main)
 ├── client/dubaicollection  <- dubaicollection's own branch
 └── client/janocollection   <- janocollection's own branch
```

A commit made only on `client/dubaicollection` (e.g. a custom report) only
ever exists on that branch, in that client's own checked-out folder, in
that client's own running process. `client/janocollection` never sees it,
never builds it, never runs it.

## VPS size (VPSdime or similar)

Because every client now has its own `node_modules` + build (not shared),
storage needs are higher than a shared-code setup:

| Clients | RAM | vCPU | Storage (NVMe) |
|---|---|---|---|
| Up to 5 | 4 GB | 2 | 100-120 GB |
| Up to 10 | 8 GB | 4 | 180-220 GB |

Rough numbers per client: ~250-400 MB for backend `node_modules` + build,
~150-250 MB for frontend `node_modules` (only needed during `npm run build`,
can be pruned after) + ~5-15 MB for the built `dist`, plus their database
(10-15 GB/year is a safe planning number for a small business). RAM per
client Node process is the same as before (~100-150 MB idle) regardless of
separate vs shared code, so RAM guidance barely changes; storage is what
grows. Start on the 8 GB / 180-220 GB plan if you expect 10 clients this
month.

## Images (Cloudinary) across clients

Cloudinary has no concept of "clients" - folder layout is just whatever
string the app passes as `folder` on each upload. To avoid every client's
logos/product photos landing in the exact same shared folder, set
`CLOUDINARY_FOLDER_PREFIX` per client (already done automatically by
`new-client.sh`, using the client's name).

- **One shared Cloudinary account for every client (recommended).** Set
  `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` once in
  the main `/srv/pms-bench/backend/.env`. `new-client.sh` copies those same
  credentials into each new client's `.env` and also writes
  `CLOUDINARY_FOLDER_PREFIX=<clientName>`, so `dubaicollection`'s images
  upload to `erp-inventory/dubaicollection/products/...` while
  `janocollection`'s go to `erp-inventory/janocollection/products/...` -
  same account, same billing/quota, cleanly separated folders. This needs no
  per-client setup work beyond the one-time main account.
- **A separate Cloudinary account per client** is also possible (put that
  client's own credentials in their `.env` instead) if a client specifically
  wants their own billing/quota - but then you're managing N accounts
  instead of one. Only do this if a client asks for it.
- Leaving `CLOUDINARY_CLOUD_NAME` blank in the main `.env` is fine too -
  every client just falls back to storing uploads on their own local disk
  (`clients/<name>/repo/server/uploads/`), which is already per-client
  isolated since each client has its own folder.

## Domain setup (one-time) - unchanged

Same as before: add one wildcard DNS record so you never touch DNS again
per client:

```
*.madalict.com  ->  <VPS_PUBLIC_IP>
```

Then either run `certbot --nginx -d <subdomain>` once per client, or get a
wildcard cert up front if your DNS provider supports DNS-01 (e.g.
Cloudflare).

## One-time setup

1. Follow `deploy/no-docker/README_MIGRATION.md` once to prepare the bare
   VPS (Postgres, Nginx, Node, PM2, the `erp` system user, the `ims_app`
   Postgres role) and do one normal `main`-branch deploy via
   `deploy-update.sh`. This is what creates `/srv/pms-bench/backend/.env`,
   which `new-client.sh` reads the shared Postgres admin password from -
   it does not need to keep serving traffic itself; you can even treat it
   as your own internal "master" copy of the app.
2. Push this repo to GitHub if you haven't already (it already has a
   remote: `https://github.com/SystemDev-coder/Erp-Inventory.git`).

## Creating a client branch (do this once per new client, from your own PC)

```bash
git checkout main
git pull
git checkout -b client/dubaicollection
git push -u origin client/dubaicollection
```

That branch starts as an exact copy of `main`. You do not need to add
anything to it yet if the client doesn't need custom code - it can stay
identical to `main` and still be fully isolated.

## Deploying that client on the VPS

```bash
sudo sh deploy/no-docker/scripts/new-client.sh dubaicollection dubaicollection.madalict.com 5002
```

Use a fresh port per client (5001, 5002, 5003, ...). Add `demo` as a 4th
argument to seed demo data (good for a "try it" instance like
`demomadal.madalict.com`):

```bash
sudo sh deploy/no-docker/scripts/new-client.sh demomadal demomadal.madalict.com 5001 demo
```

The script clones `client/<name>` into its own folder, builds backend +
frontend, creates the client's own database, writes the client's own Nginx
site + PM2 process, and starts it. It will refuse to run if the branch
doesn't exist yet on GitHub (create it first, see above).

Then, once DNS for the subdomain is confirmed pointing at the VPS:

```bash
sudo certbot --nginx -d dubaicollection.madalict.com
```

## Adding a feature that ONLY one client should get

```bash
git checkout client/dubaicollection
git pull
# ... make the change (new report, custom field, whatever they asked for) ...
git add -A
git commit -m "Add custom sales-by-region report for Dubai Collection"
git push
```

Then redeploy just that client:

```bash
sudo sh deploy/no-docker/scripts/update-client.sh dubaicollection
```

No other client's folder, process, or database is touched. `janocollection`
will never see this report.

## Pushing a core fix/improvement to EVERY client

Do the fix on `main` as usual, then merge it into each client branch and
redeploy each one:

```bash
git checkout main
# ... fix/feature that everyone should get ...
git commit -m "Fix stock valuation rounding"
git push

for name in demomadal dubaicollection janocollection; do
  git checkout "client/$name"
  git pull
  git merge main -m "Merge core update"
  git push
done
```

Then on the VPS:

```bash
for name in demomadal dubaicollection janocollection; do
  sudo sh deploy/no-docker/scripts/update-client.sh "$name"
done
```

If a client branch has diverged a lot (lots of custom code), `git merge
main` may produce conflicts to resolve by hand on that branch before
pushing - normal Git conflict resolution, scoped to that one client's
branch only.

## Removing a client

```bash
sudo -u erp pm2 delete erp-<name>
sudo -u erp pm2 save
sudo rm /etc/nginx/sites-enabled/erp-<name> /etc/nginx/sites-available/erp-<name>
sudo systemctl reload nginx
sudo -u postgres dropdb erp_<name>          # irreversible - back up first if unsure
sudo rm -rf /srv/pms-bench/clients/<name>
```

## Backups

Back up each client's database independently, e.g. one cron entry per
client (or loop over every `erp_*` database):

```bash
pg_dump -U postgres -d erp_dubaicollection | gzip > /srv/pms-bench/backups/erp_dubaicollection-$(date +%F).sql.gz
```

## If the GitHub repo is private

`new-client.sh`/`update-client.sh` run plain `git clone`/`git fetch` as the
`erp` system user, so that user needs read access to the repo on the VPS.
Easiest options:

- Add an SSH deploy key for the repo and use the `git@github.com:...` remote
  form instead of `https://`, or
- Create a GitHub Personal Access Token and set `REPO_URL` when calling the
  scripts: `REPO_URL="https://<token>@github.com/SystemDev-coder/Erp-Inventory.git" sudo -E sh deploy/no-docker/scripts/new-client.sh ...`
