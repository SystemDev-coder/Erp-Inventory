-- "Liability Payments": a generic way to pay down any liability account (Sales Tax
-- Payable, Expense Payable, Payroll Payable, Customer Advances, etc). None of these
-- had a settlement path before - Accounts Payable has Supplier Receipts, Expense
-- Payable has "Pay Expense Charge", Payroll Payable has Employee Payment, but Sales
-- Tax Payable (and any other liability account) had nothing. Shape mirrors
-- ims.account_transfers, the closest existing "move money, post GL" pattern.
CREATE TABLE IF NOT EXISTS ims.liability_payments (
    liability_payment_id BIGSERIAL PRIMARY KEY,
    branch_id             BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    liability_acc_id      BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    pay_from_acc_id        BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    amount                 NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    pay_date               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_no           VARCHAR(80),
    note                   TEXT,
    user_id                BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_liability_payment_diff CHECK (liability_acc_id <> pay_from_acc_id)
);

DROP TRIGGER IF EXISTS trg_audit_all_tables ON ims.liability_payments;
CREATE TRIGGER trg_audit_all_tables AFTER INSERT OR DELETE OR UPDATE ON ims.liability_payments
  FOR EACH ROW EXECUTE FUNCTION ims.fn_audit_all_tables();
