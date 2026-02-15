BEGIN;
SET search_path TO ims, public;

ALTER TABLE ims.purchase_items DISABLE TRIGGER USER;

DO $$
DECLARE
  rec RECORD;
  v_product_id BIGINT;
  v_cat_id BIGINT;
BEGIN
  FOR rec IN
    SELECT
      pi.purchase_item_id,
      pu.branch_id,
      pu.supplier_id,
      BTRIM(pi.description) AS item_name,
      COALESCE(pi.unit_cost, 0) AS unit_cost
    FROM ims.purchase_items pi
    JOIN ims.purchases pu ON pu.purchase_id = pi.purchase_id
    WHERE pi.product_id IS NULL
      AND COALESCE(BTRIM(pi.description), '') <> ''
  LOOP
    v_product_id := NULL;
    v_cat_id := NULL;

    SELECT p.product_id
      INTO v_product_id
    FROM ims.products p
    WHERE p.branch_id = rec.branch_id
      AND LOWER(p.name) = LOWER(rec.item_name)
      AND (p.is_deleted IS NULL OR p.is_deleted = FALSE)
    ORDER BY p.product_id DESC
    LIMIT 1;

    IF v_product_id IS NULL THEN
      SELECT c.cat_id
        INTO v_cat_id
      FROM ims.categories c
      WHERE c.branch_id = rec.branch_id
      ORDER BY COALESCE(c.category_id, c.cat_id)
      LIMIT 1;

      IF v_cat_id IS NULL THEN
        SELECT c.cat_id
          INTO v_cat_id
        FROM ims.categories c
        ORDER BY COALESCE(c.category_id, c.cat_id)
        LIMIT 1;
      END IF;

      INSERT INTO ims.products
        (branch_id, cat_id, category_id, supplier_id, name, cost_price, sell_price, cost, price, is_active)
      VALUES
        (rec.branch_id, v_cat_id, v_cat_id, rec.supplier_id, rec.item_name, rec.unit_cost, rec.unit_cost, rec.unit_cost, rec.unit_cost, TRUE)
      RETURNING product_id INTO v_product_id;
    END IF;

    UPDATE ims.purchase_items
       SET product_id = v_product_id,
           sale_price = COALESCE(sale_price, rec.unit_cost)
     WHERE purchase_item_id = rec.purchase_item_id;
  END LOOP;
END $$;

ALTER TABLE ims.purchase_items ENABLE TRIGGER USER;

COMMIT;
