#!/bin/sh
set -e

DB_HOST="${PGHOST:-db}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"
DB_NAME="${PGDATABASE:-erp_inventory}"
DB_SCHEMA="${PGSCHEMA:-ims}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/sql}"
BASE_SCHEMA_FILE="${BASE_SCHEMA_FILE:-Full_complete_scheme.sql}"
AUTO_RESET_ON_SCHEMA_MISMATCH="${AUTO_RESET_ON_SCHEMA_MISMATCH:-false}"

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done

export PGPASSWORD="${PGPASSWORD}"

ensure_schema_tracking() {
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}";
SET search_path TO "${DB_SCHEMA}", public;
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT now(),
  checksum text
);
ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum text;
SQL
}

existing_schema_table_count() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = '${DB_SCHEMA}'
      AND table_name <> 'schema_migrations'
  " | tr -d '[:space:]'
}

is_schema_compatible() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT CASE WHEN
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='roles' AND column_name='role_code')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='roles' AND column_name='description')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='roles' AND column_name='is_system')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='permissions' AND column_name='perm_key')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='permissions' AND column_name='sub_module')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='permissions' AND column_name='action_type')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='users' AND column_name='full_name')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='users' AND column_name='email')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='warehouse_stock' AND column_name='branch_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='warehouse_stock' AND column_name='item_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='expenses' AND column_name='amount')
      THEN 1 ELSE 0 END
  " | tr -d '[:space:]'
}

reset_schema_if_incompatible() {
  table_count=$(existing_schema_table_count)
  if [ "${table_count:-0}" -le 0 ]; then
    return
  fi

  compatible=$(is_schema_compatible)
  if [ "$compatible" = "1" ]; then
    return
  fi

  if [ "$AUTO_RESET_ON_SCHEMA_MISMATCH" = "true" ]; then
    echo "Detected incompatible legacy schema in ${DB_SCHEMA}. Resetting schema (AUTO_RESET_ON_SCHEMA_MISMATCH=true)."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \"${DB_SCHEMA}\" CASCADE; CREATE SCHEMA \"${DB_SCHEMA}\";"
    ensure_schema_tracking
  else
    echo "ERROR: Incompatible schema detected in ${DB_SCHEMA}."
    echo "Set AUTO_RESET_ON_SCHEMA_MISMATCH=true (or run docker compose down -v) and restart."
    exit 1
  fi
}

ensure_schema_tracking
reset_schema_if_incompatible

compute_checksum() {
  file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
  else
    cksum "$file_path" | awk '{print $1}'
  fi
}

apply_base_schema() {
  file_path="$1"
  file_name=$(basename "$file_path")
  file_checksum=$(compute_checksum "$file_path")
  stored_checksum=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT checksum FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${file_name}'" | tr -d '[:space:]')

  if [ -n "$stored_checksum" ] && [ "$stored_checksum" = "$file_checksum" ]; then
    echo "Skipping ${file_name} (already applied)"
    return
  fi

  if [ -n "$stored_checksum" ]; then
    echo "Reapplying base schema ${file_name} (checksum changed)"
  else
    echo "Applying base schema ${file_name}"
  fi

  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file_path"

  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename, checksum) VALUES ('${file_name}', '${file_checksum}') ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()"
}

run_bootstrap_seed() {
  echo "Running bootstrap seed checks (company, branch, roles, sample users)"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
SET search_path TO "${DB_SCHEMA}", public;
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ims.company) THEN
    INSERT INTO ims.company (company_name) VALUES ('My Inventory ERP');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ims.branches WHERE is_active = TRUE) THEN
    INSERT INTO ims.branches (branch_name, is_active)
    VALUES ('Main Branch', TRUE)
    ON CONFLICT (branch_name) DO UPDATE SET is_active = EXCLUDED.is_active;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ims'
       AND p.proname = 'sp_generate_all_permissions'
  ) THEN
    BEGIN
      PERFORM ims.sp_generate_all_permissions();
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Skipping sp_generate_all_permissions: %', SQLERRM;
    END;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ims'
       AND p.proname = 'sp_create_default_roles'
  ) THEN
    BEGIN
      PERFORM ims.sp_create_default_roles();
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Skipping sp_create_default_roles: %', SQLERRM;
    END;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ims'
       AND p.proname = 'sp_create_sample_users'
  ) THEN
    BEGIN
      PERFORM ims.sp_create_sample_users();
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Skipping sp_create_sample_users: %', SQLERRM;
    END;
  END IF;
END
\$\$;
SQL
}

BASE_SCHEMA_PATH="${MIGRATIONS_DIR}/${BASE_SCHEMA_FILE}"

if [ -f "${BASE_SCHEMA_PATH}" ]; then
  apply_base_schema "${BASE_SCHEMA_PATH}"
else
  echo "ERROR: base schema file not found at ${BASE_SCHEMA_PATH}"
  exit 1
fi

run_bootstrap_seed

echo "Starting dev server..."
exec npm run dev
