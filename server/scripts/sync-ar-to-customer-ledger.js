// Reconcile Accounts Receivable GL balance to match the customer balances.
//
// This inserts a balancing journal (account_transactions) between:
// - Accounts Receivable (asset)
// - Opening Balance Equity (equity) as the offset
//
// Usage:
//   node server/scripts/sync-ar-to-customer-ledger.js --branch 1 --date 2026-03-01
//
// Defaults:
//   --branch 1
//   --date   (NOW())
//
// Optional env vars:
//   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

const { Client } = require('pg');

const db = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '123',
  database: process.env.PGDATABASE || 'erp_inventory',
};

const arg = (name) => {
  const idx = process.argv.findIndex((a) => a === `--${name}` || a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};

const toNum = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

const main = async () => {
  const branchId = Number(arg('branch') || 1);
  const txnDate = arg('date'); // optional, YYYY-MM-DD or timestamp

  const client = new Client(db);
  await client.connect();
  try {
    // Find AR account
    const arRow = (
      await client.query(
        `SELECT acc_id, name
           FROM ims.accounts
          WHERE branch_id = $1
            AND (
              LOWER(name) LIKE 'accounts receivable%'
              OR LOWER(name) LIKE 'account receivable%'
              OR LOWER(name) LIKE '%accounts receivable%'
            )
          ORDER BY acc_id
          LIMIT 1`,
        [branchId]
      )
    ).rows[0];
    if (!arRow?.acc_id) throw new Error('Accounts Receivable account not found');

    // Find Opening Balance Equity (offset)
    const obeRow = (
      await client.query(
        `SELECT acc_id, name
           FROM ims.accounts
          WHERE branch_id = $1
            AND LOWER(name) LIKE '%opening balance%'
            AND LOWER(name) LIKE '%equity%'
          ORDER BY acc_id
          LIMIT 1`,
        [branchId]
      )
    ).rows[0];
    if (!obeRow?.acc_id) throw new Error('Opening Balance Equity account not found');

    // Target receivable = sum of customer balances (remaining_balance preferred).
    const balanceCols = (
      await client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'customers'`
      )
    ).rows.map((r) => r.column_name);
    const hasRemaining = balanceCols.includes('remaining_balance');
    const hasOpen = balanceCols.includes('open_balance');
    const balanceExpr = hasRemaining
      ? 'COALESCE(remaining_balance, 0)'
      : hasOpen
        ? 'COALESCE(open_balance, 0)'
        : '0';

    const targetRow = (
      await client.query(
        `SELECT COALESCE(SUM(${balanceExpr}), 0)::numeric(14,2)::text AS amount
           FROM ims.customers
          WHERE branch_id = $1
            AND COALESCE(is_deleted, 0) = 0`,
        [branchId]
      )
    ).rows[0];
    const target = toNum(targetRow?.amount);

    const glRow = (
      await client.query(
        `SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)::numeric(14,2)::text AS amount
           FROM ims.account_transactions
          WHERE branch_id = $1
            AND acc_id = $2
            AND COALESCE(is_deleted, 0) = 0`,
        [branchId, Number(arRow.acc_id)]
      )
    ).rows[0];
    const gl = toNum(glRow?.amount);

    const diff = toNum(gl - target);
    if (Math.abs(diff) <= 0.005) {
      console.log(
        JSON.stringify(
          {
            branchId,
            arAccId: Number(arRow.acc_id),
            openingBalanceEquityAccId: Number(obeRow.acc_id),
            target,
            gl,
            diff: 0,
            inserted: false,
          },
          null,
          2
        )
      );
      return;
    }

    // If GL is higher than target, we need to CREDIT AR to reduce it by diff.
    const arDebit = diff < 0 ? Math.abs(diff) : 0;
    const arCredit = diff > 0 ? diff : 0;
    const obeDebit = arCredit; // offset
    const obeCredit = arDebit;

    const note = `[AR SYNC] Adjust AR to customer balances (diff=${diff.toFixed(2)})`;

    await client.query('BEGIN');
    try {
      const dateValue = txnDate ? txnDate : null;
      const insertSql = `
        INSERT INTO ims.account_transactions
          (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
        VALUES
          ($1, $2, 'other', 'ar_sync', NULL, $3, $4, COALESCE($5::timestamptz, NOW()), $6)
        RETURNING txn_id
      `;

      const arIns = await client.query(insertSql, [
        branchId,
        Number(arRow.acc_id),
        arDebit,
        arCredit,
        dateValue,
        note,
      ]);
      const obeIns = await client.query(insertSql, [
        branchId,
        Number(obeRow.acc_id),
        obeDebit,
        obeCredit,
        dateValue,
        note,
      ]);

      await client.query('COMMIT');

      const glAfterRow = (
        await client.query(
          `SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)::numeric(14,2)::text AS amount
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND acc_id = $2
              AND COALESCE(is_deleted, 0) = 0`,
          [branchId, Number(arRow.acc_id)]
        )
      ).rows[0];
      const glAfter = toNum(glAfterRow?.amount);

      console.log(
        JSON.stringify(
          {
            branchId,
            arAccId: Number(arRow.acc_id),
            openingBalanceEquityAccId: Number(obeRow.acc_id),
            target,
            glBefore: gl,
            glAfter,
            diff,
            inserted: true,
            txnIds: {
              ar: Number(arIns.rows[0]?.txn_id),
              openingBalanceEquity: Number(obeIns.rows[0]?.txn_id),
            },
          },
          null,
          2
        )
      );
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

