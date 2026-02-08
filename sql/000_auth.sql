-- ============================================
-- ERP Inventory Management System (IMS)
-- Authentication Setup Script
-- Run this in pgAdmin on your database
-- ============================================

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS ims;

-- 2. Ensure branches table exists
CREATE TABLE IF NOT EXISTS ims.branches (
    branch_id SERIAL PRIMARY KEY,
    branch_name VARCHAR(100) NOT NULL UNIQUE,
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default branch if none exists
INSERT INTO ims.branches (branch_name, location, is_active)
SELECT 'Main Branch', 'Headquarters', true
WHERE NOT EXISTS (SELECT 1 FROM ims.branches LIMIT 1);

-- 3. Ensure roles table exists
CREATE TABLE IF NOT EXISTS ims.roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles if not exists
INSERT INTO ims.roles (role_name, description)
SELECT 'Admin', 'Administrator with full access'
WHERE NOT EXISTS (SELECT 1 FROM ims.roles WHERE role_name = 'Admin');

INSERT INTO ims.roles (role_name, description)
SELECT 'User', 'Regular user with standard access'
WHERE NOT EXISTS (SELECT 1 FROM ims.roles WHERE role_name = 'User');

-- 4. Ensure users table exists with all required columns
CREATE TABLE IF NOT EXISTS ims.users (
    user_id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES ims.branches(branch_id),
    role_id INTEGER NOT NULL REFERENCES ims.roles(role_id),
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Add phone column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'users' 
        AND column_name = 'phone'
    ) THEN
        ALTER TABLE ims.users ADD COLUMN phone VARCHAR(20);
    END IF;
END $$;

-- 6. Create unique constraint on phone (only when not null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone 
ON ims.users(phone) 
WHERE phone IS NOT NULL;

-- 7. Create refresh_tokens table for JWT refresh token management
CREATE TABLE IF NOT EXISTS ims.refresh_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON ims.users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone ON ims.users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON ims.users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON ims.users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON ims.users(is_active);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON ims.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON ims.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON ims.refresh_tokens(expires_at);

-- 9. Clean up expired and revoked refresh tokens (optional maintenance query)
-- You can run this periodically or set up a scheduled job
-- DELETE FROM ims.refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP OR revoked = true;

-- ============================================
-- Verification Queries (optional - run these to verify setup)
-- ============================================

-- Check schema
-- SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'ims';

-- Check tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'ims';

-- Check roles
-- SELECT * FROM ims.roles;

-- Check branches
-- SELECT * FROM ims.branches;

-- Check users table structure
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns 
-- WHERE table_schema = 'ims' AND table_name = 'users' ORDER BY ordinal_position;

-- ============================================
-- Setup Complete
-- ============================================
