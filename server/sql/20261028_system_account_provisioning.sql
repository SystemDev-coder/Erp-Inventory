-- Keep the asset-account preparation helper from deactivating core GL accounts.
-- This migration intentionally changes only the function definition; it does
-- not reactivate existing Accounts Payable/Receivable rows.  Existing records
-- require an explicit, approved remediation after they are reviewed.
CREATE OR REPLACE FUNCTION ims.fn_prepare_asset_accounts(p_branch_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_created INTEGER := 0;
BEGIN
  WITH required(name) AS (
    VALUES
      ('Cash @ Salaam Bank'),
      ('Cash @ Merchant'),
      ('Cash @ EVC-Plus'),
      ('Cash @ Premier Bank'),
      ('Cash @ Dahabshiil Bank')
  ),
  inserted AS (
    INSERT INTO ims.accounts(branch_id, name, institution, balance, account_type, is_active)
    SELECT p_branch_id, r.name, '', 0, 'asset', TRUE
      FROM required r
     WHERE NOT EXISTS (
       SELECT 1
         FROM ims.accounts a
        WHERE a.branch_id = p_branch_id
          AND LOWER(a.name) = LOWER(r.name)
     )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM inserted;

  RETURN v_created;
END $$;
