BEGIN;
SET search_path TO ims, public;

-- Core master data for stock module demos
INSERT INTO ims.categories (cat_name, description)
SELECT 'General Items', 'Default category for stock demo items'
WHERE NOT EXISTS (
  SELECT 1 FROM ims.categories WHERE LOWER(cat_name) = LOWER('General Items')
);

INSERT INTO ims.units (unit_name, symbol, is_active)
SELECT 'Piece', 'pcs', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM ims.units WHERE LOWER(unit_name) = LOWER('Piece')
);

INSERT INTO ims.suppliers (
  supplier_name,
  company_name,
  contact_person,
  contact_phone,
  phone,
  address,
  location,
  is_active
)
SELECT
  'Default Supplier',
  'KeydMaal Supply',
  'Procurement Desk',
  '+252-61-0000000',
  '+252-61-0000000',
  'Mogadishu',
  'Mogadishu',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM ims.suppliers WHERE LOWER(supplier_name) = LOWER('Default Supplier')
);

DO $$
DECLARE
  v_branch_id BIGINT;
BEGIN
  SELECT branch_id
    INTO v_branch_id
    FROM ims.branches
   WHERE LOWER(branch_name) = LOWER('Main Branch')
     AND (is_deleted IS NULL OR is_deleted = FALSE)
   LIMIT 1;

  IF v_branch_id IS NULL THEN
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'ims'
         AND table_name = 'branches'
         AND column_name = 'location'
    ) THEN
      EXECUTE
        'INSERT INTO ims.branches (branch_name, location, address, phone, is_active)
         VALUES ($1, $2, $2, $3, TRUE)
         RETURNING branch_id'
      INTO v_branch_id
      USING 'Main Branch', 'Mogadishu', '+252-61-1111111';
    ELSE
      INSERT INTO ims.branches (branch_name, address, phone, is_active)
      VALUES ('Main Branch', 'Mogadishu', '+252-61-1111111', TRUE)
      RETURNING branch_id INTO v_branch_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ims.warehouses
     WHERE branch_id = v_branch_id
       AND LOWER(wh_name) = LOWER('Main Warehouse')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
  ) THEN
    INSERT INTO ims.warehouses (branch_id, wh_name, location, is_active)
    VALUES (v_branch_id, 'Main Warehouse', 'Mogadishu', TRUE);
  END IF;
END $$;

WITH
  cat AS (
    SELECT cat_id
      FROM ims.categories
     WHERE LOWER(cat_name) = LOWER('General Items')
     LIMIT 1
  ),
  unit_sel AS (
    SELECT unit_id
      FROM ims.units
     WHERE LOWER(unit_name) = LOWER('Piece')
     LIMIT 1
  ),
  sup AS (
    SELECT supplier_id
      FROM ims.suppliers
     WHERE LOWER(supplier_name) = LOWER('Default Supplier')
     LIMIT 1
  ),
  vat AS (
    SELECT tax_id
      FROM ims.taxes
     WHERE LOWER(tax_name) = LOWER('VAT')
     LIMIT 1
  )
INSERT INTO ims.products (
  cat_id,
  supplier_id,
  unit_id,
  tax_id,
  name,
  barcode,
  reorder_level,
  reorder_qty,
  cost_price,
  sell_price,
  is_active
)
SELECT
  cat.cat_id,
  sup.supplier_id,
  unit_sel.unit_id,
  vat.tax_id,
  seeded.name,
  seeded.barcode,
  seeded.reorder_level,
  seeded.reorder_qty,
  seeded.cost_price,
  seeded.sell_price,
  TRUE
FROM (
  VALUES
    ('Rice 25KG', 'KD-ITEM-0001', 20::numeric, 40::numeric, 18.50::numeric, 24.00::numeric),
    ('Sugar 10KG', 'KD-ITEM-0002', 15::numeric, 30::numeric, 11.25::numeric, 15.50::numeric),
    ('Cooking Oil 5L', 'KD-ITEM-0003', 10::numeric, 20::numeric, 7.80::numeric, 10.90::numeric)
) AS seeded(name, barcode, reorder_level, reorder_qty, cost_price, sell_price)
CROSS JOIN cat
CROSS JOIN unit_sel
CROSS JOIN sup
LEFT JOIN vat ON TRUE
ON CONFLICT (barcode) DO UPDATE
SET
  name = EXCLUDED.name,
  cat_id = EXCLUDED.cat_id,
  supplier_id = EXCLUDED.supplier_id,
  unit_id = EXCLUDED.unit_id,
  tax_id = EXCLUDED.tax_id,
  reorder_level = EXCLUDED.reorder_level,
  reorder_qty = EXCLUDED.reorder_qty,
  cost_price = EXCLUDED.cost_price,
  sell_price = EXCLUDED.sell_price,
  is_active = TRUE;

WITH
  branch_sel AS (
    SELECT branch_id
      FROM ims.branches
     WHERE LOWER(branch_name) = LOWER('Main Branch')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  wh_sel AS (
    SELECT wh_id
      FROM ims.warehouses
     WHERE LOWER(wh_name) = LOWER('Main Warehouse')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  seeded AS (
    VALUES
      ('KD-ITEM-0001', 120::numeric),
      ('KD-ITEM-0002', 80::numeric),
      ('KD-ITEM-0003', 64::numeric)
  )
INSERT INTO ims.branch_stock (branch_id, product_id, quantity)
SELECT
  branch_sel.branch_id,
  p.product_id,
  seeded.column2
FROM seeded
JOIN ims.products p ON p.barcode = seeded.column1
CROSS JOIN branch_sel
ON CONFLICT (branch_id, product_id) DO UPDATE
SET quantity = EXCLUDED.quantity;

WITH
  branch_sel AS (
    SELECT branch_id
      FROM ims.branches
     WHERE LOWER(branch_name) = LOWER('Main Branch')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  wh_sel AS (
    SELECT wh_id
      FROM ims.warehouses
     WHERE LOWER(wh_name) = LOWER('Main Warehouse')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  seeded AS (
    VALUES
      ('KD-ITEM-0001', 120::numeric),
      ('KD-ITEM-0002', 80::numeric),
      ('KD-ITEM-0003', 64::numeric)
  )
INSERT INTO ims.warehouse_stock (wh_id, product_id, quantity)
SELECT
  wh_sel.wh_id,
  p.product_id,
  seeded.column2
FROM seeded
JOIN ims.products p ON p.barcode = seeded.column1
CROSS JOIN wh_sel
ON CONFLICT (wh_id, product_id) DO UPDATE
SET quantity = EXCLUDED.quantity;

WITH
  branch_sel AS (
    SELECT branch_id
      FROM ims.branches
     WHERE LOWER(branch_name) = LOWER('Main Branch')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  wh_sel AS (
    SELECT wh_id
      FROM ims.warehouses
     WHERE LOWER(wh_name) = LOWER('Main Warehouse')
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     LIMIT 1
  ),
  seeded AS (
    VALUES
      ('KD-ITEM-0001', 120::numeric, 18.50::numeric),
      ('KD-ITEM-0002', 80::numeric, 11.25::numeric),
      ('KD-ITEM-0003', 64::numeric, 7.80::numeric)
  )
INSERT INTO ims.inventory_movements (
  branch_id,
  wh_id,
  product_id,
  move_type,
  ref_table,
  ref_id,
  qty_in,
  qty_out,
  unit_cost,
  note
)
SELECT
  branch_sel.branch_id,
  wh_sel.wh_id,
  p.product_id,
  'opening',
  'seed_stock_opening',
  p.product_id,
  seeded.column2,
  0,
  seeded.column3,
  'Seed opening balance'
FROM seeded
JOIN ims.products p ON p.barcode = seeded.column1
CROSS JOIN branch_sel
CROSS JOIN wh_sel
WHERE NOT EXISTS (
  SELECT 1
    FROM ims.inventory_movements m
   WHERE m.ref_table = 'seed_stock_opening'
     AND m.ref_id = p.product_id
);

DO $$
DECLARE
  v_branch_id BIGINT;
  v_wh_id BIGINT;
  v_user_id BIGINT;
BEGIN
  SELECT branch_id INTO v_branch_id
    FROM ims.branches
   WHERE LOWER(branch_name) = LOWER('Main Branch')
   LIMIT 1;

  SELECT wh_id INTO v_wh_id
    FROM ims.warehouses
   WHERE LOWER(wh_name) = LOWER('Main Warehouse')
   LIMIT 1;

  SELECT user_id INTO v_user_id FROM ims.users ORDER BY user_id LIMIT 1;

  IF v_branch_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ims.stock_adjustments WHERE note = 'Seed: manual stock adjustment'
  ) THEN
    INSERT INTO ims.stock_adjustments (branch_id, wh_id, user_id, reason, note)
    VALUES (v_branch_id, v_wh_id, v_user_id, 'Manual Adjustment', 'Seed: manual stock adjustment');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ims.stock_adjustments WHERE note = 'Seed: stock recount'
  ) THEN
    INSERT INTO ims.stock_adjustments (branch_id, wh_id, user_id, reason, note)
    VALUES (v_branch_id, v_wh_id, v_user_id, 'Stock Recount', 'Seed: stock recount');
  END IF;
END $$;

COMMIT;
