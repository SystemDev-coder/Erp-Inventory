// Debug helper: show how Trash will display deleted stock adjustments.
//
// Usage:
//   node server/scripts/check-trash-adjustments.js --from 1 --to 15
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
  const from = Number(arg('from') || 1);
  const to = Number(arg('to') || from);
  const client = new Client(db);
  await client.connect();
  try {
    await client.query(`SET app.include_deleted = '1'`);
    const res = await client.query(
      `
      SELECT
        a.adjustment_id::bigint AS id,
        CONCAT(
          COALESCE(i.name, 'Adjustment'),
          ' (',
          UPPER(COALESCE(a.adjustment_type::text, '')),
          ' ',
          COALESCE(a.quantity, 0)::text,
          ') #',
          a.adjustment_id::text
        ) AS label,
        COALESCE(u.username, '-')::text AS deleted_by,
        COALESCE(al.created_at, a.deleted_at)::timestamptz AS deleted_logged_at,
        a.deleted_at::timestamptz AS deleted_at,
        a.created_at::timestamptz AS created_at
      FROM ims.stock_adjustment a
      JOIN ims.items i ON i.item_id = a.item_id
      LEFT JOIN LATERAL (
        SELECT al.user_id, al.created_at
          FROM ims.audit_logs al
         WHERE al.action_type = 'delete'
           AND al.table_name = 'stock_adjustment'
           AND al.record_id = a.adjustment_id
         ORDER BY al.created_at DESC
         LIMIT 1
      ) al ON TRUE
      LEFT JOIN ims.users u ON u.user_id = al.user_id
      WHERE a.adjustment_id BETWEEN $1 AND $2
        AND COALESCE(a.is_deleted, 0)::int = 1
      ORDER BY a.adjustment_id ASC
      `,
      [from, to]
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

