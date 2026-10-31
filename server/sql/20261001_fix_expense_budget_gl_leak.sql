-- Fix: ims.sp_charge_expense_budget's DELETE and SYNC operations hard-delete
-- ims.expense_charges rows directly in SQL, bypassing the app's
-- deleteExpenseCharge/rewriteExpenseChargeGl reversal logic (finance.service.ts)
-- entirely. That logic is the ONLY place that reverses a charge's GL impact
-- (accounts.balance + account_transactions) before removing it - this function
-- never did, so any budget charge removed via DELETE, or dropped by SYNC
-- because its budget no longer exists, left its GL posting permanently
-- orphaned: no expense_charges row to show it in the UI, but its debit stayed
-- stuck in Operating Expense (or a prepaid asset account) forever.
--
-- Confirmed on demomadal production: an auto-charged "Rents" budget charge
-- (note "Auto Budget Sync", $550) was removed this way, leaving Operating
-- Expense overstated by exactly $550 with zero visible expense charge to
-- explain it - found via Trial Balance ($1,300) vs the Expense Charge list's
-- real total ($750), then confirmed line-by-line via the Account
-- Statement/General Ledger drill-down for that account.
--
-- Fix: reverse each charge's debit-side GL impact (mirrors
-- deleteExpenseCharge's own reversal - credit-side Expense Payable rows are
-- deliberately left out of the accounts.balance reversal, same as there)
-- and delete its account_transactions rows before the expense_charges row
-- itself is removed, in both the DELETE branch and SYNC's deletion clause.
CREATE OR REPLACE FUNCTION ims.sp_charge_expense_budget(
    p_budget_id   BIGINT,
    p_reg_date    TIMESTAMPTZ,
    p_oper        VARCHAR,
    p_user_id     BIGINT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_month INT := EXTRACT(MONTH FROM p_reg_date);
    v_year  INT := EXTRACT(YEAR  FROM p_reg_date);
BEGIN
    CREATE TEMP TABLE tmp_expense_budget ON COMMIT DROP AS
    SELECT
        b.budget_id,
        b.exp_id,
        b.fixed_amount,
        e.branch_id
    FROM ims.expense_budgets b
    JOIN ims.expenses e ON e.exp_id = b.exp_id
    WHERE p_budget_id IS NULL OR b.budget_id = p_budget_id;

    -- Ensure referenced expenses exist (repair orphaned budgets)
    INSERT INTO ims.expenses (exp_id, branch_id, name, user_id, created_at)
    SELECT t.exp_id, t.branch_id, 'Recovered for budget '||t.budget_id, p_user_id, p_reg_date
    FROM tmp_expense_budget t
    WHERE NOT EXISTS (SELECT 1 FROM ims.expenses e WHERE e.exp_id = t.exp_id);
    PERFORM setval(pg_get_serial_sequence('ims.expenses','exp_id'), (SELECT MAX(exp_id) FROM ims.expenses));

    CASE UPPER(p_oper)
      WHEN 'INSERT' THEN
        INSERT INTO ims.expense_charges (
            branch_id, exp_id, amount,
            charge_date, reg_date,
            note, ref_table, ref_id,
            exp_budget, budget_month, budget_year,
            user_id
        )
        SELECT
            t.branch_id,
            t.exp_id,
            t.fixed_amount,
            p_reg_date,
            p_reg_date,
            'Auto Budget Insert',
            'expense_budgets',
            t.budget_id,
            1,
            v_month,
            v_year,
            p_user_id
        FROM tmp_expense_budget t
        WHERE NOT EXISTS (
            SELECT 1 FROM ims.expense_charges c
            WHERE c.ref_table = 'expense_budgets'
              AND c.ref_id = t.budget_id
              AND c.budget_month = v_month
              AND c.budget_year  = v_year
              AND c.charge_date::date = p_reg_date::date
        );

      WHEN 'UPDATE' THEN
        UPDATE ims.expense_charges c
        SET amount = t.fixed_amount,
            user_id = p_user_id,
            reg_date = p_reg_date
        FROM tmp_expense_budget t
        WHERE c.ref_table = 'expense_budgets'
          AND c.ref_id = t.budget_id
          AND c.budget_month = v_month
          AND c.budget_year  = v_year;

      WHEN 'DELETE' THEN
        -- Fixed 2026-10-01: reverse GL before removing the charge (see header).
        UPDATE ims.accounts a
           SET balance = a.balance - rev.total_debit
          FROM (
            SELECT at.acc_id, SUM(at.debit) AS total_debit
              FROM ims.account_transactions at
              JOIN ims.expense_charges c
                ON c.charge_id = at.ref_id AND at.ref_table = 'expense_charges'
             WHERE at.debit > 0
               AND c.ref_table = 'expense_budgets'
               AND c.budget_month = v_month
               AND c.budget_year  = v_year
               AND c.ref_id IN (SELECT budget_id FROM tmp_expense_budget)
             GROUP BY at.acc_id
          ) rev
         WHERE a.acc_id = rev.acc_id;

        DELETE FROM ims.account_transactions at
         USING ims.expense_charges c
         WHERE at.ref_table = 'expense_charges'
           AND at.ref_id = c.charge_id
           AND c.ref_table = 'expense_budgets'
           AND c.budget_month = v_month
           AND c.budget_year  = v_year
           AND c.ref_id IN (SELECT budget_id FROM tmp_expense_budget);

        DELETE FROM ims.expense_charges c
        WHERE c.ref_table = 'expense_budgets'
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND c.ref_id IN (SELECT budget_id FROM tmp_expense_budget);

      WHEN 'SYNC' THEN
        -- Fixed 2026-10-01: reverse GL before dropping a charge whose budget
        -- no longer exists (see header) - same fix as DELETE above.
        UPDATE ims.accounts a
           SET balance = a.balance - rev.total_debit
          FROM (
            SELECT at.acc_id, SUM(at.debit) AS total_debit
              FROM ims.account_transactions at
              JOIN ims.expense_charges c
                ON c.charge_id = at.ref_id AND at.ref_table = 'expense_charges'
             WHERE at.debit > 0
               AND c.ref_table = 'expense_budgets'
               AND c.budget_month = v_month
               AND c.budget_year  = v_year
               AND NOT EXISTS (SELECT 1 FROM tmp_expense_budget t WHERE t.budget_id = c.ref_id)
             GROUP BY at.acc_id
          ) rev
         WHERE a.acc_id = rev.acc_id;

        DELETE FROM ims.account_transactions at
         USING ims.expense_charges c
         WHERE at.ref_table = 'expense_charges'
           AND at.ref_id = c.charge_id
           AND c.ref_table = 'expense_budgets'
           AND c.budget_month = v_month
           AND c.budget_year  = v_year
           AND NOT EXISTS (SELECT 1 FROM tmp_expense_budget t WHERE t.budget_id = c.ref_id);

        DELETE FROM ims.expense_charges c
        WHERE c.ref_table = 'expense_budgets'
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND NOT EXISTS (
            SELECT 1 FROM tmp_expense_budget t
            WHERE t.budget_id = c.ref_id
          );

        UPDATE ims.expense_charges c
        SET amount = t.fixed_amount,
            user_id = p_user_id
        FROM tmp_expense_budget t
        WHERE c.ref_table = 'expense_budgets'
          AND c.ref_id = t.budget_id
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND c.amount <> t.fixed_amount;

        INSERT INTO ims.expense_charges (
            branch_id, exp_id, amount,
            charge_date, reg_date,
            note, ref_table, ref_id,
            exp_budget, budget_month, budget_year,
            user_id
        )
        SELECT
            t.branch_id,
            t.exp_id,
            t.fixed_amount,
            p_reg_date,
            p_reg_date,
            'Auto Budget Sync',
            'expense_budgets',
            t.budget_id,
            1,
            v_month,
            v_year,
            p_user_id
        FROM tmp_expense_budget t
        WHERE NOT EXISTS (
            SELECT 1 FROM ims.expense_charges c
            WHERE c.ref_table = 'expense_budgets'
              AND c.ref_id = t.budget_id
              AND c.budget_month = v_month
              AND c.budget_year  = v_year
              AND c.charge_date::date = p_reg_date::date
        );
      ELSE
        RAISE EXCEPTION 'Invalid Operation. Use INSERT / UPDATE / DELETE / SYNC';
    END CASE;
END;
$$;

-- One-time cleanup: reverse any expense_charges GL postings already left
-- orphaned by the bug above (account_transactions row with no matching
-- expense_charges row at all - the hard-delete removed the charge but never
-- reversed its GL). Safe to re-run: once reversed, nothing matches the
-- NOT EXISTS condition and this is a no-op.
UPDATE ims.accounts a
   SET balance = a.balance - orphaned.total_debit
  FROM (
    SELECT at.acc_id, SUM(at.debit) AS total_debit
      FROM ims.account_transactions at
     WHERE at.ref_table = 'expense_charges'
       AND at.debit > 0
       AND NOT EXISTS (SELECT 1 FROM ims.expense_charges c WHERE c.charge_id = at.ref_id)
     GROUP BY at.acc_id
  ) orphaned
 WHERE a.acc_id = orphaned.acc_id;

DELETE FROM ims.account_transactions at
 WHERE at.ref_table = 'expense_charges'
   AND NOT EXISTS (SELECT 1 FROM ims.expense_charges c WHERE c.charge_id = at.ref_id);
