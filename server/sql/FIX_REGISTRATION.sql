-- ============================================
-- FIX REGISTRATION ERROR
-- Run this in pgAdmin to fix the registration issue
-- ============================================

-- Ensure roles exist
INSERT INTO ims.roles (role_id, role_name) 
VALUES (1, 'User') 
ON CONFLICT (role_id) DO UPDATE SET role_name = 'User';

INSERT INTO ims.roles (role_name) 
VALUES ('Admin'), ('Cashier'), ('Manager'), ('Warehouse') 
ON CONFLICT (role_name) DO NOTHING;

-- Ensure branches exist
INSERT INTO ims.branches (branch_id, branch_name, is_active) 
VALUES (1, 'Main Branch', true) 
ON CONFLICT (branch_id) DO UPDATE SET branch_name = 'Main Branch', is_active = true;

-- Verify data
SELECT 'Roles:' as info;
SELECT role_id, role_name FROM ims.roles ORDER BY role_id;

SELECT 'Branches:' as info;
SELECT branch_id, branch_name FROM ims.branches ORDER BY branch_id;

-- Success message
SELECT 'Setup complete! You can now register users.' as message;
