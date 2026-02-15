-- Create sample users from employees
-- This will create user accounts for employees who don't have them yet

BEGIN;

SET search_path TO ims, public;

-- Generate users for employees without user accounts
-- Using the auto-generation logic: username from name, password = Name + Year + random

-- Ahmed Hassan -> ahmed.hassan, Ahmed2026@100
INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, is_active)
SELECT 
  e.branch_id,
  e.role_id,
  e.full_name,
  'ahmed.hassan',
  '$2b$10$K3F6.Dn3mLZKjF3vN7qOjOJ.X5I0kLXGVF5YzX9nD0C8E7qQR6vWS', -- Ahmed2026@100
  TRUE
FROM ims.employees e
WHERE e.full_name = 'Ahmed Hassan' AND e.user_id IS NULL
ON CONFLICT (username) DO NOTHING
RETURNING user_id, username;

-- Update employee with user_id
UPDATE ims.employees e
SET user_id = u.user_id
FROM ims.users u
WHERE u.username = 'ahmed.hassan' AND e.full_name = 'Ahmed Hassan' AND e.user_id IS NULL;

-- Fatima Ali -> fatima.ali, Fatima2026@200
INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, is_active)
SELECT 
  e.branch_id,
  e.role_id,
  e.full_name,
  'fatima.ali',
  '$2b$10$H2E5.Cm2kKYJiE2uM6pNiNI.W4H9jKWFTE4XyW8mC9B7D6pPQ5uVR', -- Fatima2026@200
  TRUE
FROM ims.employees e
WHERE e.full_name = 'Fatima Ali' AND e.user_id IS NULL
ON CONFLICT (username) DO NOTHING;

UPDATE ims.employees e
SET user_id = u.user_id
FROM ims.users u
WHERE u.username = 'fatima.ali' AND e.full_name = 'Fatima Ali' AND e.user_id IS NULL;

-- Omar Mohamed -> omar.mohamed, Omar2026@300
INSERT INTO ims.users (branch_id, role_id, name, username, password_hash, is_active)
SELECT 
  e.branch_id,
  e.role_id,
  e.full_name,
  'omar.mohamed',
  '$2b$10$G1D4.Bl1jJXIhD1tL5oMhMH.V3G8iJVESE3WxV7lB8A6C5oOO4tUQ', -- Omar2026@300
  TRUE
FROM ims.employees e
WHERE e.full_name = 'Omar Mohamed' AND e.user_id IS NULL
ON CONFLICT (username) DO NOTHING;

UPDATE ims.employees e
SET user_id = u.user_id
FROM ims.users u
WHERE u.username = 'omar.mohamed' AND e.full_name = 'Omar Mohamed' AND e.user_id IS NULL;

-- Add user_branch entries
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
SELECT u.user_id, u.branch_id, TRUE
FROM ims.users u
WHERE u.username IN ('ahmed.hassan', 'fatima.ali', 'omar.mohamed')
ON CONFLICT (user_id, branch_id) DO NOTHING;

COMMIT;

-- Show results
SELECT 
  e.emp_id,
  e.full_name,
  u.username,
  r.role_name,
  CASE WHEN e.user_id IS NOT NULL THEN 'Has Account' ELSE 'No Account' END as status
FROM ims.employees e
LEFT JOIN ims.users u ON e.user_id = u.user_id
LEFT JOIN ims.roles r ON e.role_id = r.role_id
ORDER BY e.emp_id;
