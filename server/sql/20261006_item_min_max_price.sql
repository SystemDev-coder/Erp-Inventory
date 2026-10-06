-- Optional per-product price band: lets a cashier edit a sale line's unit
-- price within [min_price, max_price] instead of being stuck with sell_price.
-- Both nullable - a product with neither set keeps today's unrestricted
-- behavior. Enforced authoritatively in sales.service.ts#prepareSaleItems.
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS min_price NUMERIC(14,2);
ALTER TABLE ims.items ADD COLUMN IF NOT EXISTS max_price NUMERIC(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_items_min_max_price'
  ) THEN
    ALTER TABLE ims.items ADD CONSTRAINT chk_items_min_max_price
      CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price);
  END IF;
END $$;
