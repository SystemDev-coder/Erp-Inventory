-- Fix: Assign all existing users to their branch
-- This fixes the "User has no branch access assigned" error

BEGIN;
SET search_path TO ims, public;

-- Assign all users to their branch (if they have one in users table)
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
SELECT u.user_id, u.branch_id, TRUE
FROM ims.users u
WHERE u.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ims.user_branch ub 
    WHERE ub.user_id = u.user_id AND ub.branch_id = u.branch_id
  )
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- If users don't have branch_id, assign them to the first available branch
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
SELECT u.user_id, (SELECT branch_id FROM ims.branches WHERE is_active = TRUE ORDER BY branch_id LIMIT 1), TRUE
FROM ims.users u
WHERE u.branch_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM ims.user_branch ub WHERE ub.user_id = u.user_id)
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- Update users.branch_id if NULL
UPDATE ims.users
SET branch_id = (SELECT branch_id FROM ims.branches WHERE is_active = TRUE ORDER BY branch_id LIMIT 1)
WHERE branch_id IS NULL;

COMMIT;

-- Verify
SELECT 
  u.user_id,
  u.username,
  u.branch_id as user_branch,
  ub.branch_id as assigned_branch,
  ub.is_primary
FROM ims.users u
LEFT JOIN ims.user_branch ub ON u.user_id = ub.user_id
ORDER BY u.user_id;
