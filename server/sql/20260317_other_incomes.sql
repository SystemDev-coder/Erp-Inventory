-- Other income entries (ad-hoc income not coming from sales)
-- Used by Finance -> Accounts -> Other Income tab.

CREATE TABLE IF NOT EXISTS ims.other_incomes (
  other_income_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  income_name VARCHAR(160) NOT NULL,
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted SMALLINT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_other_incomes_branch_date ON ims.other_incomes(branch_id, income_date);
CREATE INDEX IF NOT EXISTS idx_other_incomes_acc ON ims.other_incomes(acc_id);

