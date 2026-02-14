-- Emergency fix for automatic branch_id trigger
-- This migration adds fallback logic to prevent NULL branch_id errors

BEGIN;
SET search_path TO ims, public;

-- Drop and recreate the trigger function with better fallback logic
CREATE OR REPLACE FUNCTION ims.trg_auto_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_branch_id BIGINT;
  v_user_id BIGINT;
BEGIN
  -- Get current branch and user from session
  BEGIN
    v_branch_id := ims.get_current_branch();
    v_user_id := ims.get_current_user();
  EXCEPTION
    WHEN OTHERS THEN
      v_branch_id := NULL;
      v_user_id := NULL;
  END;
  
  -- On INSERT: auto-populate branch_id if not provided
  IF TG_OP = 'INSERT' THEN
    IF NEW.branch_id IS NULL THEN
      -- Priority 1: Use session branch_id
      IF v_branch_id IS NOT NULL THEN
        NEW.branch_id := v_branch_id;
      ELSE
        -- Priority 2: Get from user's primary branch
        IF v_user_id IS NOT NULL THEN
          SELECT branch_id INTO NEW.branch_id
          FROM ims.users
          WHERE user_id = v_user_id
          LIMIT 1;
        END IF;
        
        -- Priority 3: Get first active branch as absolute fallback
        IF NEW.branch_id IS NULL THEN
          SELECT branch_id INTO NEW.branch_id
          FROM ims.branches
          WHERE is_active = TRUE
          ORDER BY branch_id
          LIMIT 1;
        END IF;
      END IF;
    END IF;
    
    -- Auto-populate created_by if column exists and not set
    IF v_user_id IS NOT NULL THEN
      BEGIN
        IF NEW.created_by IS NULL THEN
          NEW.created_by := v_user_id;
        END IF;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
      
      -- Set created_at if not already set
      BEGIN
        IF NEW.created_at IS NULL THEN
          NEW.created_at := NOW();
        END IF;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
    END IF;
  END IF;
  
  -- On UPDATE: auto-populate updated_by
  IF TG_OP = 'UPDATE' THEN
    IF v_user_id IS NOT NULL THEN
      BEGIN
        NEW.updated_by := v_user_id;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
      
      -- Update updated_at timestamp
      BEGIN
        NEW.updated_at := NOW();
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ims.trg_auto_branch_id IS 'Automatically populates branch_id with fallback logic, created_by, updated_by, and timestamps';

-- Recreate all triggers (in case they were missing)
DROP TRIGGER IF EXISTS trg_auto_branch_accounts ON ims.accounts;
CREATE TRIGGER trg_auto_branch_accounts BEFORE INSERT OR UPDATE ON ims.accounts
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_categories ON ims.categories;
CREATE TRIGGER trg_auto_branch_categories BEFORE INSERT OR UPDATE ON ims.categories
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_suppliers ON ims.suppliers;
CREATE TRIGGER trg_auto_branch_suppliers BEFORE INSERT OR UPDATE ON ims.suppliers
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_customers ON ims.customers;
CREATE TRIGGER trg_auto_branch_customers BEFORE INSERT OR UPDATE ON ims.customers
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_products ON ims.products;
CREATE TRIGGER trg_auto_branch_products BEFORE INSERT OR UPDATE ON ims.products
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_sales ON ims.sales;
CREATE TRIGGER trg_auto_branch_sales BEFORE INSERT OR UPDATE ON ims.sales
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_purchases ON ims.purchases;
CREATE TRIGGER trg_auto_branch_purchases BEFORE INSERT OR UPDATE ON ims.purchases
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_charges ON ims.charges;
CREATE TRIGGER trg_auto_branch_charges BEFORE INSERT OR UPDATE ON ims.charges
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_receipts ON ims.receipts;
CREATE TRIGGER trg_auto_branch_receipts BEFORE INSERT OR UPDATE ON ims.receipts
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_supplier_charges ON ims.supplier_charges;
CREATE TRIGGER trg_auto_branch_supplier_charges BEFORE INSERT OR UPDATE ON ims.supplier_charges
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_supplier_payments ON ims.supplier_payments;
CREATE TRIGGER trg_auto_branch_supplier_payments BEFORE INSERT OR UPDATE ON ims.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_expenses ON ims.expenses;
CREATE TRIGGER trg_auto_branch_expenses BEFORE INSERT OR UPDATE ON ims.expenses
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_inventory_movements ON ims.inventory_movements;
CREATE TRIGGER trg_auto_branch_inventory_movements BEFORE INSERT OR UPDATE ON ims.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_employees ON ims.employees;
CREATE TRIGGER trg_auto_branch_employees BEFORE INSERT OR UPDATE ON ims.employees
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_employee_payments ON ims.employee_payments;
CREATE TRIGGER trg_auto_branch_employee_payments BEFORE INSERT OR UPDATE ON ims.employee_payments
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_employee_loans ON ims.employee_loans;
CREATE TRIGGER trg_auto_branch_employee_loans BEFORE INSERT OR UPDATE ON ims.employee_loans
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_branch_audit_logs ON ims.audit_logs;
CREATE TRIGGER trg_auto_branch_audit_logs BEFORE INSERT OR UPDATE ON ims.audit_logs
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

DROP TRIGGER IF EXISTS trg_auto_warehouse_audit ON ims.warehouses;
CREATE TRIGGER trg_auto_warehouse_audit BEFORE INSERT OR UPDATE ON ims.warehouses
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

COMMIT;
