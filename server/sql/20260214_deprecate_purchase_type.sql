-- Keep legacy column but no longer required by API
ALTER TABLE ims.purchases ALTER COLUMN purchase_type DROP NOT NULL;
