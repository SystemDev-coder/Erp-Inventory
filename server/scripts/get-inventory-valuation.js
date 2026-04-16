// Current on-hand inventory valuation (qty on hand * cost_price).
//
// Usage:
//   node server/scripts/get-inventory-valuation.js --branch 1
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

const main = async () => {
  const branchId = Number(arg('branch') || 1);

  const client = new Client(db);
  await client.connect();
  try {
    const sql = `
      WITH item_stock AS (
        SELECT
          i.item_id,
          CASE
            WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
            ELSE COALESCE(st.total_qty, 0)
          END::numeric(14,3) AS total_qty,
          COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price
        FROM ims.items i
        LEFT JOIN (
          SELECT
            s.branch_id,
            si.product_id AS item_id,
            COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS total_qty,
            COUNT(*)::int AS row_count
          FROM ims.store_items si
          JOIN ims.stores s ON s.store_id = si.store_id
          GROUP BY s.branch_id, si.product_id
        ) st
          ON st.item_id = i.item_id
         AND st.branch_id = i.branch_id
        WHERE i.branch_id = $1
      )
      SELECT COALESCE(SUM(item_stock.total_qty * item_stock.cost_price), 0)::numeric(14,2)::text AS amount
      FROM item_stock
    `;

    const res = await client.query(sql, [branchId]);
    console.log(JSON.stringify({ branchId, inventory_value: res.rows[0]?.amount || '0.00' }, null, 2));
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

