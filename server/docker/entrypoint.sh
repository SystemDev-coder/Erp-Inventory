#!/bin/sh
set -e

DB_HOST="${PGHOST:-db}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"
DB_NAME="${PGDATABASE:-erp_inventory}"
DB_SCHEMA="${PGSCHEMA:-ims}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/sql}"
BASE_MIGRATION="${BASE_MIGRATION:-complete_inventory_erp_schema.sql}"

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

run_migration() {
  file="$1"
  base=$(basename "$file")
  already=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${base}'")
  if [ -z "$already" ]; then
    echo "Applying migration $base"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${base}')"
  else
    echo "Skipping $base (already applied)"
  fi
}

# Run COMPLETE_SETUP.sql first if it exists
if [ -f "${MIGRATIONS_DIR}/${BASE_MIGRATION}" ]; then
  run_migration "${MIGRATIONS_DIR}/${BASE_MIGRATION}"
fi

# Run all other migrations in sorted order
for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' ! -name "${BASE_MIGRATION}" | sort); do
  base=$(basename "$file")
  case "$base" in
    20260209_products_categories.sql|PRODUCTS_CATEGORIES.sql)
      echo "Skipping $base (covered by ${BASE_MIGRATION})"
      ;;
    *)
      run_migration "$file"
      ;;
  esac
done

echo "Starting dev server..."
exec npm run dev
