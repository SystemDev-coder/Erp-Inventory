// Fix inventory_movements.move_date for existing sales/purchase returns
// so it matches the corresponding return_date.
//
// Usage (host machine):
//   node server/scripts/fix-return-move-dates.js
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

const run = async () => {
  const client = new Client(db);
  await client.connect();
  try {
    const q1 =
      "UPDATE ims.inventory_movements im " +
      "SET move_date = sr.return_date " +
      "FROM ims.sales_returns sr " +
      "WHERE im.ref_table = 'sales_returns' " +
      "  AND im.move_type = 'sales_return' " +
      "  AND im.ref_id = sr.sr_id " +
      "  AND im.branch_id = sr.branch_id " +
      "  AND COALESCE(im.is_deleted, 0) = 0 " +
      "  AND CAST(im.move_date AS date) IS DISTINCT FROM CAST(sr.return_date AS date)";

    const q2 =
      "UPDATE ims.inventory_movements im " +
      "SET move_date = pr.return_date " +
      "FROM ims.purchase_returns pr " +
      "WHERE im.ref_table = 'purchase_returns' " +
      "  AND im.move_type = 'purchase_return' " +
      "  AND im.ref_id = pr.pr_id " +
      "  AND im.branch_id = pr.branch_id " +
      "  AND COALESCE(im.is_deleted, 0) = 0 " +
      "  AND CAST(im.move_date AS date) IS DISTINCT FROM CAST(pr.return_date AS date)";

    const r1 = await client.query(q1);
    const r2 = await client.query(q2);

    console.log(
      JSON.stringify(
        {
          salesReturnMovesUpdated: r1.rowCount,
          purchaseReturnMovesUpdated: r2.rowCount,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
};

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

