-- Phase 11: the only genuinely missing product attribute from the Phase 12
-- Business Profile migration (20260916_business_profile.sql) - "strength"
-- (e.g. "500mg") for pharmacy products. Everything else Part 7 asks for
-- reuses existing columns: perfume "volume" -> size, cosmetics "shade" ->
-- color, pharmacy "dosage form" -> the existing unit/unit_id system (a unit
-- like "Tablet"/"Bottle"/"Vial" already models dosage form). Flat field,
-- same convention as size/color/generic_name - not a variant matrix.
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS strength VARCHAR(40);
