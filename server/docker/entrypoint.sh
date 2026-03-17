#!/bin/sh
set -e

DB_HOST="${PGHOST:-db}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-postgres}"
DB_NAME="${PGDATABASE:-erp_inventory}"
DB_SCHEMA="${PGSCHEMA:-ims}"
DB_ADMIN_USER="${ADMIN_PGUSER:-${DB_USER}}"
DB_ADMIN_PASSWORD="${ADMIN_PGPASSWORD:-${PGPASSWORD}}"
APP_DB_USER="${DB_USER}"
APP_DB_PASSWORD="${PGPASSWORD}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/sql}"
BASE_SCHEMA_FILE="${BASE_SCHEMA_FILE:-Full_complete_scheme.sql}"
DEMO_SEED_FILE="${DEMO_SEED_FILE:-seed_demo_data.sql}"
RUN_DEMO_SEED="${RUN_DEMO_SEED:-false}"
AUTO_RESET_ON_SCHEMA_MISMATCH="${AUTO_RESET_ON_SCHEMA_MISMATCH:-false}"
NODE_MODULES_DIR="/app/node_modules"
LOCKFILE_PATH="/app/package-lock.json"
LOCKFILE_HASH_PATH="${NODE_MODULES_DIR}/.package-lock.sha256"

lockfile_checksum() {
  file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
  else
    cksum "$file_path" | awk '{print $1}'
  fi
}

ensure_node_dependencies() {
  need_install=false
  reason=""

  if [ ! -d "$NODE_MODULES_DIR" ]; then
    need_install=true
    reason="node_modules missing"
  elif [ ! -f "${NODE_MODULES_DIR}/xlsx/package.json" ]; then
    need_install=true
    reason="xlsx missing"
  elif [ -f "$LOCKFILE_PATH" ]; then
    current_hash=$(lockfile_checksum "$LOCKFILE_PATH")
    stored_hash=""
    if [ -f "$LOCKFILE_HASH_PATH" ]; then
      stored_hash=$(cat "$LOCKFILE_HASH_PATH")
    fi

    if [ "$current_hash" != "$stored_hash" ]; then
      need_install=true
      reason="package-lock changed"
    fi
  fi

  if [ "$need_install" = true ]; then
    echo "Installing server dependencies (${reason})..."
    npm install
    if [ -f "$LOCKFILE_PATH" ]; then
      lockfile_checksum "$LOCKFILE_PATH" > "$LOCKFILE_HASH_PATH"
    fi
  fi
}

ensure_node_dependencies

psql_admin() {
  PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d "$DB_NAME" "$@"
}

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" >/dev/null 2>&1; do
  sleep 1
done

ensure_schema_tracking() {
psql_admin -v ON_ERROR_STOP=1 <<SQL
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
  psql_admin -tAc "
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = '${DB_SCHEMA}'
      AND table_name <> 'schema_migrations'
  " | tr -d '[:space:]'
}

is_schema_compatible() {
  psql_admin -tAc "
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
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='expenses' AND column_name='created_at')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='${DB_SCHEMA}' AND table_name='expense_charges' AND column_name='amount')
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
    psql_admin -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \"${DB_SCHEMA}\" CASCADE; CREATE SCHEMA \"${DB_SCHEMA}\";"
    ensure_schema_tracking
  else
    echo "ERROR: Incompatible schema detected in ${DB_SCHEMA}."
    echo "Set AUTO_RESET_ON_SCHEMA_MISMATCH=true (or run docker compose down -v) and restart."
    exit 1
  fi
}

ensure_schema_tracking
reset_schema_if_incompatible

ensure_app_role() {
  if [ -z "$APP_DB_USER" ] || [ "$APP_DB_USER" = "$DB_ADMIN_USER" ]; then
    return
  fi

  echo "Ensuring application role ${APP_DB_USER} exists..."
  psql_admin -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${APP_DB_USER}', '${APP_DB_PASSWORD}');
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE "${DB_NAME}" TO "${APP_DB_USER}";
GRANT USAGE ON SCHEMA "${DB_SCHEMA}" TO "${APP_DB_USER}";
ALTER ROLE "${APP_DB_USER}" NOBYPASSRLS;

ALTER DEFAULT PRIVILEGES IN SCHEMA "${DB_SCHEMA}"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA "${DB_SCHEMA}"
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${APP_DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA "${DB_SCHEMA}"
  GRANT EXECUTE ON FUNCTIONS TO "${APP_DB_USER}";
SQL
}

grant_app_privileges() {
  if [ -z "$APP_DB_USER" ] || [ "$APP_DB_USER" = "$DB_ADMIN_USER" ]; then
    return
  fi

  echo "Granting privileges to ${APP_DB_USER}..."
  psql_admin -v ON_ERROR_STOP=1 <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${DB_SCHEMA}" TO "${APP_DB_USER}";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "${DB_SCHEMA}" TO "${APP_DB_USER}";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${DB_SCHEMA}" TO "${APP_DB_USER}";
SQL
}

ensure_app_role

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
  stored_checksum=$(psql_admin -tAc "SELECT checksum FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${file_name}'" | tr -d '[:space:]')

  if [ -n "$stored_checksum" ] && [ "$stored_checksum" = "$file_checksum" ]; then
    echo "Skipping ${file_name} (already applied)"
    return
  fi

  if [ -n "$stored_checksum" ]; then
    echo "Reapplying base schema ${file_name} (checksum changed)"
  else
    echo "Applying base schema ${file_name}"
  fi

  psql_admin -v ON_ERROR_STOP=1 -f "$file_path"

  psql_admin -v ON_ERROR_STOP=1 -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename, checksum) VALUES ('${file_name}', '${file_checksum}') ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()"
}

apply_seed_file() {
  file_path="$1"
  file_name=$(basename "$file_path")
  file_checksum=$(compute_checksum "$file_path")
  stored_checksum=$(psql_admin -tAc "SELECT checksum FROM ${DB_SCHEMA}.schema_migrations WHERE filename='${file_name}'" | tr -d '[:space:]')

  if [ -n "$stored_checksum" ] && [ "$stored_checksum" = "$file_checksum" ]; then
    echo "Skipping ${file_name} (already applied)"
    return
  fi

  if [ -n "$stored_checksum" ]; then
    echo "Reapplying demo seed ${file_name} (checksum changed)"
  else
    echo "Applying demo seed ${file_name}"
  fi

  psql_admin -v ON_ERROR_STOP=1 -f "$file_path"

  psql_admin -v ON_ERROR_STOP=1 -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename, checksum) VALUES ('${file_name}', '${file_checksum}') ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()"
}

run_bootstrap_seed() {
  echo "Running bootstrap seed checks (company, branch, roles, sample users)"
  psql_admin -v ON_ERROR_STOP=1 <<SQL
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

  -- Hard guarantee: Admin can access Settings -> Company Info and Audit History
  INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
  VALUES
    ('system.settings', 'System Settings', 'System Administration', 'System', 'settings', 'Configure system settings'),
    ('system.company.manage', 'Manage Company', 'System Administration', 'Company', 'manage', 'Update company profile'),
    ('system.audit.view', 'View Audit Logs', 'System Administration', 'Audit', 'view', 'View audit trail'),
    ('trash.view', 'View Trash', 'System Administration', 'Trash', 'view', 'View deleted records'),
    ('trash.restore', 'Restore Trash', 'System Administration', 'Trash', 'restore', 'Restore deleted records'),
    ('company.view', 'View Company', 'System Administration', 'Company', 'view', 'View company profile'),
    ('company.create', 'Create Company', 'System Administration', 'Company', 'create', 'Create company profile'),
    ('company.update', 'Update Company', 'System Administration', 'Company', 'update', 'Update company profile'),
    ('company.delete', 'Delete Company', 'System Administration', 'Company', 'delete', 'Delete company profile'),
    ('audit_logs.view', 'View Audit Logs', 'System Administration', 'Audit', 'view', 'View audit logs')
  ON CONFLICT (perm_key) DO NOTHING;

  INSERT INTO ims.role_permissions (role_id, perm_id)
  SELECT r.role_id, p.perm_id
  FROM ims.roles r
  JOIN ims.permissions p
    ON p.perm_key IN (
      'system.settings',
      'system.company.manage',
      'system.audit.view',
      'trash.view',
      'trash.restore',
      'company.view',
      'company.create',
      'company.update',
      'company.delete',
      'audit_logs.view'
    )
  WHERE r.role_code = 'ADMIN'
  ON CONFLICT (role_id, perm_id) DO NOTHING;

  -- Also grant directly to the admin user to survive role drift in old datasets
  INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
  SELECT u.user_id, p.perm_id, u.user_id
  FROM ims.users u
  JOIN ims.permissions p
    ON p.perm_key IN (
      'system.settings',
      'system.company.manage',
      'system.audit.view',
      'trash.view',
      'trash.restore',
      'company.view',
      'company.create',
      'company.update',
      'company.delete',
      'audit_logs.view'
    )
  WHERE u.username = 'admin'
  ON CONFLICT (user_id, perm_id) DO NOTHING;

  DELETE FROM ims.user_permission_overrides upo
  USING ims.users u, ims.permissions p
  WHERE upo.user_id = u.user_id
    AND upo.perm_id = p.perm_id
    AND u.username = 'admin'
    AND p.perm_key IN (
      'system.settings',
      'system.company.manage',
      'system.audit.view',
      'trash.view',
      'trash.restore',
      'company.view',
      'company.create',
      'company.update',
      'company.delete',
      'audit_logs.view'
    )
    AND upo.effect = 'deny';
END
\$\$;
SQL
}

BASE_SCHEMA_PATH="${MIGRATIONS_DIR}/${BASE_SCHEMA_FILE}"
DEMO_SEED_PATH="${MIGRATIONS_DIR}/${DEMO_SEED_FILE}"

if [ -f "${BASE_SCHEMA_PATH}" ]; then
  apply_base_schema "${BASE_SCHEMA_PATH}"
else
  echo "ERROR: base schema file not found at ${BASE_SCHEMA_PATH}"
  exit 1
fi

run_bootstrap_seed

echo "Applying runtime schema fixes..."
psql_admin -v ON_ERROR_STOP=1 <<SQL
SET search_path TO "${DB_SCHEMA}", public;
ALTER TABLE ims.accounts DROP CONSTRAINT IF EXISTS accounts_balance_check;
ALTER TABLE ims.customers ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
UPDATE ims.customers
   SET remaining_balance = open_balance
 WHERE remaining_balance = 0
   AND open_balance <> 0;

-- Soft delete support for all tables
DO \$\$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = '${DB_SCHEMA}'
       AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE ${DB_SCHEMA}.%I ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0', r.table_name);
    EXECUTE format('ALTER TABLE ${DB_SCHEMA}.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', r.table_name);
  END LOOP;
END
\$\$;

CREATE OR REPLACE FUNCTION ims.fn_table_has_column(p_table TEXT, p_column TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS \$\$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = '${DB_SCHEMA}'
       AND table_name = p_table
       AND column_name = p_column
  ) INTO v_exists;
  RETURN COALESCE(v_exists, FALSE);
END;
\$\$;

CREATE OR REPLACE FUNCTION ims.fn_table_pk_column(p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS \$\$
DECLARE
  v_col TEXT;
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE i.indisprimary
     AND n.nspname = '${DB_SCHEMA}'
     AND c.relname = p_table;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT a.attname INTO v_col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE i.indisprimary
     AND n.nspname = '${DB_SCHEMA}'
     AND c.relname = p_table
   ORDER BY a.attnum
   LIMIT 1;

  RETURN v_col;
END;
\$\$;

CREATE OR REPLACE FUNCTION ims.sp_soft_delete(p_table TEXT, p_id BIGINT, p_user BIGINT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS \$\$
DECLARE
  v_pk TEXT;
  v_has_deleted_at BOOLEAN;
  v_has_updated_at BOOLEAN;
  v_exists INT;
  v_ref RECORD;
  v_sql TEXT;
  v_set TEXT;
BEGIN
  PERFORM set_config('app.include_deleted', '1', true);

  IF to_regclass(format('${DB_SCHEMA}.%I', p_table)) IS NULL THEN
    RAISE EXCEPTION 'Table not found: %', p_table;
  END IF;

  IF NOT ims.fn_table_has_column(p_table, 'is_deleted') THEN
    RAISE EXCEPTION 'Table % does not support soft delete', p_table;
  END IF;

  v_pk := ims.fn_table_pk_column(p_table);
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'Primary key not found for table %', p_table;
  END IF;

  v_sql := format('SELECT 1 FROM ${DB_SCHEMA}.%I WHERE %I = \$1 LIMIT 1', p_table, v_pk);
  EXECUTE v_sql INTO v_exists USING p_id;
  IF v_exists IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Record not found';
    RETURN;
  END IF;

  FOR v_ref IN
    SELECT
      c.conrelid::regclass::text AS ref_table,
      a.attname AS ref_column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class t ON t.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = '${DB_SCHEMA}'
      AND t.relname = p_table
  LOOP
    v_sql := format(
      'SELECT 1 FROM %s WHERE %I = \$1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1',
      v_ref.ref_table,
      v_ref.ref_column
    );
    EXECUTE v_sql INTO v_exists USING p_id;
    IF v_exists IS NOT NULL THEN
      RAISE EXCEPTION 'This record cannot be deleted because it is already used in %.',
        replace(v_ref.ref_table, '${DB_SCHEMA}.', '');
    END IF;
  END LOOP;

  v_has_deleted_at := ims.fn_table_has_column(p_table, 'deleted_at');
  v_has_updated_at := ims.fn_table_has_column(p_table, 'updated_at');

  v_set := 'is_deleted = 1';
  IF v_has_deleted_at THEN
    v_set := v_set || ', deleted_at = NOW()';
  END IF;
  IF v_has_updated_at THEN
    v_set := v_set || ', updated_at = NOW()';
  END IF;

  v_sql := format('UPDATE ${DB_SCHEMA}.%I SET %s WHERE %I = \$1', p_table, v_set, v_pk);
  EXECUTE v_sql USING p_id;

  RETURN QUERY SELECT TRUE, 'Deleted';
END;
\$\$;

CREATE OR REPLACE FUNCTION ims.sp_restore(p_table TEXT, p_id BIGINT, p_user BIGINT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS \$\$
DECLARE
  v_pk TEXT;
  v_has_deleted_at BOOLEAN;
  v_has_updated_at BOOLEAN;
  v_exists INT;
  v_sql TEXT;
  v_set TEXT;
BEGIN
  PERFORM set_config('app.include_deleted', '1', true);

  IF to_regclass(format('${DB_SCHEMA}.%I', p_table)) IS NULL THEN
    RAISE EXCEPTION 'Table not found: %', p_table;
  END IF;

  IF NOT ims.fn_table_has_column(p_table, 'is_deleted') THEN
    RAISE EXCEPTION 'Table % does not support restore', p_table;
  END IF;

  v_pk := ims.fn_table_pk_column(p_table);
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'Primary key not found for table %', p_table;
  END IF;

  v_sql := format('SELECT 1 FROM ${DB_SCHEMA}.%I WHERE %I = \$1 LIMIT 1', p_table, v_pk);
  EXECUTE v_sql INTO v_exists USING p_id;
  IF v_exists IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Record not found';
    RETURN;
  END IF;

  v_has_deleted_at := ims.fn_table_has_column(p_table, 'deleted_at');
  v_has_updated_at := ims.fn_table_has_column(p_table, 'updated_at');

  v_set := 'is_deleted = 0';
  IF v_has_deleted_at THEN
    v_set := v_set || ', deleted_at = NULL';
  END IF;
  IF v_has_updated_at THEN
    v_set := v_set || ', updated_at = NOW()';
  END IF;

  v_sql := format('UPDATE ${DB_SCHEMA}.%I SET %s WHERE %I = \$1', p_table, v_set, v_pk);
  EXECUTE v_sql USING p_id;

  RETURN QUERY SELECT TRUE, 'Restored';
END;
\$\$;

CREATE OR REPLACE FUNCTION ims.trg_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS \$\$
DECLARE
  v_pk TEXT;
  v_id BIGINT;
BEGIN
  v_pk := ims.fn_table_pk_column(TG_TABLE_NAME);
  IF v_pk IS NULL THEN
    RETURN OLD;
  END IF;
  -- Avoid dynamic record field access errors by using jsonb lookup
  v_id := NULLIF(to_jsonb(OLD)->>v_pk, '')::bigint;
  IF v_id IS NULL THEN
    RETURN OLD;
  END IF;
  PERFORM ims.sp_soft_delete(TG_TABLE_NAME, v_id, NULL);
  RETURN NULL;
END;
\$\$;

DO \$\$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = '${DB_SCHEMA}'
       AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON ${DB_SCHEMA}.%I', r.table_name);
    EXECUTE format('CREATE TRIGGER trg_soft_delete BEFORE DELETE ON ${DB_SCHEMA}.%I FOR EACH ROW EXECUTE FUNCTION ims.trg_soft_delete()', r.table_name);
  END LOOP;
END
\$\$;

DO \$\$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = '${DB_SCHEMA}'
       AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE ${DB_SCHEMA}.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE ${DB_SCHEMA}.%I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS rls_soft_delete ON ${DB_SCHEMA}.%I', r.table_name);
    EXECUTE format(
      'CREATE POLICY rls_soft_delete ON ${DB_SCHEMA}.%I USING (COALESCE(is_deleted::int, 0) = 0 OR current_setting(''app.include_deleted'', true) = ''1'') WITH CHECK (true)',
      r.table_name
    );
  END LOOP;
END
\$\$;
SQL

grant_app_privileges

if [ "$RUN_DEMO_SEED" = "true" ]; then
  if [ -f "${DEMO_SEED_PATH}" ]; then
    apply_seed_file "${DEMO_SEED_PATH}"
  else
    echo "Skipping demo seed: file not found at ${DEMO_SEED_PATH}"
  fi
fi

echo "Starting dev server..."
exec npm run dev
