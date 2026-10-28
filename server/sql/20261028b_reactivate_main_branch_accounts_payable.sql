-- Targeted repair for the purchase-posting incident in Main Branch only.
-- This does not create, rename, re-map, or move any account.  It can only
-- reactivate the already-verified Accounts Payable row (acc_id 2, branch 1).
-- The migration runner records this file in ims.schema_migrations after the
-- transaction commits; an assertion failure rolls back the entire change.
BEGIN;

DO $$
DECLARE
  target ims.accounts%ROWTYPE;
BEGIN
  SELECT *
    INTO target
    FROM ims.accounts
   WHERE acc_id = 2
     AND branch_id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: account 2 in branch 1 was not found';
  END IF;

  IF LOWER(BTRIM(target.name)) <> 'accounts payable' THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: account 2 in branch 1 is named "%"',
      target.name;
  END IF;

  IF target.account_type <> 'liability' THEN
    RAISE EXCEPTION
      'Refusing Accounts Payable remediation: account 2 in branch 1 has type "%", expected liability',
      target.account_type;
  END IF;

  UPDATE ims.accounts
     SET is_active = TRUE
   WHERE acc_id = 2
     AND branch_id = 1
     AND is_active IS DISTINCT FROM TRUE;

  RAISE NOTICE
    'Accounts Payable account 2 in branch 1 has been verified and activated';
END
$$;

COMMIT;
