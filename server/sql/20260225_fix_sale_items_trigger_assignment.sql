BEGIN;
SET search_path TO ims, public;

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
