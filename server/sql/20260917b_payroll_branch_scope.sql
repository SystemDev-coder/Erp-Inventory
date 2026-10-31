-- M09 fix: ims.sp_charge_salary previously took no branch parameter and looped
-- over every branch with active employees unconditionally, so a non-admin
-- user scoped to a single branch (but holding the payroll.process permission)
-- could trigger real payroll_runs/payroll_lines creation for every OTHER
-- branch in the system just by calling "charge salaries" for their own
-- branch. Adding an optional p_branch_ids filter (NULL = every branch,
-- preserving the exact old behavior for true admin/global calls) lets the
-- caller restrict the loop to only the branches it's actually scoped to.
DROP FUNCTION IF EXISTS ims.sp_charge_salary(timestamptz, bigint);

CREATE OR REPLACE FUNCTION ims.sp_charge_salary(
  p_period_date timestamptz,
  p_user_id bigint,
  p_branch_ids bigint[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    v_month INT := EXTRACT(MONTH FROM p_period_date);
    v_year  INT := EXTRACT(YEAR  FROM p_period_date);
    v_created INT := 0;
    v_run_id BIGINT;
    v_last INT := 0;
    r_branch RECORD;
BEGIN
    FOR r_branch IN
        SELECT DISTINCT branch_id FROM ims.employees
         WHERE status = 'active'
           AND (p_branch_ids IS NULL OR branch_id = ANY(p_branch_ids))
    LOOP
        INSERT INTO ims.payroll_runs (branch_id, created_by, period_year, period_month, period_from, period_to, note)
        VALUES (r_branch.branch_id, p_user_id, v_year, v_month, date_trunc('month', p_period_date)::date, (date_trunc('month', p_period_date) + INTERVAL '1 month - 1 day')::date, 'Auto salary charge')
        ON CONFLICT (branch_id, period_year, period_month)
        DO UPDATE SET note = EXCLUDED.note
        RETURNING payroll_id INTO v_run_id;

        INSERT INTO ims.payroll_lines (
            branch_id, payroll_id, emp_id, basic_salary, allowances, deductions, net_salary, note
        )
        SELECT
            e.branch_id,
            v_run_id,
            e.emp_id,
            e.salary_amount,
            0,
            0,
            e.salary_amount,
            'Auto salary charge'
        FROM ims.employees e
        WHERE e.branch_id = r_branch.branch_id
          AND e.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM ims.payroll_lines pl
              WHERE pl.branch_id = e.branch_id
                AND pl.payroll_id = v_run_id
                AND pl.emp_id = e.emp_id
            );

        GET DIAGNOSTICS v_last = ROW_COUNT;
        v_created := v_created + v_last;
    END LOOP;

    RETURN v_created;
END;
$function$;
