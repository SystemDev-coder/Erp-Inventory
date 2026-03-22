import { PoolClient } from 'pg';
import { queryOne } from '../db/query';

export type CoaKey =
  | 'accountsReceivable'
  | 'accountsPayable'
  | 'inventory'
  | 'cogs'
  | 'salesRevenue'
  | 'salesReturns'
  | 'purchaseReturns'
  | 'salesTaxPayable'
  | 'customerAdvances'
  | 'supplierAdvances'
  | 'expensePayable'
  | 'payrollPayable'
  | 'operatingExpense'
  | 'payrollExpense'
  | 'ownerCapital'
  | 'openingBalanceEquity'
  | 'retainedEarnings'
  | 'ownerDrawings'
  | 'fixedAssets'
  | 'otherIncome'
  | 'inventoryGain'
  | 'inventoryShrinkage';

type CoaAccountSpec = {
  name: string;
  accountType: string;
};

const COA_SPECS: Record<CoaKey, CoaAccountSpec> = {
  accountsReceivable: { name: 'Accounts Receivable', accountType: 'asset' },
  accountsPayable: { name: 'Accounts Payable', accountType: 'liability' },
  inventory: { name: 'Inventory', accountType: 'asset' },
  cogs: { name: 'Cost of Goods Sold', accountType: 'cost' },
  salesRevenue: { name: 'Sales Revenue', accountType: 'revenue' },
  salesReturns: { name: 'Sales Returns', accountType: 'revenue' },
  purchaseReturns: { name: 'Purchase Returns', accountType: 'expense' },
  salesTaxPayable: { name: 'Sales Tax Payable', accountType: 'liability' },
  customerAdvances: { name: 'Customer Advances', accountType: 'liability' },
  supplierAdvances: { name: 'Supplier Advances', accountType: 'asset' },
  expensePayable: { name: 'Expense Payable', accountType: 'liability' },
  payrollPayable: { name: 'Payroll Payable', accountType: 'liability' },
  operatingExpense: { name: 'Operating Expense', accountType: 'expense' },
  payrollExpense: { name: 'Payroll Expense', accountType: 'expense' },
  ownerCapital: { name: 'Owner Capital', accountType: 'equity' },
  openingBalanceEquity: { name: 'Opening Balance Equity', accountType: 'equity' },
  retainedEarnings: { name: 'Retained Earnings', accountType: 'equity' },
  ownerDrawings: { name: 'Owner Drawings', accountType: 'equity' },
  fixedAssets: { name: 'Fixed Assets', accountType: 'asset' },
  otherIncome: { name: 'Other Income', accountType: 'income' },
  inventoryGain: { name: 'Inventory Gain', accountType: 'income' },
  inventoryShrinkage: { name: 'Inventory Shrinkage', accountType: 'expense' },
};

const normalizeName = (name: string) => name.trim().toLowerCase();

const findAccountByName = async (
  client: PoolClient,
  branchId: number,
  name: string
): Promise<number | null> => {
  const row = await client.query<{ acc_id: number }>(
    `SELECT acc_id
       FROM ims.accounts
      WHERE branch_id = $1
        AND LOWER(TRIM(name)) = $2
      ORDER BY acc_id
      LIMIT 1`,
    [branchId, normalizeName(name)]
  );
  return row.rows[0]?.acc_id ? Number(row.rows[0].acc_id) : null;
};

const createAccount = async (
  client: PoolClient,
  branchId: number,
  name: string,
  accountType: string
): Promise<number> => {
  const row = await client.query<{ acc_id: number }>(
    `INSERT INTO ims.accounts (branch_id, name, institution, balance, account_type, is_active)
     VALUES ($1, $2, '', 0, $3, TRUE)
     ON CONFLICT (branch_id, name) DO UPDATE
           SET account_type = EXCLUDED.account_type
     RETURNING acc_id`,
    [branchId, name, accountType]
  );
  const accId = Number(row.rows[0]?.acc_id || 0);
  if (!accId) throw new Error(`Failed to create COA account: ${name}`);
  return accId;
};

export const ensureCoaAccount = async (
  client: PoolClient,
  branchId: number,
  key: CoaKey
): Promise<number> => {
  const spec = COA_SPECS[key];
  const existing = await findAccountByName(client, branchId, spec.name);
  if (existing) {
    // Ensure account_type is correct for reporting.
    await client.query(
      `UPDATE ims.accounts
          SET account_type = $3,
              is_active = TRUE
        WHERE branch_id = $1
          AND acc_id = $2`,
      [branchId, existing, spec.accountType]
    );
    return existing;
  }
  return createAccount(client, branchId, spec.name, spec.accountType);
};

export const ensureCoaAccounts = async (
  client: PoolClient,
  branchId: number,
  keys: CoaKey[]
): Promise<Record<CoaKey, number>> => {
  const out = {} as Record<CoaKey, number>;
  for (const key of keys) {
    out[key] = await ensureCoaAccount(client, branchId, key);
  }
  return out;
};

export const ensureCoaSchema = async () => {
  // Make sure account_type supports standard types (older DBs).
  // Kept lightweight: settings service also ensures this, but this is safe for module-level calls.
  await queryOne(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'ims'
           AND t.relname = 'accounts'
           AND c.conname = 'chk_accounts_account_type'
      ) THEN
        ALTER TABLE ims.accounts DROP CONSTRAINT chk_accounts_account_type;
      END IF;

      ALTER TABLE ims.accounts
        ADD CONSTRAINT chk_accounts_account_type
        CHECK (
          account_type IN (
            'asset',
            'liability',
            'equity',
            'revenue',
            'income',
            'expense',
            'cost'
          )
        );
    END
    $$;
  `);
};
