#!/bin/sh
set -e

DB_HOST="${PGHOST:-db}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"
DB_NAME="${PGDATABASE:-erp_inventory}"
DB_SCHEMA="${PGSCHEMA:-ims}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/sql}"
BASE_SCHEMA_FILE="${BASE_SCHEMA_FILE:-Full_complete_scheme.sql}"

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done

export PGPASSWORD="${PGPASSWORD}"

# Ensure schema and migration tracker table exist.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}";
SET search_path TO "${DB_SCHEMA}", public;
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT now()
);
SQL

apply_base_schema() {
  file_path="$1"
  file_name=$(basename "$file_path")
  already_applied=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${file_name}'")
  if [ -n "$already_applied" ]; then
    echo "Skipping ${file_name} (already applied)"
    return
  fi

  echo "Applying base schema ${file_name}"
  if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file_path"; then
    echo "Strict schema apply failed, retrying in tolerant mode to keep core tables available"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=0 -f "$file_path"
  fi

  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${file_name}')"
}

BASE_SCHEMA_PATH="${MIGRATIONS_DIR}/${BASE_SCHEMA_FILE}"

if [ -f "${BASE_SCHEMA_PATH}" ]; then
  apply_base_schema "${BASE_SCHEMA_PATH}"
else
  echo "ERROR: base schema file not found at ${BASE_SCHEMA_PATH}"
  exit 1
fi

echo "Starting dev server..."
exec npm run dev
