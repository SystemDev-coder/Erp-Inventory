BEGIN;
SET search_path TO ims, public;

CREATE OR REPLACE FUNCTION ims.fn_adjust_items_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_adj ims.stock_adjustments%ROWTYPE;
  v_branch BIGINT;
  v_wh BIGINT;
  v_qty NUMERIC;
BEGIN
  SELECT *
    INTO v_adj
    FROM ims.stock_adjustments
   WHERE adj_id = COALESCE(NEW.adj_id, OLD.adj_id);

  IF v_adj.adj_id IS NULL THEN
    RAISE EXCEPTION 'Stock adjustment header not found for adj_id %', COALESCE(NEW.adj_id, OLD.adj_id);
  END IF;

  v_branch := v_adj.branch_id;
  v_wh := v_adj.wh_id;

  IF TG_OP = 'DELETE' THEN
    v_qty := -OLD.qty_change;
    PERFORM ims.fn_apply_stock_move(
      v_branch,
      v_wh,
      OLD.product_id,
      v_qty,
      'adjustment',
      'stock_adjustment_items',
      OLD.adj_item_id,
      OLD.unit_cost,
      FALSE
    );
    RETURN OLD;
  END IF;

  v_qty := COALESCE(NEW.qty_change, 0) - COALESCE(OLD.qty_change, 0);
  PERFORM ims.fn_apply_stock_move(
    v_branch,
    v_wh,
    COALESCE(NEW.product_id, OLD.product_id),
    v_qty,
    'adjustment',
    'stock_adjustment_items',
    COALESCE(NEW.adj_item_id, OLD.adj_item_id),
    COALESCE(NEW.unit_cost, OLD.unit_cost, 0),
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adjust_items_stock ON ims.stock_adjustment_items;
CREATE TRIGGER trg_adjust_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.stock_adjustment_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_adjust_items_stock();

COMMIT;
