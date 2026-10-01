-- Phase 9: Electronics business profile + centralized Dynamic Product
-- Attributes system.
--
-- Two new columns only - everything the Phase 11 flat-column convention
-- already covers (brand/color/size/generic_name/strength/serial_number)
-- keeps using those real columns; this only adds storage for attribute
-- keys that have no existing column, and a way for each CATEGORY (not just
-- each business type) to say which attribute keys its items use.
--
--   - ims.items.attributes JSONB: holds any attribute key from the shared
--     catalog (server/src/config/productAttributes.ts) with no matching
--     existing column - model, storage, ram, processor, screen_size,
--     battery, imei, connectivity, material, network_type, ...
--   - ims.categories.attribute_keys TEXT[]: which attribute-catalog keys
--     apply to items in this category, e.g. "Mobile Phones" vs "TVs" vs
--     "Networking Devices" under the same Electronics business profile
--     each show only the fields they actually need.

ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_items_attributes ON ims.items USING gin (attributes);

ALTER TABLE ims.categories ADD COLUMN IF NOT EXISTS attribute_keys TEXT[] NOT NULL DEFAULT '{}'::text[];
