-- Targeted repair for the purchase-posting incident in Main Branch only.
-- This does not create, rename, re-map, or move any account.  It can only
-- reactivate the single canonical Accounts Payable liability in branch 1.
-- Account IDs are database-local sequence values, so they must never be
-- assumed to be the same across deployments.
-- The migration runner records this file in ims.schema_migrations after the
-- transaction commits; an assertion failure rolls back the entire change.
BEGIN;

DO $$
DECLARE
  target ims.accounts%ROWTYPE;
  target_count INTEGER;
BEGIN
  -- Refuse to run if branch 1 is not the expected active Main Branch.
  IF NOT EXISTS (
    SELECT 1
      FROM ims.branches
     WHERE branch_id = 1
       AND LOWER(BTRIM(branch_name)) = 'main branch'
       AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: branch 1 is not the active Main Branch';
  END IF;

  SELECT COUNT(*)
    INTO target_count
    FROM ims.accounts
   WHERE branch_id = 1
     AND LOWER(BTRIM(name)) = 'accounts payable'
     AND account_type = 'liability';

  IF target_count = 0 THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: no Accounts Payable liability exists in branch 1';
  ELSIF target_count > 1 THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: % Accounts Payable liabilities exist in branch 1',
      target_count;
  END IF;

  SELECT *
    INTO target
    FROM ims.accounts
   WHERE branch_id = 1
     AND LOWER(BTRIM(name)) = 'accounts payable'
     AND account_type = 'liability'
   FOR UPDATE;

  UPDATE ims.accounts
     SET is_active = TRUE
   WHERE acc_id = target.acc_id
     AND branch_id = target.branch_id
     AND is_active IS DISTINCT FROM TRUE;

  RAISE NOTICE
    'Accounts Payable account % in branch % has been verified and activated',
    target.acc_id,
    target.branch_id;
END
$$;

COMMIT;
