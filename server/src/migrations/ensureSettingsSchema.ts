import { query } from '../db/query';

/**
 * Lightweight bootstrap to ensure settings-related tables/columns exist.
 * Runs on server start; safe to run repeatedly.
 */
export async function ensureSettingsSchema() {
  // Ensure schema exists
  await query(`CREATE SCHEMA IF NOT EXISTS ims`);

  // Company info singleton table
  await query(`
    CREATE TABLE IF NOT EXISTS ims.company_info (
      company_id INTEGER PRIMARY KEY DEFAULT 1,
      company_name VARCHAR(200) NOT NULL,
      logo_img TEXT,
      banner_img TEXT,
      phone VARCHAR(50),
      manager_name VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`
    INSERT INTO ims.company_info (company_id, company_name)
    SELECT 1, 'My Company'
    WHERE NOT EXISTS (SELECT 1 FROM ims.company_info WHERE company_id = 1);
  `);

  // Branches table: add missing columns if needed
  await query(`
    ALTER TABLE ims.branches
      ADD COLUMN IF NOT EXISTS location VARCHAR(255),
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  `);

  // Audit logs table
  await query(`
    CREATE TABLE IF NOT EXISTS ims.audit_logs (
      audit_id SERIAL PRIMARY KEY,
      user_id INTEGER,
      action VARCHAR(150) NOT NULL,
      entity VARCHAR(150),
      entity_id INTEGER,
      meta JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // If audit_logs already exists without audit_id, add it and set PK
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ims' AND table_name = 'audit_logs' AND column_name = 'audit_id'
      ) THEN
        ALTER TABLE ims.audit_logs ADD COLUMN audit_id SERIAL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'ims'
          AND tc.table_name = 'audit_logs'
          AND tc.constraint_type = 'PRIMARY KEY'
      ) THEN
        ALTER TABLE ims.audit_logs ADD PRIMARY KEY (audit_id);
      END IF;
    END$$;
  `);
}
