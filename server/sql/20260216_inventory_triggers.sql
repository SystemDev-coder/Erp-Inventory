-- Inventory triggers and soft delete support
BEGIN;

-- Soft delete columns
DO $$
BEGIN
  PERFORM 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='products' AND column_name='is_deleted';
  IF NOT FOUND THEN
    ALTER TABLE ims.products
      ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='warehouses' AND column_name='is_deleted';
  IF NOT FOUND THEN
    ALTER TABLE ims.warehouses
      ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='branches' AND column_name='is_deleted';
  IF NOT FOUND THEN
    ALTER TABLE ims.branches
      ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='warehouse_stock' AND column_name='is_deleted';
  IF NOT FOUND THEN
    ALTER TABLE ims.warehouse_stock
      ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='branch_stock' AND column_name='is_deleted';
  IF NOT FOUND THEN
    ALTER TABLE ims.branch_stock
      ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END$$;

-- Apply stock move helper
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
  IF p_wh_id IS NOT NULL THEN
    INSERT INTO ims.warehouse_stock (wh_id, product_id, quantity)
    VALUES (p_wh_id, p_product_id, 0)
    ON CONFLICT (wh_id, product_id) DO NOTHING;

    SELECT quantity INTO v_current FROM ims.warehouse_stock WHERE wh_id=p_wh_id AND product_id=p_product_id FOR UPDATE;

    IF p_prevent_negative AND v_current + p_qty_delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock in warehouse % for product % (current %, delta %)', p_wh_id, p_product_id, v_current, p_qty_delta;
    END IF;

    UPDATE ims.warehouse_stock
      SET quantity = quantity + p_qty_delta
    WHERE wh_id=p_wh_id AND product_id=p_product_id;
  END IF;

  INSERT INTO ims.branch_stock (branch_id, product_id, quantity)
  VALUES (p_branch_id, p_product_id, 0)
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  SELECT quantity INTO v_current FROM ims.branch_stock WHERE branch_id=p_branch_id AND product_id=p_product_id FOR UPDATE;

  IF p_prevent_negative AND v_current + p_qty_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient branch stock for product % (current %, delta %)', p_product_id, v_current, p_qty_delta;
  END IF;

  UPDATE ims.branch_stock
    SET quantity = quantity + p_qty_delta
  WHERE branch_id=p_branch_id AND product_id=p_product_id;

  INSERT INTO ims.inventory_movements (
    branch_id, wh_id, product_id, move_type, ref_table, ref_id,
    qty_in, qty_out, unit_cost
  ) VALUES (
    p_branch_id, p_wh_id, p_product_id, p_move_type, p_ref_table, p_ref_id,
    GREATEST(p_qty_delta,0), GREATEST(-p_qty_delta,0), p_unit_cost
  );
END;
$$ LANGUAGE plpgsql;

-- helper: warehouse branch
CREATE OR REPLACE FUNCTION ims.fn_wh_branch(p_wh_id BIGINT) RETURNS BIGINT AS $$
DECLARE b BIGINT;
BEGIN
  SELECT branch_id INTO b FROM ims.warehouses WHERE wh_id=p_wh_id AND (is_deleted IS NULL OR is_deleted=FALSE);
  RETURN b;
END;
$$ LANGUAGE plpgsql;

-- Purchase items trigger
CREATE OR REPLACE FUNCTION ims.fn_purchase_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_branch BIGINT;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_branch := (SELECT branch_id FROM ims.purchases WHERE purchase_id=OLD.purchase_id);
    v_qty := -OLD.quantity;
    v_unit_cost := OLD.unit_cost;
    PERFORM ims.fn_apply_stock_move(v_branch, (SELECT wh_id FROM ims.purchases WHERE purchase_id=OLD.purchase_id), OLD.product_id, v_qty, 'purchase_return', 'purchase_items', OLD.purchase_item_id, v_unit_cost, TRUE);
    RETURN OLD;
  ELSE
    v_branch := (SELECT branch_id FROM ims.purchases WHERE purchase_id=COALESCE(NEW.purchase_id, OLD.purchase_id));
    v_qty := COALESCE(NEW.quantity,0) - COALESCE(OLD.quantity,0);
    v_unit_cost := COALESCE(NEW.unit_cost, OLD.unit_cost, 0);
    PERFORM ims.fn_apply_stock_move(v_branch, (SELECT wh_id FROM ims.purchases WHERE purchase_id=COALESCE(NEW.purchase_id, OLD.purchase_id)), COALESCE(NEW.product_id, OLD.product_id), v_qty, 'purchase', 'purchase_items', COALESCE(NEW.purchase_item_id, OLD.purchase_item_id), v_unit_cost, FALSE);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_items_stock ON ims.purchase_items;
CREATE TRIGGER trg_purchase_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.purchase_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_purchase_items_stock();

-- Sale items trigger
CREATE OR REPLACE FUNCTION ims.fn_sale_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_sale ims.sales%ROWTYPE;
  v_branch BIGINT;
  v_wh BIGINT;
  v_qty NUMERIC;
  v_cost NUMERIC;
BEGIN
  v_sale := (SELECT * FROM ims.sales WHERE sale_id = COALESCE(NEW.sale_id, OLD.sale_id));
  v_branch := v_sale.branch_id;
  v_wh := v_sale.wh_id;
  IF TG_OP = 'DELETE' THEN
    v_qty := OLD.quantity;
    v_cost := (SELECT cost_price FROM ims.products WHERE product_id=OLD.product_id);
    PERFORM ims.fn_apply_stock_move(v_branch, v_wh, OLD.product_id, v_qty, 'sales_return', 'sale_items', OLD.sale_item_id, v_cost, FALSE);
    RETURN OLD;
  ELSE
    v_qty := -1 * (COALESCE(NEW.quantity,0) - COALESCE(OLD.quantity,0));
    v_cost := (SELECT cost_price FROM ims.products WHERE product_id=COALESCE(NEW.product_id, OLD.product_id));
    PERFORM ims.fn_apply_stock_move(v_branch, v_wh, COALESCE(NEW.product_id, OLD.product_id), v_qty, 'sale', 'sale_items', COALESCE(NEW.sale_item_id, OLD.sale_item_id), v_cost, TRUE);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_stock ON ims.sale_items;
CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.sale_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_sale_items_stock();

-- Adjustment items trigger
CREATE OR REPLACE FUNCTION ims.fn_adjust_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_adj ims.stock_adjustments%ROWTYPE;
  v_branch BIGINT;
  v_wh BIGINT;
  v_qty NUMERIC;
BEGIN
  v_adj := (SELECT * FROM ims.stock_adjustments WHERE adj_id = COALESCE(NEW.adj_id, OLD.adj_id));
  v_branch := v_adj.branch_id;
  v_wh := v_adj.wh_id;
  IF TG_OP = 'DELETE' THEN
    v_qty := -OLD.qty_change;
    PERFORM ims.fn_apply_stock_move(v_branch, v_wh, OLD.product_id, v_qty, 'adjustment', 'stock_adjustment_items', OLD.adj_item_id, OLD.unit_cost, FALSE);
    RETURN OLD;
  ELSE
    v_qty := COALESCE(NEW.qty_change,0) - COALESCE(OLD.qty_change,0);
    PERFORM ims.fn_apply_stock_move(v_branch, v_wh, COALESCE(NEW.product_id, OLD.product_id), v_qty, 'adjustment', 'stock_adjustment_items', COALESCE(NEW.adj_item_id, OLD.adj_item_id), COALESCE(NEW.unit_cost, OLD.unit_cost,0), FALSE);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adjust_items_stock ON ims.stock_adjustment_items;
CREATE TRIGGER trg_adjust_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.stock_adjustment_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_adjust_items_stock();

-- Warehouse transfer items trigger
CREATE OR REPLACE FUNCTION ims.fn_wh_transfer_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_transfer ims.warehouse_transfers%ROWTYPE;
  v_from_wh BIGINT;
  v_to_wh BIGINT;
  v_from_branch BIGINT;
  v_to_branch BIGINT;
  v_qty NUMERIC;
  v_cost NUMERIC;
BEGIN
  v_transfer := (SELECT * FROM ims.warehouse_transfers WHERE wh_transfer_id = COALESCE(NEW.wh_transfer_id, OLD.wh_transfer_id));
  v_from_wh := v_transfer.from_wh_id;
  v_to_wh := v_transfer.to_wh_id;
  v_from_branch := ims.fn_wh_branch(v_from_wh);
  v_to_branch := ims.fn_wh_branch(v_to_wh);
  v_cost := COALESCE(NEW.unit_cost, OLD.unit_cost, 0);

  IF TG_OP = 'DELETE' THEN
    v_qty := OLD.quantity;
    PERFORM ims.fn_apply_stock_move(v_from_branch, v_from_wh, OLD.product_id, v_qty, 'wh_transfer_in', 'warehouse_transfer_items', OLD.wh_transfer_item_id, v_cost, FALSE);
    PERFORM ims.fn_apply_stock_move(v_to_branch, v_to_wh, OLD.product_id, -v_qty, 'wh_transfer_out', 'warehouse_transfer_items', OLD.wh_transfer_item_id, v_cost, TRUE);
    RETURN OLD;
  ELSE
    v_qty := COALESCE(NEW.quantity,0) - COALESCE(OLD.quantity,0);
    PERFORM ims.fn_apply_stock_move(v_from_branch, v_from_wh, COALESCE(NEW.product_id, OLD.product_id), -v_qty, 'wh_transfer_out', 'warehouse_transfer_items', COALESCE(NEW.wh_transfer_item_id, OLD.wh_transfer_item_id), v_cost, TRUE);
    PERFORM ims.fn_apply_stock_move(v_to_branch, v_to_wh, COALESCE(NEW.product_id, OLD.product_id), v_qty, 'wh_transfer_in', 'warehouse_transfer_items', COALESCE(NEW.wh_transfer_item_id, OLD.wh_transfer_item_id), v_cost, FALSE);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wh_transfer_items ON ims.warehouse_transfer_items;
CREATE TRIGGER trg_wh_transfer_items
AFTER INSERT OR UPDATE OR DELETE ON ims.warehouse_transfer_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_wh_transfer_items_stock();

COMMIT;
