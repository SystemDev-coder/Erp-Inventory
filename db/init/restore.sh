#!/bin/sh
set -eu

# Runs only on first init (empty PGDATA), via official Postgres entrypoint.
# If you don't have a dump, this script exits cleanly.

DUMP="/docker-entrypoint-initdb.d/db.dump"

if [ ! -f "$DUMP" ]; then
  echo "[restore] No db.dump found at $DUMP; skipping restore."
  exit 0
fi

echo "[restore] Restoring from $DUMP into database '${POSTGRES_DB}'..."

# Detect custom-format dumps (pg_dump -Fc). They start with 'PGDMP'.
MAGIC="$(head -c 5 "$DUMP" 2>/dev/null || true)"

if [ "$MAGIC" = "PGDMP" ]; then
  # Custom format: use pg_restore.
  pg_restore \
    --verbose \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --dbname "$POSTGRES_DB" \
    "$DUMP"
else
  # Plain SQL: use psql.
  psql -v ON_ERROR_STOP=1 --dbname "$POSTGRES_DB" -f "$DUMP"
fi

echo "[restore] Done."

