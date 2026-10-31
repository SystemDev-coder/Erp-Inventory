-- "Liability Payments" only ever paid a balance down. There was no way to *increase* a
-- liability (e.g. recording a Note Payable - a loan the business took on). The
-- ims.liability_payments row shape (a liability account, a counterpart cash account,
-- amount, date, reference, note) is identical either way - only which side gets debited
-- vs credited differs - so this is a direction column on the same table, not a new one.
ALTER TABLE ims.liability_payments
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'payment';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_liability_payment_direction'
  ) THEN
    ALTER TABLE ims.liability_payments
      ADD CONSTRAINT chk_liability_payment_direction CHECK (direction IN ('payment', 'borrow'));
  END IF;
END
$$;
