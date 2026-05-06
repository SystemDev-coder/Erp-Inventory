-- NEW: Allow duplicate customer phone numbers and supplier names (per user request).
-- This migration is idempotent and safe to run multiple times.

ALTER TABLE ims.customers
  DROP CONSTRAINT IF EXISTS uq_customer_branch_phone;

ALTER TABLE ims.suppliers
  DROP CONSTRAINT IF EXISTS uq_supplier_branch_name;

