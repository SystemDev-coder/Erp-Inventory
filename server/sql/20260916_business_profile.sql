-- Business Profile: business identity + business type + feature-toggle configuration
-- (Product/Inventory, Sales, Purchase, Accounting, Branch, Receipt, Notification config)
-- that other modules read to adapt their fields/behavior per business type.
-- ims.company is already the singleton config row (company_id = 1); reuse it instead
-- of a new table.
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS business_type VARCHAR(30);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS country VARCHAR(80);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS timezone VARCHAR(60);
ALTER TABLE ims.company ADD COLUMN IF NOT EXISTS business_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Simple descriptive product attributes (Clothing: size/color; Pharmacy: generic name;
-- Electronics/Appliances: serial number). Flat fields on the product, not a variant
-- matrix - one stock/barcode/price per product, same as the existing `brand` column.
-- Batch/expiry tracking reuses the existing ims.purchase_items.batch_no/expiry_date
-- columns rather than duplicating them here.
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS size VARCHAR(40);
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS color VARCHAR(40);
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS serial_number VARCHAR(80);
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS generic_name VARCHAR(160);
