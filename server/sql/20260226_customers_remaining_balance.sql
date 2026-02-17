-- Add remaining_balance to customers for manual/opening balance input
SET search_path TO ims, public;

ALTER TABLE ims.customers
    ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ims.customers.remaining_balance IS 'Opening or remaining balance (amount customer owes)';
