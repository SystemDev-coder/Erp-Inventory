// Backfill audit_logs "delete" rows for soft-deleted stock adjustments so the Trash screen can show "Deleted By".
//
// Usage:
//   node server/scripts/backfill-stock-adjustment-delete-audit.js --from 1 --to 15 --username isfahan
//   node server/scripts/backfill-stock-adjustment-delete-audit.js --ids 1,2,3 --user-id 5
//
// Notes:
// - This does NOT change inventory quantities.
// - It only inserts missing audit_logs rows with action_type='delete' and record_id=adjustment_id.
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

const parseIds = () => {
  const idsArg = arg('ids');
  if (idsArg) {
    return idsArg
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  const from = Number(arg('from') || 0);
  const to = Number(arg('to') || 0);
  if (from > 0 && to > 0 && to >= from) {
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return [];
};

const main = async () => {
  const ids = parseIds();
  if (!ids.length) {
    console.error('No ids provided. Use --ids 1,2 or --from 1 --to 15.');
    process.exitCode = 2;
    return;
  }

  const forcedUserId = arg('user-id') ? Number(arg('user-id')) : null;
  const username = arg('username') ? String(arg('username')).trim() : null;

  const client = new Client(db);
  await client.connect();
  try {
    // Allow selecting soft-deleted rows (RLS policy).
    await client.query(`SET app.include_deleted = '1'`);

    let userId = forcedUserId;
    if (!userId && username) {
      const userRes = await client.query(
        `SELECT user_id::bigint AS user_id
           FROM ims.users
          WHERE LOWER(COALESCE(username, '')) = LOWER($1)
          LIMIT 1`,
        [username]
      );
      userId = Number(userRes.rows[0]?.user_id || 0) || null;
      if (!userId) {
        throw new Error(`Username not found: ${username}`);
      }
    }

    const results = [];
    for (const id of ids) {
      const adjRes = await client.query(
        `SELECT a.adjustment_id::bigint AS adjustment_id,
                a.created_by::bigint AS created_by,
                a.deleted_at::timestamptz AS deleted_at,
                COALESCE(a.is_deleted, 0)::int AS is_deleted,
                i.branch_id::bigint AS branch_id
           FROM ims.stock_adjustment a
           JOIN ims.items i ON i.item_id = a.item_id
          WHERE a.adjustment_id = $1
          LIMIT 1`,
        [id]
      );
      const adj = adjRes.rows[0];
      if (!adj) {
        results.push({ id, ok: false, error: 'NOT_FOUND' });
        continue;
      }

      const deletedAt = adj.deleted_at || new Date();
      const deletedBy = userId || Number(adj.created_by || 0) || null;

      const exists = await client.query(
        `SELECT 1
           FROM ims.audit_logs
          WHERE action_type = 'delete'
            AND table_name = 'stock_adjustment'
            AND record_id = $1
          LIMIT 1`,
        [id]
      );
      if (exists.rowCount > 0) {
        results.push({ id, ok: true, inserted: false, deleted_by_id: deletedBy });
        continue;
      }

      await client.query(
        `INSERT INTO ims.audit_logs
           (branch_id, user_id, action_type, table_name, record_id, old_values, new_values, ip_address, user_agent, created_at)
         VALUES
           ($1, $2, 'delete', 'stock_adjustment', $3, NULL, NULL, NULL, NULL, $4)`,
        [Number(adj.branch_id || 0) || null, deletedBy, id, deletedAt]
      );

      results.push({ id, ok: true, inserted: true, deleted_by_id: deletedBy });
    }

    console.log(JSON.stringify({ ids, user_id: userId, username, results }, null, 2));
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

