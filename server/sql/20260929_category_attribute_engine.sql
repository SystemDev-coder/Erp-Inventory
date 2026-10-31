-- Category Configuration Engine (Products/Items scope): moves the
-- previously hardcoded PRODUCT_ATTRIBUTE_CATALOG (server/src/config/
-- productAttributes.ts) into the database (ims.attribute_definitions),
-- and replaces the meaning of categories.attribute_keys with a real join
-- table (ims.category_attributes), so a brand-new attribute type or a new
-- sub-category can be created from the ERP UI with no code change.
-- categories.attribute_keys is kept (not dropped) for rollback safety -
-- dropped only in a later follow-up migration once the code cutover is
-- confirmed working.
--
-- is_deleted/deleted_at/RLS for the two new tables are added automatically
-- by entrypoint.sh's runtime-fixes loop on deploy (same as every other new
-- table this session, e.g. ims.liability_payments) - not hand-written here.

-- 1. Category hierarchy (subcategories)
ALTER TABLE ims.categories
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL REFERENCES ims.categories(cat_id) ON UPDATE CASCADE ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_categories_parent_not_self'
  ) THEN
    ALTER TABLE ims.categories
      ADD CONSTRAINT chk_categories_parent_not_self CHECK (parent_id IS NULL OR parent_id <> cat_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON ims.categories(parent_id) WHERE parent_id IS NOT NULL;

-- 2. Attribute definitions - replaces the hardcoded catalog, branch-scoped
-- like every other config table (categories, units, suppliers).
CREATE TABLE IF NOT EXISTS ims.attribute_definitions (
  attribute_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  key VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL,
  data_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (data_type IN ('text', 'number', 'select', 'date')),
  options JSONB NULL,
  -- Legacy-column mapping (brand/color/size/generic_name/strength/serial_number)
  -- - system-seeded only, never admin-editable. A new admin-created attribute
  -- always has column_name = NULL and stores its values in items.attributes JSONB.
  column_name VARCHAR(30) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_attribute_definitions_branch_key UNIQUE (branch_id, key)
);

DROP TRIGGER IF EXISTS trg_audit_all_tables ON ims.attribute_definitions;
CREATE TRIGGER trg_audit_all_tables AFTER INSERT OR DELETE OR UPDATE ON ims.attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION ims.fn_audit_all_tables();

-- 3. Category <-> Attribute join - replaces categories.attribute_keys TEXT[]
-- with real referential integrity plus per-category required/order metadata.
CREATE TABLE IF NOT EXISTS ims.category_attributes (
  category_attribute_id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES ims.categories(cat_id) ON UPDATE CASCADE ON DELETE CASCADE,
  attribute_id BIGINT NOT NULL REFERENCES ims.attribute_definitions(attribute_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_category_attributes_category_attribute UNIQUE (category_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_category_attributes_category ON ims.category_attributes(category_id);
CREATE INDEX IF NOT EXISTS idx_category_attributes_attribute ON ims.category_attributes(attribute_id);

DROP TRIGGER IF EXISTS trg_audit_all_tables ON ims.category_attributes;
CREATE TRIGGER trg_audit_all_tables AFTER INSERT OR DELETE OR UPDATE ON ims.category_attributes
  FOR EACH ROW EXECUTE FUNCTION ims.fn_audit_all_tables();

-- 4. Backfill: seed the 17 previously-hardcoded catalog entries per branch,
-- so every existing category keeps working exactly as before the cutover.
INSERT INTO ims.attribute_definitions (branch_id, key, label, data_type, options, column_name)
SELECT b.branch_id, d.key, d.label, d.data_type, d.options, d.column_name
FROM ims.branches b
CROSS JOIN (
  VALUES
    ('brand', 'Brand', 'text', NULL::jsonb, 'brand'),
    ('model', 'Model', 'text', NULL::jsonb, NULL),
    ('color', 'Color', 'text', NULL::jsonb, 'color'),
    ('size', 'Size', 'text', NULL::jsonb, 'size'),
    ('storage', 'Storage', 'text', NULL::jsonb, NULL),
    ('ram', 'RAM', 'text', NULL::jsonb, NULL),
    ('processor', 'Processor', 'text', NULL::jsonb, NULL),
    ('screen_size', 'Screen Size', 'text', NULL::jsonb, NULL),
    ('battery', 'Battery', 'text', NULL::jsonb, NULL),
    ('connectivity', 'Connectivity', 'text', NULL::jsonb, NULL),
    ('network_type', 'Network Type', 'select', '["2G","3G","4G","5G","Wi-Fi Only"]'::jsonb, NULL),
    ('material', 'Material', 'text', NULL::jsonb, NULL),
    ('warranty', 'Warranty', 'text', NULL::jsonb, NULL),
    ('serial_number', 'Serial Number', 'text', NULL::jsonb, 'serial_number'),
    ('imei', 'IMEI', 'text', NULL::jsonb, NULL),
    ('generic_name', 'Generic Name', 'text', NULL::jsonb, 'generic_name'),
    ('strength', 'Strength', 'text', NULL::jsonb, 'strength')
) AS d(key, label, data_type, options, column_name)
ON CONFLICT (branch_id, key) DO NOTHING;

-- 5. Backfill: expand every existing category's attribute_keys array into
-- matching category_attributes rows.
INSERT INTO ims.category_attributes (category_id, attribute_id, display_order)
SELECT c.cat_id, ad.attribute_id, k.ord
FROM ims.categories c
CROSS JOIN LATERAL unnest(c.attribute_keys) WITH ORDINALITY AS k(key, ord)
JOIN ims.attribute_definitions ad ON ad.branch_id = c.branch_id AND ad.key = k.key
ON CONFLICT (category_id, attribute_id) DO NOTHING;
