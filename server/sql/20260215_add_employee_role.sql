-- Add role column to employees table
-- This allows each employee to have a designated role

BEGIN;

SET search_path TO ims, public;

-- Add role_id column to employees table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'employees' 
        AND column_name = 'role_id'
    ) THEN
        ALTER TABLE ims.employees 
        ADD COLUMN role_id BIGINT REFERENCES ims.roles(role_id);
        
        RAISE NOTICE 'Added role_id column to employees table';
    ELSE
        RAISE NOTICE 'role_id column already exists in employees table';
    END IF;
END $$;

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_employees_role ON ims.employees(role_id);

COMMENT ON COLUMN ims.employees.role_id IS 'Employee job role - used for user generation';

COMMIT;
