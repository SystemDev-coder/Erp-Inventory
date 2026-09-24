-- ims.suppliers is missing the (branch_id, name) unique constraint that
-- ims.categories (uq_category_branch_name) and ims.units (uq_units_branch_name)
-- already have. Without it, the generic import-resolution upsert
-- (ON CONFLICT (branch_id, name) DO UPDATE ...) used for auto-creating
-- suppliers by name during Excel import has no constraint to target and
-- fails outright. Confirmed no existing duplicate (branch_id, lower(name))
-- rows before adding this.
ALTER TABLE ims.suppliers
  ADD CONSTRAINT uq_supplier_branch_name UNIQUE (branch_id, name);
