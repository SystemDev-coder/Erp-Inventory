-- Link items to the already-existing categories/units master tables. Nullable at the DB
-- level (existing items keep working with no category/unit) - the "Add New Item" form is
-- what makes these required for items created going forward.
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES ims.categories(cat_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS unit_id BIGINT REFERENCES ims.units(unit_id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_category ON ims.items(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_unit ON ims.items(unit_id) WHERE unit_id IS NOT NULL;
