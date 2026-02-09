-- ============================================
-- SAMPLE USERS (SOMALI) - ims.users
-- Test users with Somali names. Password for all: password
-- Run after FIX_REGISTRATION.sql or when roles/branches exist.
-- ============================================

-- Password hash used: "password" (bcrypt, 10 rounds).
-- Use password: password to log in as any sample user.

-- Ensure we have at least one branch (idempotent).
-- Roles: use only Admin (2), Cashier (3), Manager (4), Warehouse (5) - no User role.
INSERT INTO ims.branches (branch_id, branch_name, is_active)
VALUES (1, 'Main Branch', true)
ON CONFLICT (branch_id) DO UPDATE SET branch_name = 'Main Branch', is_active = true;

-- ============================================
-- INSERT SAMPLE SOMALI USERS
-- ============================================
-- Columns: branch_id, role_id, name, username, phone, password_hash, is_active
-- Login password for all users: password
-- ============================================

INSERT INTO ims.users (branch_id, role_id, name, username, phone, password_hash, is_active)
VALUES
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Admin' LIMIT 1),
    'Ahmed Hassan',
    'ahmed.hassan',
    '+252611234567',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1),
    'Fatima Ali',
    'fatima.ali',
    '+252622345678',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1),
    'Omar Mohamed',
    'omar.mohamed',
    '+252633456789',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Warehouse' LIMIT 1),
    'Aisha Ibrahim',
    'aisha.ibrahim',
    '+252644567890',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1),
    'Abdi Yusuf',
    'abdi.yusuf',
    '+252655678901',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1),
    'Khadija Abdi',
    'khadija.abdi',
    '+252666789012',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Warehouse' LIMIT 1),
    'Hassan Farah',
    'hassan.farah',
    '+252677890123',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  ),
  (
    (SELECT branch_id FROM ims.branches WHERE branch_name = 'Main Branch' LIMIT 1),
    (SELECT role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1),
    'Halima Said',
    'halima.said',
    '+252688901234',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    true
  );

-- Note: Run this script once. Re-running may fail on duplicate username/phone if unique.

-- ============================================
-- Verification
-- ============================================
SELECT 'Sample Somali users inserted' AS message;
SELECT u.user_id, u.name, u.username, u.phone, r.role_name
FROM ims.users u
JOIN ims.roles r ON r.role_id = u.role_id
WHERE u.username IN (
  'ahmed.hassan', 'fatima.ali', 'omar.mohamed', 'aisha.ibrahim',
  'abdi.yusuf', 'khadija.abdi', 'hassan.farah', 'halima.said'
)
ORDER BY u.username;
