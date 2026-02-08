-- ============================================
-- RBAC Database Patches
-- Run this AFTER seed_permissions.sql
-- SAFE TO RUN MULTIPLE TIMES
-- ============================================

-- Ensure all required columns exist on ims.users
DO $$ 
BEGIN
    -- phone column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' AND table_name = 'users' AND column_name = 'phone'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN phone VARCHAR(30);
        CREATE UNIQUE INDEX uq_users_phone ON ims.users(phone) WHERE phone IS NOT NULL;
    END IF;

    -- refresh_token_hash column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' AND table_name = 'users' AND column_name = 'refresh_token_hash'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN refresh_token_hash TEXT;
    END IF;

    -- reset_code_hash column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' AND table_name = 'users' AND column_name = 'reset_code_hash'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN reset_code_hash TEXT;
    END IF;

    -- reset_code_expires column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' AND table_name = 'users' AND column_name = 'reset_code_expires'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN reset_code_expires TIMESTAMPTZ;
    END IF;

    -- last_login_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' AND table_name = 'users' AND column_name = 'last_login_at'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN last_login_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_permissions_module ON ims.permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_perm_key ON ims.permissions(perm_key);

-- Verify
SELECT 'RBAC patches applied successfully!' as status;
