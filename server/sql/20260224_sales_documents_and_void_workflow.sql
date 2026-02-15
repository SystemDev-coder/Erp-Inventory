BEGIN;
SET search_path TO ims, public;

-- Add document/payment workflow columns on sales.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'doc_type'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN doc_type VARCHAR(20) NOT NULL DEFAULT 'sale';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'quote_valid_until'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN quote_valid_until DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'pay_acc_id'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN pay_acc_id BIGINT REFERENCES ims.accounts(acc_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'is_stock_applied'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN is_stock_applied BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'voided_at'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN voided_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'sales'
       AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE ims.sales
      ADD COLUMN void_reason TEXT;
  END IF;
END$$;

UPDATE ims.sales
   SET doc_type = COALESCE(NULLIF(doc_type, ''), 'sale'),
       paid_amount = GREATEST(COALESCE(paid_amount, 0), 0),
       is_stock_applied = CASE
         WHEN COALESCE(doc_type, 'sale') = 'quotation' THEN FALSE
         WHEN status = 'void' THEN FALSE
         ELSE COALESCE(is_stock_applied, TRUE)
       END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_sales_doc_type'
       AND conrelid = 'ims.sales'::regclass
  ) THEN
    ALTER TABLE ims.sales
      ADD CONSTRAINT chk_sales_doc_type
      CHECK (doc_type IN ('sale', 'invoice', 'quotation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_sales_paid_amount'
       AND conrelid = 'ims.sales'::regclass
  ) THEN
    ALTER TABLE ims.sales
      ADD CONSTRAINT chk_sales_paid_amount
      CHECK (paid_amount >= 0);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_sales_doc_type_status ON ims.sales(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_sales_pay_acc ON ims.sales(pay_acc_id);

-- Prevent zero delta movement inserts for safety.
CREATE OR REPLACE FUNCTION ims.fn_apply_stock_move(
  p_branch_id BIGINT,
  p_wh_id BIGINT,
  p_product_id BIGINT,
  p_qty_delta NUMERIC,
  p_move_type ims.movement_type_enum,
  p_ref_table VARCHAR,
  p_ref_id BIGINT,
  p_unit_cost NUMERIC DEFAULT 0,
  p_prevent_negative BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
DECLARE
  v_current NUMERIC;
BEGIN
  IF p_product_id IS NULL OR COALESCE(p_qty_delta, 0) = 0 THEN
    RETURN;
  END IF;

  IF p_wh_id IS NOT NULL THEN
    INSERT INTO ims.warehouse_stock (wh_id, product_id, quantity)
    VALUES (p_wh_id, p_product_id, 0)
    ON CONFLICT (wh_id, product_id) DO NOTHING;

    SELECT quantity
      INTO v_current
      FROM ims.warehouse_stock
     WHERE wh_id = p_wh_id
       AND product_id = p_product_id
     FOR UPDATE;

    IF p_prevent_negative AND COALESCE(v_current, 0) + p_qty_delta < 0 THEN
      RAISE EXCEPTION
        'Insufficient stock in warehouse % for product % (current %, delta %)',
        p_wh_id, p_product_id, COALESCE(v_current, 0), p_qty_delta;
    END IF;

    UPDATE ims.warehouse_stock
       SET quantity = COALESCE(quantity, 0) + p_qty_delta
     WHERE wh_id = p_wh_id
       AND product_id = p_product_id;
  END IF;

  INSERT INTO ims.branch_stock (branch_id, product_id, quantity)
  VALUES (p_branch_id, p_product_id, 0)
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  SELECT quantity
    INTO v_current
    FROM ims.branch_stock
   WHERE branch_id = p_branch_id
     AND product_id = p_product_id
   FOR UPDATE;

  IF p_prevent_negative AND COALESCE(v_current, 0) + p_qty_delta < 0 THEN
    RAISE EXCEPTION
      'Insufficient branch stock for product % (current %, delta %)',
      p_product_id, COALESCE(v_current, 0), p_qty_delta;
  END IF;

  UPDATE ims.branch_stock
     SET quantity = COALESCE(quantity, 0) + p_qty_delta
   WHERE branch_id = p_branch_id
     AND product_id = p_product_id;

  INSERT INTO ims.inventory_movements (
    branch_id,
    wh_id,
    product_id,
    move_type,
    ref_table,
    ref_id,
    qty_in,
    qty_out,
    unit_cost
  ) VALUES (
    p_branch_id,
    p_wh_id,
    p_product_id,
    p_move_type,
    p_ref_table,
    p_ref_id,
    GREATEST(p_qty_delta, 0),
    GREATEST(-p_qty_delta, 0),
    COALESCE(p_unit_cost, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- Make sales trigger aware of quotations / voided documents.
CREATE OR REPLACE FUNCTION ims.fn_sale_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_sale ims.sales%ROWTYPE;
  v_branch BIGINT;
  v_wh BIGINT;
  v_qty NUMERIC;
  v_cost NUMERIC;
BEGIN
  SELECT *
    INTO v_sale
    FROM ims.sales
   WHERE sale_id = COALESCE(NEW.sale_id, OLD.sale_id)
   LIMIT 1;
  IF v_sale.sale_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF COALESCE(v_sale.doc_type, 'sale') = 'quotation'
     OR COALESCE(v_sale.status::text, '') = 'void'
     OR COALESCE(v_sale.is_stock_applied, TRUE) = FALSE THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_branch := v_sale.branch_id;
  v_wh := v_sale.wh_id;

  IF TG_OP = 'DELETE' THEN
    v_qty := OLD.quantity;
    IF COALESCE(v_qty, 0) = 0 THEN
      RETURN OLD;
    END IF;
    v_cost := (SELECT cost_price FROM ims.products WHERE product_id = OLD.product_id);
    PERFORM ims.fn_apply_stock_move(
      v_branch,
      v_wh,
      OLD.product_id,
      v_qty,
      'sales_return',
      'sale_items',
      OLD.sale_item_id,
      v_cost,
      FALSE
    );
    RETURN OLD;
  END IF;

  v_qty := -1 * (COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0));
  IF COALESCE(v_qty, 0) = 0 THEN
    RETURN NEW;
  END IF;
  v_cost := (
    SELECT cost_price
      FROM ims.products
     WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
  );
  PERFORM ims.fn_apply_stock_move(
    v_branch,
    v_wh,
    COALESCE(NEW.product_id, OLD.product_id),
    v_qty,
    'sale',
    'sale_items',
    COALESCE(NEW.sale_item_id, OLD.sale_item_id),
    v_cost,
    TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_stock ON ims.sale_items;
CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.sale_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_sale_items_stock();

COMMIT;
