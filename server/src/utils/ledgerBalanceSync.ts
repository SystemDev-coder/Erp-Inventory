import { queryMany, queryOne } from '../db/query';

const hasColumn = async (table: string, column: string): Promise<boolean> => {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return Boolean(row?.exists);
};

const syncCustomerBalances = async (branchId: number) => {
  const hasRemaining = await hasColumn('customers', 'remaining_balance');
  const setParts = [
    `open_balance = CASE
       WHEN COALESCE(c.open_balance, 0) = 0 THEN COALESCE(l.balance, c.open_balance)
       ELSE c.open_balance
     END`,
  ];
  if (hasRemaining) {
    setParts.push(
      `remaining_balance = CASE
         WHEN COALESCE(c.remaining_balance, 0) = 0 THEN COALESCE(l.balance, c.remaining_balance)
         ELSE c.remaining_balance
       END`
    );
  }
  const sql = `
    WITH ledger AS (
      SELECT
        customer_id,
        COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) AS balance
      FROM ims.customer_ledger
      WHERE branch_id = $1
      GROUP BY customer_id
    )
    UPDATE ims.customers c
       SET ${setParts.join(', ')}
      FROM ledger l
     WHERE c.branch_id = $1
       AND c.customer_id = l.customer_id
  `;
  await queryOne(sql, [branchId]);
};

const syncSupplierBalances = async (branchId: number) => {
  const hasRemaining = await hasColumn('suppliers', 'remaining_balance');
  const setParts = [
    `open_balance = CASE
       WHEN COALESCE(s.open_balance, 0) = 0 THEN COALESCE(l.balance, s.open_balance)
       ELSE s.open_balance
     END`,
  ];
  if (hasRemaining) {
    setParts.push(
      `remaining_balance = CASE
         WHEN COALESCE(s.remaining_balance, 0) = 0 THEN COALESCE(l.balance, s.remaining_balance)
         ELSE s.remaining_balance
       END`
    );
  }
  const sql = `
    WITH ledger AS (
      SELECT
        supplier_id,
        COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0) AS balance
      FROM ims.supplier_ledger
      WHERE branch_id = $1
      GROUP BY supplier_id
    )
    UPDATE ims.suppliers s
       SET ${setParts.join(', ')}
      FROM ledger l
     WHERE s.branch_id = $1
       AND s.supplier_id = l.supplier_id
  `;
  await queryOne(sql, [branchId]);
};

const syncBranch = async (branchId: number) => {
  await syncCustomerBalances(branchId);
  await syncSupplierBalances(branchId);
};

export const syncLedgerBalances = async (branchId?: number) => {
  if (branchId) {
    await syncBranch(branchId);
    return;
  }
  const branches = await queryMany<{ branch_id: number }>(
    `SELECT branch_id FROM ims.branches WHERE is_active = TRUE`
  );
  for (const branch of branches) {
    await syncBranch(Number(branch.branch_id));
  }
};
