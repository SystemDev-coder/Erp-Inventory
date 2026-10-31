-- M10 fix: ims.sp_charge_salary always used ims.employees.salary_amount (the
-- employee's CURRENT salary) when building a payroll line, regardless of
-- which period was being charged. ims.employee_salary already records
-- effective-dated salary history correctly (employees.service.ts#update
-- closes out the previous row's end_date and opens a new one on every real
-- change) - charging just never consulted it. A late or re-run charge for an
-- old period would silently use today's salary instead of the amount that
-- was actually in effect during that period.
--
-- Fix: look up the employee_salary row effective as of the first day of the
-- period being charged (start_date <= period start, end_date NULL or >=
-- period start), falling back to employees.salary_amount when no history
-- row exists for that employee yet (e.g. seeded directly, or never updated
-- since salary tracking began) - preserving today's behavior for those.
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
    v_period_start DATE := date_trunc('month', p_period_date)::date;
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
        VALUES (r_branch.branch_id, p_user_id, v_year, v_month, v_period_start, (v_period_start + INTERVAL '1 month - 1 day')::date, 'Auto salary charge')
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
            COALESCE(es.basic_salary, e.salary_amount),
            0,
            0,
            COALESCE(es.basic_salary, e.salary_amount),
            'Auto salary charge'
        FROM ims.employees e
        LEFT JOIN LATERAL (
            SELECT basic_salary
              FROM ims.employee_salary
             WHERE emp_id = e.emp_id
               AND is_deleted = 0
               AND start_date <= v_period_start
               AND (end_date IS NULL OR end_date >= v_period_start)
             ORDER BY start_date DESC, emp_salary_id DESC
             LIMIT 1
        ) es ON TRUE
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
