-- ============================================
-- Authentication System Database Patches
-- Run this in pgAdmin if columns don't exist
-- SAFE TO RUN MULTIPLE TIMES
-- ============================================

-- Add phone column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'phone'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN phone VARCHAR(30);
        CREATE UNIQUE INDEX uq_users_phone ON ims.users(phone) WHERE phone IS NOT NULL;
    END IF;
END $$;

-- Add refresh_token_hash column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'refresh_token_hash'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN refresh_token_hash TEXT;
    END IF;
END $$;

-- Add reset_code_hash column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'reset_code_hash'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN reset_code_hash TEXT;
    END IF;
END $$;

-- Add reset_code_expires column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'reset_code_expires'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN reset_code_expires TIMESTAMPTZ;
    END IF;
END $$;

-- Add last_login_at column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'last_login_at'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN last_login_at TIMESTAMPTZ;
    END IF;
END $$;

-- Ensure Admin and User roles exist
INSERT INTO ims.roles (role_name)
VALUES ('Admin')
ON CONFLICT DO NOTHING;

INSERT INTO ims.roles (role_name)
VALUES ('User')
ON CONFLICT DO NOTHING;

-- Ensure at least one branch exists
INSERT INTO ims.branches (branch_name, address, is_active)
SELECT 'Main Branch', 'Headquarters', true
WHERE NOT EXISTS (SELECT 1 FROM ims.branches WHERE is_active = true LIMIT 1);

-- Verify setup
SELECT 'Setup complete!' as status;
