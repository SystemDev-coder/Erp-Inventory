-- Replace the customer-facing credit-days default with an optional, exact
-- credit deadline. Existing customer and sale data is retained unchanged.
BEGIN;

ALTER TABLE ims.customers
  ADD COLUMN IF NOT EXISTS credit_due_at TIMESTAMPTZ;

-- Older deployments created sales.due_date as DATE. Preserve every existing
-- due calendar day by converting it to midnight UTC; all newly-entered credit
-- deadlines retain their selected time.
DO $$
DECLARE
  due_date_type TEXT;
BEGIN
  SELECT data_type
    INTO due_date_type
    FROM information_schema.columns
   WHERE table_schema = 'ims'
     AND table_name = 'sales'
     AND column_name = 'due_date';

  IF due_date_type IS NULL THEN
    ALTER TABLE ims.sales ADD COLUMN due_date TIMESTAMPTZ;
  ELSIF due_date_type = 'date' THEN
    ALTER TABLE ims.sales
      ALTER COLUMN due_date TYPE TIMESTAMPTZ
      USING due_date::timestamp AT TIME ZONE 'UTC';
  ELSIF due_date_type = 'timestamp without time zone' THEN
    ALTER TABLE ims.sales
      ALTER COLUMN due_date TYPE TIMESTAMPTZ
      USING due_date AT TIME ZONE 'UTC';
  END IF;
END
$$;

COMMENT ON COLUMN ims.customers.credit_due_at IS
  'Optional default date and time for future credit-sale payment deadlines.';
COMMENT ON COLUMN ims.sales.due_date IS
  'Exact payment deadline for a credit sale. Legacy date-only rows represent midnight UTC.';

COMMIT;
