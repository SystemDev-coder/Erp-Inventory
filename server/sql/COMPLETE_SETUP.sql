-- ============================================
-- COMPLETE DATABASE SETUP
-- Run this ONCE in pgAdmin (idempotent - safe to re-run)
-- ============================================

-- ============================================
-- PART 1: RBAC TABLES
-- ============================================

-- Permissions table adding the missing columns
ALTER TABLE ims.permissions
ADD COLUMN IF NOT EXISTS module VARCHAR(50);

-- Permissions table creating
CREATE TABLE IF NOT EXISTS ims.permissions (
    perm_id SERIAL PRIMARY KEY,
    perm_key VARCHAR(100) UNIQUE NOT NULL,
    perm_name VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role permissions table creating
CREATE TABLE IF NOT EXISTS ims.role_permissions (
    role_id INT NOT NULL REFERENCES ims.roles(role_id) ON DELETE CASCADE,
    perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, perm_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.user_permissions (
    user_id INT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, perm_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON ims.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON ims.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON ims.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON ims.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_id ON ims.user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_effect ON ims.user_permission_overrides(effect);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON ims.permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_perm_key ON ims.permissions(perm_key);

-- ============================================
-- PART 2: SESSION MANAGEMENT TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS ims.permission_cache (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    permissions JSONB NOT NULL,
    permissions_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_cache_expires ON ims.permission_cache(expires_at);

CREATE TABLE IF NOT EXISTS ims.user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, refresh_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON ims.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON ims.user_sessions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON ims.user_sessions(last_activity DESC);

CREATE TABLE IF NOT EXISTS ims.user_preferences (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light',
    accent_color VARCHAR(7) DEFAULT '#3b82f6',
    sidebar_state VARCHAR(20) DEFAULT 'expanded',
    sidebar_position VARCHAR(10) DEFAULT 'left',
    sidebar_pinned BOOLEAN DEFAULT TRUE,
    enable_animations BOOLEAN DEFAULT TRUE,
    enable_focus_mode BOOLEAN DEFAULT FALSE,
    enable_hover_effects BOOLEAN DEFAULT TRUE,
    focus_mode_blur_level INT DEFAULT 5,
    compact_mode BOOLEAN DEFAULT FALSE,
    show_breadcrumbs BOOLEAN DEFAULT TRUE,
    show_page_transitions BOOLEAN DEFAULT TRUE,
    enable_notifications BOOLEAN DEFAULT TRUE,
    notification_sound BOOLEAN DEFAULT FALSE,
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.concurrent_session_limits (
    user_id INT PRIMARY KEY REFERENCES ims.users(user_id) ON DELETE CASCADE,
    max_sessions INT DEFAULT 2,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.sidebar_menu_cache (
    cache_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES ims.users(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES ims.roles(role_id) ON DELETE CASCADE,
    menu_data JSONB NOT NULL,
    permissions_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_sidebar_cache_user ON ims.sidebar_menu_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_cache_role ON ims.sidebar_menu_cache(role_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_cache_expires ON ims.sidebar_menu_cache(expires_at);

CREATE TABLE IF NOT EXISTS ims.session_activity_log (
    log_id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES ims.user_sessions(session_id) ON DELETE CASCADE,
    user_id INT REFERENCES ims.users(user_id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    ip_address VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_activity_user ON ims.session_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_activity_session ON ims.session_activity_log(session_id, created_at DESC);

-- ============================================
-- PART 3: HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION upsert_permission(
    p_key VARCHAR(100),
    p_name VARCHAR(150),
    p_module VARCHAR(50)
) RETURNS void AS $$
BEGIN
    INSERT INTO ims.permissions (perm_key, perm_name, module)
    VALUES (p_key, p_name, p_module)
    ON CONFLICT (perm_key) DO UPDATE
    SET perm_name = EXCLUDED.perm_name,
        module = EXCLUDED.module;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION clean_expired_sessions() RETURNS void AS $$
BEGIN
    DELETE FROM ims.user_sessions 
    WHERE expires_at < NOW() OR (is_active = FALSE AND last_activity < NOW() - INTERVAL '7 days');
    
    DELETE FROM ims.sidebar_menu_cache WHERE expires_at < NOW();
    DELETE FROM ims.permission_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_active_session_count(p_user_id INT) RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*) 
        FROM ims.user_sessions 
        WHERE user_id = p_user_id 
        AND is_active = TRUE 
        AND expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION invalidate_permission_cache(p_user_id INT) RETURNS void AS $$
BEGIN
    DELETE FROM ims.permission_cache WHERE user_id = p_user_id;
    DELETE FROM ims.sidebar_menu_cache WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 4: INSERT ALL PERMISSIONS
-- ============================================

-- HOME
SELECT upsert_permission('home.view', 'View Dashboard', 'Home');

-- PRODUCTS
SELECT upsert_permission('products.view', 'View Products', 'Products');
SELECT upsert_permission('products.create', 'Create Products', 'Products');
SELECT upsert_permission('products.update', 'Update Products', 'Products');
SELECT upsert_permission('products.delete', 'Delete Products', 'Products');
SELECT upsert_permission('products.export', 'Export Products', 'Products');
SELECT upsert_permission('products.import', 'Import Products', 'Products');

-- STOCK
SELECT upsert_permission('stock.view', 'View Stock', 'Stock');
SELECT upsert_permission('stock.adjust', 'Adjust Stock', 'Stock');
SELECT upsert_permission('stock.recount', 'Stock Recount', 'Stock');
SELECT upsert_permission('stock.export', 'Export Stock', 'Stock');

-- SALES
SELECT upsert_permission('sales.view', 'View Sales', 'Sales');
SELECT upsert_permission('sales.create', 'Create Sales', 'Sales');
SELECT upsert_permission('sales.update', 'Update Sales', 'Sales');
SELECT upsert_permission('sales.void', 'Void Sales', 'Sales');
SELECT upsert_permission('sales.pos', 'POS Access', 'Sales');
SELECT upsert_permission('sales.export', 'Export Sales', 'Sales');

-- PURCHASES
SELECT upsert_permission('purchases.view', 'View Purchases', 'Purchases');
SELECT upsert_permission('purchases.create', 'Create Purchases', 'Purchases');
SELECT upsert_permission('purchases.update', 'Update Purchases', 'Purchases');
SELECT upsert_permission('purchases.approve', 'Approve Purchases', 'Purchases');
SELECT upsert_permission('purchases.receive', 'Receive Purchases', 'Purchases');
SELECT upsert_permission('purchases.void', 'Void Purchases', 'Purchases');
SELECT upsert_permission('purchases.export', 'Export Purchases', 'Purchases');

-- RETURNS
SELECT upsert_permission('returns.view', 'View Returns', 'Returns');
SELECT upsert_permission('returns.create', 'Create Returns', 'Returns');
SELECT upsert_permission('returns.approve', 'Approve Returns', 'Returns');
SELECT upsert_permission('returns.void', 'Void Returns', 'Returns');

-- TRANSFERS
SELECT upsert_permission('transfers.view', 'View Transfers', 'Transfers');
SELECT upsert_permission('transfers.create', 'Create Transfers', 'Transfers');
SELECT upsert_permission('transfers.approve', 'Approve Transfers', 'Transfers');
SELECT upsert_permission('transfers.receive', 'Receive Transfers', 'Transfers');
SELECT upsert_permission('transfers.void', 'Void Transfers', 'Transfers');

-- FINANCE
SELECT upsert_permission('finance.view', 'View Finance', 'Finance');
SELECT upsert_permission('finance.expenses', 'Manage Expenses', 'Finance');
SELECT upsert_permission('finance.payments', 'Manage Payments', 'Finance');
SELECT upsert_permission('finance.reports', 'Financial Reports', 'Finance');
SELECT upsert_permission('finance.export', 'Export Finance', 'Finance');

-- CUSTOMERS
SELECT upsert_permission('customers.view', 'View Customers', 'Customers');
SELECT upsert_permission('customers.create', 'Create Customers', 'Customers');
SELECT upsert_permission('customers.update', 'Update Customers', 'Customers');
SELECT upsert_permission('customers.delete', 'Delete Customers', 'Customers');
SELECT upsert_permission('customers.export', 'Export Customers', 'Customers');

-- EMPLOYEES
SELECT upsert_permission('employees.view', 'View Employees', 'Employees');
SELECT upsert_permission('employees.create', 'Create Employees', 'Employees');
SELECT upsert_permission('employees.update', 'Update Employees', 'Employees');
SELECT upsert_permission('employees.delete', 'Delete Employees', 'Employees');

-- SYSTEM & SECURITY
SELECT upsert_permission('system.users', 'Manage Users', 'System');
SELECT upsert_permission('system.roles', 'Manage Roles', 'System');
SELECT upsert_permission('system.permissions', 'View Permissions', 'System');
SELECT upsert_permission('system.audit', 'View Audit Logs', 'System');
SELECT upsert_permission('system.branches', 'Manage Branches', 'System');

-- SETTINGS
SELECT upsert_permission('settings.view', 'View Settings', 'Settings');
SELECT upsert_permission('settings.update', 'Update Settings', 'Settings');

-- ============================================
-- PART 5: CREATE DEFAULT ROLES
-- ============================================

INSERT INTO ims.roles (role_name) VALUES ('Admin') ON CONFLICT DO NOTHING;
INSERT INTO ims.roles (role_name) VALUES ('Cashier') ON CONFLICT DO NOTHING;
INSERT INTO ims.roles (role_name) VALUES ('Manager') ON CONFLICT DO NOTHING;
INSERT INTO ims.roles (role_name) VALUES ('Warehouse') ON CONFLICT DO NOTHING;

-- Seed default branch (idempotent)
INSERT INTO ims.branches (branch_name, is_active) 
VALUES ('Main Branch', true) 
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 6: ASSIGN PERMISSIONS TO ROLES
-- ============================================

-- Admin gets ALL permissions
DO $$
DECLARE
    admin_role_id INT;
BEGIN
    SELECT role_id INTO admin_role_id FROM ims.roles WHERE role_name = 'Admin' LIMIT 1;
    
    IF admin_role_id IS NOT NULL THEN
        DELETE FROM ims.role_permissions WHERE role_id = admin_role_id;
        
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT admin_role_id, perm_id FROM ims.permissions;
        
        RAISE NOTICE 'Admin: % permissions assigned', (SELECT COUNT(*) FROM ims.permissions);
    END IF;
END $$;

-- Cashier gets limited permissions
DO $$
DECLARE
    cashier_role_id INT;
BEGIN
    SELECT role_id INTO cashier_role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1;
    
    IF cashier_role_id IS NOT NULL THEN
        DELETE FROM ims.role_permissions WHERE role_id = cashier_role_id;
        
        INSERT INTO ims.role_permissions (role_id, perm_id)
        SELECT cashier_role_id, perm_id
        FROM ims.permissions
        WHERE perm_key IN (
            'home.view', 'sales.view', 'sales.create', 'sales.pos',
            'customers.view', 'customers.create', 'products.view', 'stock.view'
        );
        
        RAISE NOTICE 'Cashier: 8 permissions assigned';
    END IF;
END $$;

-- Manager gets everything except system.*
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
        
        RAISE NOTICE 'Manager: permissions assigned';
    END IF;
END $$;

-- Warehouse gets stock-related permissions
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
            'home.view', 'products.view', 'stock.view', 'stock.adjust', 'stock.recount',
            'purchases.view', 'purchases.receive', 'transfers.view', 'transfers.create', 'transfers.receive'
        );
        
        RAISE NOTICE 'Warehouse: 10 permissions assigned';
    END IF;
END $$;

-- ============================================
-- PART 7: SESSION LIMITS FOR EXISTING USERS
-- ============================================

INSERT INTO ims.concurrent_session_limits (user_id, max_sessions)
SELECT user_id, 2 FROM ims.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- PART 8: TRIGGERS FOR CACHE INVALIDATION
-- ============================================

CREATE OR REPLACE FUNCTION trigger_invalidate_cache() RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'user_permissions' OR TG_TABLE_NAME = 'user_permission_overrides' THEN
        PERFORM invalidate_permission_cache(NEW.user_id);
    END IF;
    
    IF TG_TABLE_NAME = 'role_permissions' THEN
        DELETE FROM ims.permission_cache 
        WHERE user_id IN (SELECT user_id FROM ims.users WHERE role_id = NEW.role_id);
        
        DELETE FROM ims.sidebar_menu_cache WHERE role_id = NEW.role_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invalidate_user_perms ON ims.user_permissions;
CREATE TRIGGER trg_invalidate_user_perms
AFTER INSERT OR UPDATE OR DELETE ON ims.user_permissions
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

DROP TRIGGER IF EXISTS trg_invalidate_user_overrides ON ims.user_permission_overrides;
CREATE TRIGGER trg_invalidate_user_overrides
AFTER INSERT OR UPDATE OR DELETE ON ims.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

DROP TRIGGER IF EXISTS trg_invalidate_role_perms ON ims.role_permissions;
CREATE TRIGGER trg_invalidate_role_perms
AFTER INSERT OR UPDATE OR DELETE ON ims.role_permissions
FOR EACH ROW EXECUTE FUNCTION trigger_invalidate_cache();

-- ============================================
-- FINAL VERIFICATION
-- ============================================

SELECT '✅ COMPLETE SETUP SUCCESSFUL!' as status;
SELECT COUNT(*) as total_permissions FROM ims.permissions;
SELECT COUNT(*) as total_roles FROM ims.roles;
SELECT r.role_name, COUNT(rp.perm_id) as permission_count
FROM ims.roles r
LEFT JOIN ims.role_permissions rp ON r.role_id = rp.role_id
GROUP BY r.role_id, r.role_name
ORDER BY r.role_name;

SELECT 'Run this in backend terminal: npm run dev' as next_step;
