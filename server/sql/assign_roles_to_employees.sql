-- Assign roles to existing employees
BEGIN;

SET search_path TO ims, public;

-- Assign roles to employees based on their names/positions
UPDATE ims.employees SET role_id = (SELECT role_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1)
WHERE full_name LIKE '%Hassan%' AND role_id IS NULL;

UPDATE ims.employees SET role_id = (SELECT role_id FROM ims.roles WHERE role_name = 'Cashier' LIMIT 1)
WHERE full_name IN ('Fatima Ali', 'Abdi Yusuf') AND role_id IS NULL;

UPDATE ims.employees SET role_id = (SELECT role_id FROM ims.roles WHERE role_name = 'User' LIMIT 1)
WHERE full_name IN ('Omar Mohamed', 'Aisha Ibrahim', 'Mohamed Ali', 'Sahra Omar') AND role_id IS NULL;

UPDATE ims.employees SET role_id = (SELECT role_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1)
WHERE full_name IN ('Khadija Abdi', 'Halima Said') AND role_id IS NULL;

-- Assign default 'User' role to any remaining employees without roles
UPDATE ims.employees SET role_id = (SELECT role_id FROM ims.roles WHERE role_name = 'User' LIMIT 1)
WHERE role_id IS NULL;

COMMIT;

-- Show results
SELECT 
  e.emp_id,
  e.full_name,
  r.role_name,
  e.user_id,
  e.status
FROM ims.employees e
LEFT JOIN ims.roles r ON e.role_id = r.role_id
ORDER BY e.emp_id;
