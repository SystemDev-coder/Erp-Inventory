-- Phase 1 security/delete-protection fix (H6): restores the soft-delete helper
-- functions that server/docker/entrypoint.sh already defines and that the
-- application already assumes exist (server/src/db/softDelete.ts#softDeleteById,
-- calling ims.sp_soft_delete; server/src/modules/trash/trash.service.ts, calling
-- ims.sp_restore) but that were missing on this database, making delete-branch,
-- delete-warehouse, delete-expense, delete-schedule, delete-store, and
-- trash-restore all fail with "function does not exist".
--
-- Scope, deliberately: this migration only recreates the four support functions.
-- It intentionally does NOT attach ims.trg_soft_delete() as a BEFORE DELETE
-- trigger on every base table - doing so would silently convert every raw
-- DELETE statement across the whole application (including many outside this
-- Phase 1 fix's scope) into a soft delete, which is a much larger behavioral
-- change than "make the already-existing delete/restore/trash endpoints work".
-- The trigger function is still created below (matching the existing
-- entrypoint.sh convention) so it is available if that wider change is made
-- deliberately later, but nothing attaches it yet.

CREATE OR REPLACE FUNCTION ims.fn_table_has_column(p_table TEXT, p_column TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = p_table
       AND column_name = p_column
  ) INTO v_exists;
  RETURN COALESCE(v_exists, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION ims.fn_table_pk_column(p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_col TEXT;
  v_pk_cols INT;
BEGIN
  -- Only support soft-delete for tables with exactly ONE primary-key column.
  -- Junction tables with composite PKs (e.g. role_permissions) are left alone.
  SELECT COUNT(*) INTO v_pk_cols
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE i.indisprimary
     AND n.nspname = 'ims'
     AND c.relname = p_table;

  IF COALESCE(v_pk_cols, 0) <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT a.attname INTO v_col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE i.indisprimary
     AND n.nspname = 'ims'
     AND c.relname = p_table
   ORDER BY a.attnum
   LIMIT 1;

  RETURN v_col;
END;
$$;

CREATE OR REPLACE FUNCTION ims.sp_soft_delete(p_table TEXT, p_id BIGINT, p_user BIGINT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
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

  IF to_regclass(format('ims.%I', p_table)) IS NULL THEN
    RETURN QUERY SELECT FALSE, format('Table not found: %s', p_table);
    RETURN;
  END IF;

  IF NOT ims.fn_table_has_column(p_table, 'is_deleted') THEN
    RETURN QUERY SELECT FALSE, format('Soft delete not enabled for table: %s', p_table);
    RETURN;
  END IF;

  v_pk := ims.fn_table_pk_column(p_table);
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'Primary key not found for table %', p_table;
  END IF;

  v_sql := format('SELECT 1 FROM ims.%I WHERE %I = $1 LIMIT 1', p_table, v_pk);
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
      AND n.nspname = 'ims'
      AND t.relname = p_table
  LOOP
    v_sql := format(
      'SELECT 1 FROM %s WHERE %I = $1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1',
      v_ref.ref_table,
      v_ref.ref_column
    );
    EXECUTE v_sql INTO v_exists USING p_id;
    IF v_exists IS NOT NULL THEN
      RETURN QUERY SELECT FALSE, format(
        'Cannot delete: this record is already used in %s.',
        replace(v_ref.ref_table, 'ims.', '')
      );
      RETURN;
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

  v_sql := format('UPDATE ims.%I SET %s WHERE %I = $1', p_table, v_set, v_pk);
  EXECUTE v_sql USING p_id;

  RETURN QUERY SELECT TRUE, 'Deleted';
END;
$$;

CREATE OR REPLACE FUNCTION ims.sp_restore(p_table TEXT, p_id BIGINT, p_user BIGINT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_pk TEXT;
  v_has_deleted_at BOOLEAN;
  v_has_updated_at BOOLEAN;
  v_exists INT;
  v_sql TEXT;
  v_set TEXT;
BEGIN
  PERFORM set_config('app.include_deleted', '1', true);

  IF to_regclass(format('ims.%I', p_table)) IS NULL THEN
    RAISE EXCEPTION 'Table not found: %', p_table;
  END IF;

  IF NOT ims.fn_table_has_column(p_table, 'is_deleted') THEN
    RAISE EXCEPTION 'Table % does not support restore', p_table;
  END IF;

  v_pk := ims.fn_table_pk_column(p_table);
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'Primary key not found for table %', p_table;
  END IF;

  v_sql := format('SELECT 1 FROM ims.%I WHERE %I = $1 LIMIT 1', p_table, v_pk);
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

  v_sql := format('UPDATE ims.%I SET %s WHERE %I = $1', p_table, v_set, v_pk);
  EXECUTE v_sql USING p_id;

  RETURN QUERY SELECT TRUE, 'Restored';
END;
$$;

-- Created for parity with the existing entrypoint.sh convention, but not attached
-- to any table as a trigger by this migration (see note above).
CREATE OR REPLACE FUNCTION ims.trg_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pk TEXT;
  v_id BIGINT;
  v_res RECORD;
BEGIN
  v_pk := ims.fn_table_pk_column(TG_TABLE_NAME);
  IF v_pk IS NULL THEN
    RETURN OLD;
  END IF;
  v_id := NULLIF(to_jsonb(OLD)->>v_pk, '')::bigint;
  IF v_id IS NULL THEN
    RETURN OLD;
  END IF;
  IF NOT ims.fn_table_has_column(TG_TABLE_NAME, 'is_deleted') THEN
    RETURN OLD;
  END IF;

  SELECT * INTO v_res FROM ims.sp_soft_delete(TG_TABLE_NAME, v_id, NULL) LIMIT 1;
  IF COALESCE(v_res.success, FALSE) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION '%', COALESCE(v_res.message, 'Cannot delete this record');
END;
$$;
