BEGIN;

SET search_path TO ims, public;

CREATE TABLE IF NOT EXISTS ims.notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES ims.branches(branch_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    created_by BIGINT REFERENCES ims.users(user_id),
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    link VARCHAR(240),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    meta JSONB,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ims.notifications
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES ims.branches(branch_id),
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES ims.users(user_id),
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES ims.users(user_id),
  ADD COLUMN IF NOT EXISTS title VARCHAR(160),
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS link VARCHAR(240),
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta JSONB,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ims'
      AND table_name = 'notifications'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    DELETE FROM ims.notifications WHERE user_id IS NULL;
    ALTER TABLE ims.notifications
      ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON ims.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON ims.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON ims.notifications(user_id, is_read)
WHERE is_deleted = FALSE;

WITH seed_users AS (
  SELECT
    u.user_id,
    u.branch_id,
    ROW_NUMBER() OVER (ORDER BY u.user_id) AS rn
  FROM ims.users u
  WHERE COALESCE(u.is_active, TRUE) = TRUE
)
INSERT INTO ims.notifications (branch_id, user_id, created_by, title, message, category, link, created_at)
SELECT
  su.branch_id,
  su.user_id,
  NULL,
  CASE (su.rn - 1) % 4
    WHEN 0 THEN 'Stock alert'
    WHEN 1 THEN 'Purchase received'
    WHEN 2 THEN 'Customer payment'
    ELSE 'System notice'
  END,
  CASE (su.rn - 1) % 4
    WHEN 0 THEN 'One of your items is now below reorder level. Please review stock recount.'
    WHEN 1 THEN 'A purchase order was marked as received. Inventory and cost were updated.'
    WHEN 2 THEN 'A payment was posted to account. Check today''s finance summary.'
    ELSE 'Welcome to KeydMaal notifications. You can mark each message as read.'
  END,
  CASE (su.rn - 1) % 4
    WHEN 0 THEN 'inventory'
    WHEN 1 THEN 'purchase'
    WHEN 2 THEN 'finance'
    ELSE 'system'
  END,
  CASE (su.rn - 1) % 4
    WHEN 0 THEN '/stock'
    WHEN 1 THEN '/purchases'
    WHEN 2 THEN '/finance'
    ELSE '/dashboard'
  END,
  NOW() - ((su.rn - 1) * INTERVAL '4 minutes')
FROM seed_users su
WHERE NOT EXISTS (SELECT 1 FROM ims.notifications);

COMMIT;
