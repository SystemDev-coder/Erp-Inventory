#!/bin/sh
set -e

DB_HOST="${PGHOST:-db}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"
DB_NAME="${PGDATABASE:-erp_inventory}"
DB_SCHEMA="${PGSCHEMA:-ims}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/sql}"

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done

export PGPASSWORD="${PGPASSWORD}"

# Ensure target schema exists before running migrations.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}";
SET search_path TO "${DB_SCHEMA}", public;
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT now()
);
SQL

for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort); do
  base=$(basename "$file")
  already=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${base}'")
  if [ -z "$already" ]; then
    echo "Applying migration $base"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${base}')"
  else
    echo "Skipping $base (already applied)"
  fi
done

echo "Starting dev server..."
exec npm run dev
