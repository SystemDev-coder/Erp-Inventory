BEGIN;
SET search_path TO ims, public;

CREATE OR REPLACE FUNCTION ims.fn_purchase_items_stock() RETURNS TRIGGER AS $$
DECLARE
  v_branch BIGINT;
  v_wh BIGINT;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_product BIGINT;
  v_move_type ims.movement_type_enum;
BEGIN
  v_branch := (SELECT branch_id FROM ims.purchases WHERE purchase_id = COALESCE(NEW.purchase_id, OLD.purchase_id));
  v_wh := (SELECT wh_id FROM ims.purchases WHERE purchase_id = COALESCE(NEW.purchase_id, OLD.purchase_id));

  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) = 0 THEN
      RETURN NEW;
    END IF;

    PERFORM ims.fn_apply_stock_move(
      v_branch,
      v_wh,
      NEW.product_id,
      NEW.quantity,
      'purchase',
      'purchase_items',
      NEW.purchase_item_id,
      COALESCE(NEW.unit_cost, 0),
      FALSE
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL OR COALESCE(OLD.quantity, 0) = 0 THEN
      RETURN OLD;
    END IF;

    PERFORM ims.fn_apply_stock_move(
      v_branch,
      v_wh,
      OLD.product_id,
      -OLD.quantity,
      'purchase_return',
      'purchase_items',
      OLD.purchase_item_id,
      COALESCE(OLD.unit_cost, 0),
      TRUE
    );
    RETURN OLD;
  END IF;

  -- UPDATE
  IF COALESCE(NEW.product_id, 0) <> COALESCE(OLD.product_id, 0) THEN
    IF OLD.product_id IS NOT NULL AND COALESCE(OLD.quantity, 0) <> 0 THEN
      PERFORM ims.fn_apply_stock_move(
        v_branch,
        v_wh,
        OLD.product_id,
        -OLD.quantity,
        'purchase_return',
        'purchase_items',
        OLD.purchase_item_id,
        COALESCE(OLD.unit_cost, 0),
        TRUE
      );
    END IF;

    IF NEW.product_id IS NOT NULL AND COALESCE(NEW.quantity, 0) <> 0 THEN
      PERFORM ims.fn_apply_stock_move(
        v_branch,
        v_wh,
        NEW.product_id,
        NEW.quantity,
        'purchase',
        'purchase_items',
        NEW.purchase_item_id,
        COALESCE(NEW.unit_cost, 0),
        FALSE
      );
    END IF;
    RETURN NEW;
  END IF;

  v_qty := COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0);
  IF v_qty = 0 THEN
    RETURN NEW;
  END IF;

  v_product := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product IS NULL THEN
    RETURN NEW;
  END IF;

  v_unit_cost := COALESCE(NEW.unit_cost, OLD.unit_cost, 0);
  v_move_type := CASE WHEN v_qty < 0 THEN 'purchase_return'::ims.movement_type_enum ELSE 'purchase'::ims.movement_type_enum END;

  PERFORM ims.fn_apply_stock_move(
    v_branch,
    v_wh,
    v_product,
    v_qty,
    v_move_type,
    'purchase_items',
    COALESCE(NEW.purchase_item_id, OLD.purchase_item_id),
    v_unit_cost,
    (v_qty < 0)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_items_stock ON ims.purchase_items;
CREATE TRIGGER trg_purchase_items_stock
AFTER INSERT OR UPDATE OR DELETE ON ims.purchase_items
FOR EACH ROW EXECUTE FUNCTION ims.fn_purchase_items_stock();

COMMIT;
