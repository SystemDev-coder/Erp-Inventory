-- ============================================
-- RBAC Permissions Seed Data
-- Run this in pgAdmin to populate permissions
-- SAFE TO RUN MULTIPLE TIMES (UPSERT)
-- ============================================

-- Create tables if not exist (idempotent)
CREATE TABLE IF NOT EXISTS ims.permissions (
    perm_id SERIAL PRIMARY KEY,
    perm_key VARCHAR(100) UNIQUE NOT NULL,
    perm_name VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill missing columns if table already existed without them
ALTER TABLE ims.permissions
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS module VARCHAR(50);

CREATE TABLE IF NOT EXISTS ims.role_permissions (
    role_id INT NOT NULL REFERENCES ims.roles(role_id) ON DELETE CASCADE,
    perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, perm_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy table for simple allow overrides (kept for backward compatibility)
CREATE TABLE IF NOT EXISTS ims.user_permissions (
    user_id INT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, perm_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- New table for allow/deny overrides
CREATE TABLE IF NOT EXISTS ims.user_permission_overrides (
    user_id INT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
    effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
    PRIMARY KEY (user_id, perm_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES ims.users(user_id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id INT,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON ims.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON ims.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON ims.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON ims.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_id ON ims.user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_effect ON ims.user_permission_overrides(effect);

-- ============================================
-- INSERT PERMISSIONS (UPSERT)
-- ============================================

-- Helper function for upserting permissions
CREATE OR REPLACE FUNCTION upsert_permission(
    p_key VARCHAR(100),
    p_name VARCHAR(150),
    p_module VARCHAR(50),
    p_desc TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO ims.permissions (perm_key, perm_name, module, description)
    VALUES (p_key, p_name, p_module, p_desc)
    ON CONFLICT (perm_key) DO UPDATE
    SET perm_name = EXCLUDED.perm_name,
        module = EXCLUDED.module,
        description = EXCLUDED.description;
END;
$$ LANGUAGE plpgsql;

-- HOME / DASHBOARD
SELECT upsert_permission('home.view', 'View Dashboard', 'Home', 'Access to main dashboard');

-- PRODUCTS
SELECT upsert_permission('products.view', 'View Products', 'Products', 'View products list and details');
SELECT upsert_permission('products.create', 'Create Products', 'Products', 'Add new products');
SELECT upsert_permission('products.update', 'Update Products', 'Products', 'Edit existing products');
SELECT upsert_permission('products.delete', 'Delete Products', 'Products', 'Remove products');
SELECT upsert_permission('products.export', 'Export Products', 'Products', 'Export products data');
SELECT upsert_permission('products.import', 'Import Products', 'Products', 'Bulk import products');

-- STOCK
SELECT upsert_permission('stock.view', 'View Stock', 'Stock', 'View stock levels and movements');
SELECT upsert_permission('stock.adjust', 'Adjust Stock', 'Stock', 'Manual stock adjustments');
SELECT upsert_permission('stock.recount', 'Stock Recount', 'Stock', 'Perform stock recounts');
SELECT upsert_permission('stock.export', 'Export Stock', 'Stock', 'Export stock data');

-- SALES
SELECT upsert_permission('sales.view', 'View Sales', 'Sales', 'View sales transactions');
SELECT upsert_permission('sales.create', 'Create Sales', 'Sales', 'Record new sales');
SELECT upsert_permission('sales.update', 'Update Sales', 'Sales', 'Edit sales transactions');
SELECT upsert_permission('sales.void', 'Void Sales', 'Sales', 'Cancel sales transactions');
SELECT upsert_permission('sales.pos', 'POS Access', 'Sales', 'Access Point of Sale system');
SELECT upsert_permission('sales.export', 'Export Sales', 'Sales', 'Export sales reports');

-- PURCHASES
SELECT upsert_permission('purchases.view', 'View Purchases', 'Purchases', 'View purchase orders');
SELECT upsert_permission('purchases.create', 'Create Purchases', 'Purchases', 'Create purchase orders');
SELECT upsert_permission('purchases.update', 'Update Purchases', 'Purchases', 'Edit purchase orders');
SELECT upsert_permission('purchases.approve', 'Approve Purchases', 'Purchases', 'Approve purchase orders');
SELECT upsert_permission('purchases.receive', 'Receive Purchases', 'Purchases', 'Receive purchased goods');
SELECT upsert_permission('purchases.void', 'Void Purchases', 'Purchases', 'Cancel purchase orders');
SELECT upsert_permission('purchases.export', 'Export Purchases', 'Purchases', 'Export purchase data');

-- RETURNS
SELECT upsert_permission('returns.view', 'View Returns', 'Returns', 'View return transactions');
SELECT upsert_permission('returns.create', 'Create Returns', 'Returns', 'Process returns');
SELECT upsert_permission('returns.approve', 'Approve Returns', 'Returns', 'Approve return requests');
SELECT upsert_permission('returns.void', 'Void Returns', 'Returns', 'Cancel returns');

-- TRANSFERS
SELECT upsert_permission('transfers.view', 'View Transfers', 'Transfers', 'View stock transfers');
SELECT upsert_permission('transfers.create', 'Create Transfers', 'Transfers', 'Create transfer orders');
SELECT upsert_permission('transfers.approve', 'Approve Transfers', 'Transfers', 'Approve transfers');
SELECT upsert_permission('transfers.receive', 'Receive Transfers', 'Transfers', 'Receive transferred stock');
SELECT upsert_permission('transfers.void', 'Void Transfers', 'Transfers', 'Cancel transfers');

-- FINANCE
SELECT upsert_permission('finance.view', 'View Finance', 'Finance', 'View financial data');
SELECT upsert_permission('finance.expenses', 'Manage Expenses', 'Finance', 'Record and manage expenses');
SELECT upsert_permission('finance.payments', 'Manage Payments', 'Finance', 'Process payments');
SELECT upsert_permission('finance.reports', 'Financial Reports', 'Finance', 'Access financial reports');
SELECT upsert_permission('finance.export', 'Export Finance', 'Finance', 'Export financial data');

-- Suppliers
SELECT upsert_permission('suppliers.view', 'View Suppliers', 'Suppliers', 'View supplier list');
SELECT upsert_permission('suppliers.create', 'Create Suppliers', 'Suppliers', 'Add suppliers');
SELECT upsert_permission('suppliers.update', 'Update Suppliers', 'Suppliers', 'Edit suppliers');
SELECT upsert_permission('suppliers.delete', 'Delete Suppliers', 'Suppliers', 'Remove suppliers');

-- Receipts
SELECT upsert_permission('receipts.view', 'View Receipts', 'Receipts', 'View receipts list');
SELECT upsert_permission('receipts.create', 'Create Receipts', 'Receipts', 'Record customer receipts');
SELECT upsert_permission('receipts.update', 'Update Receipts', 'Receipts', 'Edit receipts');
SELECT upsert_permission('receipts.delete', 'Delete Receipts', 'Receipts', 'Remove receipts');

-- CUSTOMERS
SELECT upsert_permission('customers.view', 'View Customers', 'Customers', 'View customer list');
SELECT upsert_permission('customers.create', 'Create Customers', 'Customers', 'Add new customers');
SELECT upsert_permission('customers.update', 'Update Customers', 'Customers', 'Edit customer details');
SELECT upsert_permission('customers.delete', 'Delete Customers', 'Customers', 'Remove customers');
SELECT upsert_permission('customers.export', 'Export Customers', 'Customers', 'Export customer data');

-- EMPLOYEES
SELECT upsert_permission('employees.view', 'View Employees', 'Employees', 'View employee list');
SELECT upsert_permission('employees.create', 'Create Employees', 'Employees', 'Add new employees');
SELECT upsert_permission('employees.update', 'Update Employees', 'Employees', 'Edit employee details');
SELECT upsert_permission('employees.delete', 'Delete Employees', 'Employees', 'Remove employees');

-- SYSTEM & SECURITY
SELECT upsert_permission('system.users', 'Manage Users', 'System', 'User access management');
SELECT upsert_permission('system.roles', 'Manage Roles', 'System', 'Role and permissions management');
SELECT upsert_permission('system.permissions', 'View Permissions', 'System', 'View all permissions');
SELECT upsert_permission('system.audit', 'View Audit Logs', 'System', 'Access audit trail');
SELECT upsert_permission('system.branches', 'Manage Branches', 'System', 'Manage branch locations');

-- SETTINGS
SELECT upsert_permission('settings.view', 'View Settings', 'Settings', 'Access system settings');
SELECT upsert_permission('settings.update', 'Update Settings', 'Settings', 'Modify system configuration');

-- ============================================
-- CREATE DEFAULT ROLES
-- ============================================

-- Admin Role (Full Access)
INSERT INTO ims.roles (role_name)
VALUES ('Admin')
ON CONFLICT DO NOTHING;

-- Cashier Role (Limited Access)
INSERT INTO ims.roles (role_name)
VALUES ('Cashier')
ON CONFLICT DO NOTHING;

-- Manager Role
INSERT INTO ims.roles (role_name)
VALUES ('Manager')
ON CONFLICT DO NOTHING;

-- Warehouse Role
INSERT INTO ims.roles (role_name)
VALUES ('Warehouse')
ON CONFLICT DO NOTHING;

-- ============================================
-- ASSIGN PERMISSIONS TO ADMIN (ALL)
-- ============================================

DO $$
DECLARE
    admin_role_id INT;
BEGIN
    -- Get Admin role ID
    SELECT role_id INTO admin_role_id FROM ims.roles WHERE role_name = 'Admin' LIMIT 1;
    
    IF admin_role_id IS NOT NULL THEN
        -- Delete existing Admin permissions
        DELETE FROM ims.role_permissions WHERE role_id = admin_role_id;
        
        -- Assign ALL permissions to Admin
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT admin_role_id, perm_id
        FROM ims.permissions;
        
        RAISE NOTICE 'Admin role granted all permissions';
    END IF;
END $$;

-- ============================================
-- ASSIGN PERMISSIONS TO CASHIER (Limited)
-- ============================================

DO $$
DECLARE
    cashier_role_id INT;
BEGIN
    -- Get Cashier role ID
    SELECT role_id INTO cashier_role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1;
    
    IF cashier_role_id IS NOT NULL THEN
        -- Delete existing Cashier permissions
        DELETE FROM ims.role_permissions WHERE role_id = cashier_role_id;
        
        -- Assign limited permissions to Cashier
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT cashier_role_id, perm_id
        FROM ims.permissions
        WHERE perm_key IN (
            'home.view',
            'sales.view',
            'sales.create',
            'sales.pos',
            'customers.view',
            'customers.create',
            'products.view',
            'stock.view'
        );
        
        RAISE NOTICE 'Cashier role granted limited permissions';
    END IF;
END $$;

-- ============================================
-- ASSIGN PERMISSIONS TO MANAGER
-- ============================================

DO $$
DECLARE
    manager_role_id INT;
BEGIN
    SELECT role_id INTO manager_role_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1;
    
    IF manager_role_id IS NOT NULL THEN
        DELETE FROM ims.role_permissions WHERE role_id = manager_role_id;
        
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT manager_role_id, perm_id
        FROM ims.permissions
        WHERE perm_key NOT LIKE 'system.%' OR perm_key = 'system.audit';
        
        RAISE NOTICE 'Manager role granted management permissions';
    END IF;
END $$;

-- ============================================
-- ASSIGN PERMISSIONS TO WAREHOUSE
-- ============================================

DO $$
DECLARE
    warehouse_role_id INT;
BEGIN
    SELECT role_id INTO warehouse_role_id FROM ims.roles WHERE role_name = 'Warehouse' LIMIT 1;
    
    IF warehouse_role_id IS NOT NULL THEN
        DELETE FROM ims.role_permissions WHERE role_id = warehouse_role_id;
        
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT warehouse_role_id, perm_id
        FROM ims.permissions
        WHERE perm_key IN (
            'home.view',
            'products.view',
            'stock.view',
            'stock.adjust',
            'stock.recount',
            'purchases.view',
            'purchases.receive',
            'transfers.view',
            'transfers.create',
            'transfers.receive'
        );
        
        RAISE NOTICE 'Warehouse role granted stock permissions';
    END IF;
END $$;

-- Verify
SELECT 'Permissions seeded successfully!' as status;
SELECT COUNT(*) as total_permissions FROM ims.permissions;
SELECT r.role_name, COUNT(rp.perm_id) as permission_count
FROM ims.roles r
LEFT JOIN ims.role_permissions rp ON r.role_id = rp.role_id
GROUP BY r.role_id, r.role_name
ORDER BY r.role_name;

