BEGIN;
SET search_path TO ims, public;

ALTER TABLE IF EXISTS ims.purchase_items
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2);

UPDATE ims.purchase_items pi
   SET sale_price = COALESCE(pi.sale_price, pr.price, pr.sell_price, pi.unit_cost, 0)
  FROM ims.products pr
 WHERE pr.product_id = pi.product_id
   AND pi.sale_price IS NULL;

COMMIT;
