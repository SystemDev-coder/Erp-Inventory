-- Restores ims.shifts, which server/src/modules/shifts/* (open/close/void a cash
-- session per user+branch) and frontend/src/pages/Employees/ShiftModal.tsx already
-- depend on, but whose CREATE TABLE was accidentally dropped from
-- Full_complete_scheme.sql in a later commit - the table never existed on any real
-- database. This is also exactly the "POS Register" concept the new POS feature needs
-- (open with a starting float, close by counting cash), so it's restored here and
-- linked to ims.sales via a new nullable pos_shift_id column that both marks a sale as
-- POS-originated and lets register close compute expected cash vs. counted cash.
CREATE TABLE IF NOT EXISTS ims.shifts (
    shift_id      BIGSERIAL PRIMARY KEY,
    branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id       BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ,
    opening_cash  NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_cash  NUMERIC(14,2) NOT NULL DEFAULT 0,
    status        ims.shift_status_enum NOT NULL DEFAULT 'open',
    note          TEXT
);

DROP TRIGGER IF EXISTS trg_audit_all_tables ON ims.shifts;
CREATE TRIGGER trg_audit_all_tables AFTER INSERT OR DELETE OR UPDATE ON ims.shifts
  FOR EACH ROW EXECUTE FUNCTION ims.fn_audit_all_tables();

ALTER TABLE ims.sales ADD COLUMN IF NOT EXISTS pos_shift_id BIGINT REFERENCES ims.shifts(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_pos_shift ON ims.sales(pos_shift_id) WHERE pos_shift_id IS NOT NULL;
