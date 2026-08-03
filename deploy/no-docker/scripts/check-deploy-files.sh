#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"

missing=0
for path in \
  "$ROOT_DIR/deploy/no-docker/env/server.env.example" \
  "$ROOT_DIR/deploy/no-docker/env/frontend.env.production.example" \
  "$ROOT_DIR/deploy/no-docker/nginx/erp-inventory.conf" \
  "$ROOT_DIR/deploy/no-docker/pm2/ecosystem.config.cjs" \
  "$ROOT_DIR/deploy/no-docker/scripts/start-api.sh" \
  "$ROOT_DIR/deploy/no-docker/systemd/erp-inventory-migrate.service" \
  "$ROOT_DIR/deploy/no-docker/systemd/erp-inventory-db-backup.service" \
  "$ROOT_DIR/deploy/no-docker/systemd/erp-inventory-db-backup.timer"
do
  if [ ! -f "$path" ]; then
    echo "Missing: $path"
    missing=1
  fi
done

OLD_REF_PATTERN="[F]lask|[f]lask|[g]unicorn|[w]sgi|[r]equirements[.]txt|[p]ython3 -m venv|/opt/[e]rp-inventory|/etc/[e]rp-inventory|/var/www/[e]rp-inventory"

if grep -R -n -E "$OLD_REF_PATTERN" "$ROOT_DIR/deploy/no-docker"; then
  echo "Found old deployment references above."
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "No-Docker deploy files look consistent."
