-- Create employee schedule/leave management system
BEGIN;

SET search_path TO ims, public;

-- Create schedule types enum
DO $$ BEGIN
    CREATE TYPE ims.schedule_type_enum AS ENUM ('sick_leave', 'vacation', 'personal', 'unpaid', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create schedule status enum
DO $$ BEGIN
    CREATE TYPE ims.schedule_status_enum AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create employee_schedule table
CREATE TABLE IF NOT EXISTS ims.employee_schedule (
  schedule_id BIGSERIAL PRIMARY KEY,
  emp_id BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
  schedule_type ims.schedule_type_enum NOT NULL DEFAULT 'vacation',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reason TEXT,
  status ims.schedule_status_enum NOT NULL DEFAULT 'pending',
  approved_by BIGINT REFERENCES ims.users(user_id),
  approved_at TIMESTAMP,
  notes TEXT,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT positive_days CHECK (days_count > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_schedule_employee ON ims.employee_schedule(emp_id);
CREATE INDEX IF NOT EXISTS idx_schedule_branch ON ims.employee_schedule(branch_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dates ON ims.employee_schedule(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_status ON ims.employee_schedule(status);
CREATE INDEX IF NOT EXISTS idx_schedule_type ON ims.employee_schedule(schedule_type);

-- Add trigger for automatic branch_id
DROP TRIGGER IF EXISTS trg_schedule_branch_id ON ims.employee_schedule;
CREATE TRIGGER trg_schedule_branch_id
  BEFORE INSERT ON ims.employee_schedule
  FOR EACH ROW
  EXECUTE FUNCTION ims.trg_auto_branch_id();

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS trg_schedule_updated_at ON ims.employee_schedule;
CREATE TRIGGER trg_schedule_updated_at
  BEFORE UPDATE ON ims.employee_schedule
  FOR EACH ROW
  EXECUTE FUNCTION ims.update_updated_at_column();

COMMENT ON TABLE ims.employee_schedule IS 'Employee leave and schedule management';
COMMENT ON COLUMN ims.employee_schedule.schedule_type IS 'Type of leave: sick_leave, vacation, personal, unpaid, other';
COMMENT ON COLUMN ims.employee_schedule.status IS 'Status: pending, approved, rejected, cancelled';
COMMENT ON COLUMN ims.employee_schedule.days_count IS 'Automatically calculated number of days';

COMMIT;

-- Show table structure
\d ims.employee_schedule;
