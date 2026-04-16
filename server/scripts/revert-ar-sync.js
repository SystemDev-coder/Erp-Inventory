// Revert previously inserted AR sync journal rows (ref_table='ar_sync')
// and set Accounts Receivable stored balance to match the GL (active rows only).
//
// Usage:
//   node server/scripts/revert-ar-sync.js --branch 1
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

  const client = new Client(db);
  await client.connect();
  try {
    const arRow = (
      await client.query(
        `SELECT acc_id
           FROM ims.accounts
          WHERE branch_id = $1
            AND (LOWER(name) LIKE 'accounts receivable%' OR LOWER(name) LIKE 'account receivable%')
          ORDER BY acc_id
          LIMIT 1`,
        [branchId]
      )
    ).rows[0];
    if (!arRow?.acc_id) throw new Error('Accounts Receivable account not found');
    const arAccId = Number(arRow.acc_id);

    await client.query('BEGIN');
    try {
      const del = await client.query(
        `UPDATE ims.account_transactions
            SET is_deleted = 1,
                deleted_at = NOW()
          WHERE branch_id = $1
            AND ref_table = 'ar_sync'
            AND COALESCE(is_deleted, 0) = 0
          RETURNING txn_id`,
        [branchId]
      );

      const glRow = (
        await client.query(
          `SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)::numeric(14,2)::text AS amount
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND acc_id = $2
              AND COALESCE(is_deleted, 0) = 0`,
          [branchId, arAccId]
        )
      ).rows[0];
      const gl = toNum(glRow?.amount);

      await client.query(
        `UPDATE ims.accounts
            SET balance = $3::numeric
          WHERE branch_id = $1
            AND acc_id = $2`,
        [branchId, arAccId, gl]
      );

      await client.query('COMMIT');

      console.log(
        JSON.stringify(
          {
            branchId,
            arAccId,
            arBalanceSetTo: gl,
            arSyncTxnIdsDeleted: del.rows.map((r) => Number(r.txn_id)),
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

