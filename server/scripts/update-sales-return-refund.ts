const arg = (name: string) => {
  const idx = process.argv.findIndex((a) => a === name || a === `--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};

const ensureEnv = () => {
  process.env.NODE_ENV ||= 'development';
  process.env.PORT ||= '5000';
  process.env.PGSCHEMA ||= 'ims';
  process.env.PGHOST ||= '127.0.0.1';
  process.env.PGPORT ||= '5433';
  process.env.PGDATABASE ||= 'erp_inventory';
  process.env.PGUSER ||= 'ims_app';
  process.env.PGPASSWORD ||= '123';
  process.env.CLIENT_ORIGIN ||= 'http://localhost:5173';
  process.env.JWT_ACCESS_SECRET ||= 'dev-access-secret-32-chars-xxxxxxxxxxxx';
  process.env.JWT_REFRESH_SECRET ||= 'dev-refresh-secret-32-chars-xxxxxxxxxxx';
};

const main = async () => {
  ensureEnv();

  // Import after env is set (env.ts validates at import time).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pool } = require('../src/db/pool') as typeof import('../src/db/pool');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { returnsService } = require('../src/modules/returns/returns.service') as typeof import('../src/modules/returns/returns.service');

  const srId = Number(arg('sr') ?? arg('srId') ?? 1);
  const refundAmount = Number(arg('refund') ?? arg('refundAmount') ?? 3070);
  const refundAccId = Number(arg('acc') ?? arg('refundAccId') ?? 5);
  const returnDate = arg('date') ?? arg('returnDate') ?? '2026-03-01';
  const userId = Number(arg('user') ?? arg('userId') ?? 1);

  const client = await pool.connect();
  try {
    const sr = await client.query<{
      sr_id: number;
      branch_id: number;
      sale_id: number | null;
      customer_id: number | null;
      note: string | null;
    }>(
      `SELECT sr_id, branch_id, sale_id, customer_id, note
         FROM ims.sales_returns
        WHERE sr_id = $1
        LIMIT 1`,
      [srId]
    );
    if (!sr.rows[0]) throw new Error(`Sales return ${srId} not found`);
    const current = sr.rows[0];
    if (!current.customer_id) throw new Error(`Sales return ${srId} has no customer_id`);

    const items = await client.query<{
      item_id: number;
      quantity: string;
      unit_price: string;
    }>(
      `SELECT item_id, quantity::text AS quantity, unit_price::text AS unit_price
         FROM ims.sales_return_items
        WHERE sr_id = $1
          AND COALESCE(is_deleted, 0) = 0
        ORDER BY sr_item_id`,
      [srId]
    );
    if (!items.rows.length) throw new Error(`Sales return ${srId} has no active items`);

    const scope = {
      isAdmin: true,
      branchIds: [Number(current.branch_id)],
      primaryBranchId: Number(current.branch_id),
    };

    const input = {
      saleId: current.sale_id,
      customerId: Number(current.customer_id),
      returnDate,
      note: current.note,
      refundAccId,
      refundAmount,
      items: items.rows.map((r) => ({
        itemId: Number(r.item_id),
        quantity: Number(r.quantity),
        unitPrice: Number(r.unit_price),
      })),
    };

    await returnsService.updateSalesReturn(srId, input as any, scope, { userId });

    const check = await client.query(
      `SELECT
          sr_id,
          total::text AS total,
          balance_adjustment::text AS balance_adjustment,
          return_date::date AS return_date
         FROM ims.sales_returns
        WHERE sr_id = $1`,
      [srId]
    );
    console.log(JSON.stringify({ updated: check.rows[0] }, null, 2));
  } finally {
    client.release();
  }
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
