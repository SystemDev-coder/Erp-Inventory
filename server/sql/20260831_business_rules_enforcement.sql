-- Business rules enforcement: credit_allowed, credit_days on customers
-- Safe to run multiple times.

ALTER TABLE ims.customers ADD COLUMN IF NOT EXISTS credit_allowed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ims.customers ADD COLUMN IF NOT EXISTS credit_days INTEGER NOT NULL DEFAULT 30;

-- Walk-in customers never get credit by default
UPDATE ims.customers
   SET credit_allowed = FALSE
 WHERE customer_type = 'one-time';

-- Regular customers default to credit allowed
UPDATE ims.customers
   SET credit_allowed = TRUE
 WHERE customer_type = 'regular'
   AND credit_allowed IS DISTINCT FROM TRUE;

COMMENT ON COLUMN ims.customers.credit_allowed IS 'When false, customer may only pay cash/instant. Regular customers default true.';
COMMENT ON COLUMN ims.customers.credit_days IS 'Payment due period in days for credit sales.';
