-- Phase 2: Central Delete Architecture.
--
-- Today ims.sp_soft_delete (20260915b_soft_delete_functions.sql) walks FK
-- constraints referencing the target row and blocks the delete if ANY active
-- row anywhere references it - blunt, all-or-nothing, no cascade, no way to
-- say "this dependency is just historical data, leave it alone and allow the
-- delete anyway". This migration adds a data-driven policy table plus the
-- functions to read/enforce it, and extends sp_soft_delete (same signature,
-- so its 4 existing callers - finance, stores, inventory, schedules - are
-- unaffected) to consult it. Any FK reference with no matching policy row
-- still defaults to 'block', i.e. exactly today's behavior, so nothing
-- regresses for tables nobody has classified yet.
--
-- Deliberately NOT done here (see Phase 2 plan): no existing module's delete
-- endpoint is rewired to use this - that's Phases 3-7. sp_restore also stays
-- single-row; restoring a cascade-deleted parent does not auto-restore its
-- cascaded children yet.

CREATE TABLE IF NOT EXISTS ims.delete_dependency_policy (
  policy_id BIGSERIAL PRIMARY KEY,
  parent_table VARCHAR(80) NOT NULL,
  child_table VARCHAR(80) NOT NULL,
  child_column VARCHAR(80) NOT NULL,
  policy VARCHAR(10) NOT NULL CHECK (policy IN ('block', 'cascade', 'preserve')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_delete_dependency_policy UNIQUE (parent_table, child_table, child_column)
);

-- Shared FK-discovery helper, factored out of sp_soft_delete's inline loop so
-- both it and fn_analyze_delete_impact use one query. Joins pg_class on both
-- sides (rather than relying on ::regclass::text + string-stripping, as the
-- original inline loop did) so the returned table names are always bare,
-- regardless of search_path.
CREATE OR REPLACE FUNCTION ims.fn_table_dependents(p_table TEXT)
RETURNS TABLE(child_table TEXT, child_column TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ct.relname::text AS child_table,
    a.attname::text AS child_column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class ct ON ct.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = ct.relnamespace
    JOIN pg_class t ON t.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE c.contype = 'f'
     AND n.nspname = 'ims'
     AND cn.nspname = 'ims'
     AND t.relname = p_table;
$$;

-- Read-only "Dependency Analyzer" / "Impact Preview" support. Does not
-- mutate anything. One row per referencing table that currently has at
-- least one active (non-deleted) row pointing at p_id.
CREATE OR REPLACE FUNCTION ims.fn_analyze_delete_impact(p_table TEXT, p_id BIGINT)
RETURNS TABLE(child_table TEXT, child_column TEXT, policy TEXT, affected_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ref RECORD;
  v_sql TEXT;
  v_count BIGINT;
  v_policy TEXT;
BEGIN
  PERFORM set_config('app.include_deleted', '1', true);

  FOR v_ref IN SELECT * FROM ims.fn_table_dependents(p_table)
  LOOP
    v_sql := format(
      'SELECT COUNT(*) FROM ims.%I WHERE %I = $1 AND COALESCE(is_deleted, 0) = 0',
      v_ref.child_table,
      v_ref.child_column
    );
    EXECUTE v_sql INTO v_count USING p_id;

    IF v_count > 0 THEN
      SELECT dp.policy INTO v_policy
        FROM ims.delete_dependency_policy dp
       WHERE dp.parent_table = p_table
         AND dp.child_table = v_ref.child_table
         AND dp.child_column = v_ref.child_column
       LIMIT 1;

      child_table := v_ref.child_table;
      child_column := v_ref.child_column;
      policy := COALESCE(v_policy, 'block');
      affected_count := v_count;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Read-only recursive validator: does ANY 'block' policy anywhere in p_id's
-- cascade tree (including inside cascade children's own children, and so on)
-- currently have an active reference? Used by sp_soft_delete to validate the
-- ENTIRE cascade tree before mutating anything - see the comment on
-- sp_soft_delete below for why this two-pass split is required.
CREATE OR REPLACE FUNCTION ims.fn_can_delete(p_table TEXT, p_id BIGINT)
RETURNS TABLE(blocked BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ref RECORD;
  v_sql TEXT;
  v_exists INT;
  v_policy TEXT;
  v_child_pk TEXT;
  v_child_id BIGINT;
  v_child_res RECORD;
BEGIN
  PERFORM set_config('app.include_deleted', '1', true);

  FOR v_ref IN SELECT * FROM ims.fn_table_dependents(p_table)
  LOOP
    SELECT dp.policy INTO v_policy
      FROM ims.delete_dependency_policy dp
     WHERE dp.parent_table = p_table
       AND dp.child_table = v_ref.child_table
       AND dp.child_column = v_ref.child_column
     LIMIT 1;
    v_policy := COALESCE(v_policy, 'block');

    IF v_policy = 'preserve' THEN
      CONTINUE;
    END IF;

    IF v_policy = 'block' THEN
      v_sql := format(
        'SELECT 1 FROM ims.%I WHERE %I = $1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1',
        v_ref.child_table,
        v_ref.child_column
      );
      EXECUTE v_sql INTO v_exists USING p_id;
      IF v_exists IS NOT NULL THEN
        blocked := TRUE;
        message := format('Cannot delete: this record is already used in %s.', v_ref.child_table);
        RETURN NEXT;
        RETURN;
      END IF;
      CONTINUE;
    END IF;

    -- policy = 'cascade': every active child row must itself be deletable,
    -- recursively (it may have its own 'block' dependents further down).
    v_child_pk := ims.fn_table_pk_column(v_ref.child_table);
    IF v_child_pk IS NULL THEN
      blocked := TRUE;
      message := format('Cannot cascade delete: no primary key on %s', v_ref.child_table);
      RETURN NEXT;
      RETURN;
    END IF;

    v_sql := format(
      'SELECT %I FROM ims.%I WHERE %I = $1 AND COALESCE(is_deleted, 0) = 0',
      v_child_pk,
      v_ref.child_table,
      v_ref.child_column
    );
    FOR v_child_id IN EXECUTE v_sql USING p_id
    LOOP
      SELECT * INTO v_child_res FROM ims.fn_can_delete(v_ref.child_table, v_child_id) LIMIT 1;
      IF COALESCE(v_child_res.blocked, FALSE) THEN
        blocked := TRUE;
        message := v_child_res.message;
        RETURN NEXT;
        RETURN;
      END IF;
    END LOOP;
  END LOOP;

  blocked := FALSE;
  message := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION ims.sp_soft_delete(p_table TEXT, p_id BIGINT, p_user BIGINT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_pk TEXT;
  v_child_pk TEXT;
  v_has_deleted_at BOOLEAN;
  v_has_updated_at BOOLEAN;
  v_exists INT;
  v_ref RECORD;
  v_sql TEXT;
  v_set TEXT;
  v_policy TEXT;
  v_child_id BIGINT;
  v_child_res RECORD;
  v_check RECORD;
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

  -- Validate the ENTIRE cascade tree before mutating anything. This function
  -- has no transaction of its own - a graceful (FALSE, message) return does
  -- NOT undo statements already run earlier in this same call. Without this
  -- upfront check, a 'block' discovered deep inside a cascade branch (e.g.
  -- customer -> orders[cascade] -> order_lines[block: already invoiced])
  -- could leave earlier cascade siblings already soft-deleted while the
  -- overall delete reports failure - a partial, inconsistent mutation.
  SELECT * INTO v_check FROM ims.fn_can_delete(p_table, p_id) LIMIT 1;
  IF COALESCE(v_check.blocked, FALSE) THEN
    RETURN QUERY SELECT FALSE, v_check.message;
    RETURN;
  END IF;

  FOR v_ref IN SELECT * FROM ims.fn_table_dependents(p_table)
  LOOP
    SELECT dp.policy INTO v_policy
      FROM ims.delete_dependency_policy dp
     WHERE dp.parent_table = p_table
       AND dp.child_table = v_ref.child_table
       AND dp.child_column = v_ref.child_column
     LIMIT 1;
    v_policy := COALESCE(v_policy, 'block');

    IF v_policy <> 'cascade' THEN
      CONTINUE;
    END IF;

    v_child_pk := ims.fn_table_pk_column(v_ref.child_table);
    v_sql := format(
      'SELECT %I FROM ims.%I WHERE %I = $1 AND COALESCE(is_deleted, 0) = 0',
      v_child_pk,
      v_ref.child_table,
      v_ref.child_column
    );
    FOR v_child_id IN EXECUTE v_sql USING p_id
    LOOP
      SELECT * INTO v_child_res FROM ims.sp_soft_delete(v_ref.child_table, v_child_id, p_user) LIMIT 1;
      IF NOT COALESCE(v_child_res.success, FALSE) THEN
        -- Already validated above, so this should only happen under a
        -- genuine race (something changed between check and mutate). Raise
        -- rather than return gracefully, so Postgres rolls back everything
        -- this call has done so far instead of leaving a partial cascade.
        RAISE EXCEPTION 'Cascade delete failed for % #%: %', v_ref.child_table, v_child_id, v_child_res.message;
      END IF;
    END LOOP;
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

-- First real policy row: formalizes what stores.service.ts#deleteStore already
-- does by hand today (loops and soft-deletes every store_items row before
-- soft-deleting the store itself). Proves the engine against a real,
-- low-risk case without changing any behavior - the app-layer loop still
-- runs too until a later phase removes it.
INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES (
  'stores',
  'store_items',
  'store_id',
  'cascade',
  'Mirrors the existing manual loop in stores.service.ts#deleteStore.'
)
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
