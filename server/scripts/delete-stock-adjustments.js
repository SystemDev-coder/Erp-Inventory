// Delete (reverse) stock adjustments safely.
//
// This script reverses the qty impact on:
// - ims.store_items (per item's resolved store)
// - ims.items.quantity (if column exists) OR ims.items.opening_balance (fallback)
// then deletes rows from ims.stock_adjustment.
//
// Usage:
//   node server/scripts/delete-stock-adjustments.js --ids 1,2,3 --apply
//   node server/scripts/delete-stock-adjustments.js --from 1 --to 15 --apply
//   node server/scripts/delete-stock-adjustments.js --list --from 1 --to 15
//
// Optional env vars:
//   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
// Optional flags:
//   --allow-negative   (bypass negative-stock check)
//
// NOTE: By default this is a dry-run unless you pass --apply.

const { Client } = require('pg');

const db = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '123',
  database: process.env.PGDATABASE || 'erp_inventory',
};

const hasFlag = (name) => process.argv.some((a) => a === `--${name}` || a === name);

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

const getSignedQty = (adjustmentType, quantity, status) => {
  const sign = String(adjustmentType || '').toUpperCase() === 'DECREASE' ? -1 : 1;
  const qty = sign * Number(quantity || 0);
  const st = String(status || 'POSTED').toUpperCase();
  return st === 'POSTED' ? qty : 0;
};

const ensureStoreForItem = async (client, branchId, itemId) => {
  const itemStore = await client.query(
    `SELECT store_id
       FROM ims.items
      WHERE item_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [itemId, branchId]
  );
  const directStoreId = Number(itemStore.rows[0]?.store_id || 0);
  if (directStoreId > 0) {
    const scopedStore = await client.query(
      `SELECT store_id
         FROM ims.stores
        WHERE store_id = $1
          AND branch_id = $2
        LIMIT 1`,
      [directStoreId, branchId]
    );
    if (scopedStore.rows[0]) return Number(scopedStore.rows[0].store_id);
  }

  const fallback = await client.query(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
      ORDER BY store_id
      LIMIT 1`,
    [branchId]
  );
  const storeId = Number(fallback.rows[0]?.store_id || 0);
  if (!storeId) throw new Error(`No store configured for branch ${branchId} (item ${itemId})`);
  return storeId;
};

const main = async () => {
  const ids = parseIds();
  const apply = hasFlag('apply');
  const listOnly = hasFlag('list') || !apply;
  const allowNegative = hasFlag('allow-negative');

  if (!ids.length) {
    console.error('No ids provided. Use --ids 1,2 or --from 1 --to 15.');
    process.exitCode = 2;
    return;
  }

  const client = new Client(db);
  await client.connect();

  const hasItemsQty = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'items'
          AND column_name = 'quantity'
     ) AS has_column`
  );
  const itemsHasQty = Boolean(hasItemsQty.rows[0]?.has_column);

  const results = [];
  let totalValueDelta = 0;

  try {
    if (apply) await client.query('BEGIN');

    for (const id of ids) {
      const rowRes = await client.query(
        `SELECT a.adjustment_id,
                a.item_id,
                a.adjustment_type::text AS adjustment_type,
                a.quantity::text AS quantity,
                a.status::text AS status,
                COALESCE(a.is_deleted, 0)::int AS is_deleted,
                a.adjustment_date::text AS adjustment_date,
                a.reason,
                i.branch_id,
                i.name AS item_name,
                COALESCE(i.cost_price, 0)::numeric(14,2)::text AS cost_price,
                COALESCE(i.opening_balance, 0)::numeric(14,3)::text AS opening_balance,
                i.store_id
           FROM ims.stock_adjustment a
           JOIN ims.items i ON i.item_id = a.item_id
          WHERE a.adjustment_id = $1
          LIMIT 1
          FOR UPDATE`,
        [id]
      );

      const adj = rowRes.rows[0];
      if (!adj) {
        results.push({ id, ok: false, error: 'NOT_FOUND' });
        continue;
      }

      const appliedQty = getSignedQty(adj.adjustment_type, adj.quantity, adj.status);
      const delta = -Math.round(appliedQty); // match inventory.service.ts applyStoreItemDelta rounding
      const costPrice = Number(adj.cost_price || 0);
      const valueDelta = Number((delta * costPrice).toFixed(2));
      totalValueDelta += valueDelta;

      if (listOnly) {
        results.push({
          id,
          item_id: Number(adj.item_id),
          item_name: adj.item_name,
          branch_id: Number(adj.branch_id),
          adjustment_type: adj.adjustment_type,
          quantity: Number(adj.quantity),
          status: adj.status,
          is_deleted: Number(adj.is_deleted || 0),
          applied_qty: appliedQty,
          reverse_delta: delta,
          cost_price: costPrice,
          value_delta: valueDelta,
          would_delete: true,
        });
        continue;
      }

      if (delta !== 0) {
        const branchId = Number(adj.branch_id);
        const itemId = Number(adj.item_id);
        const storeId = await ensureStoreForItem(client, branchId, itemId);

        const storeItem = await client.query(
          `SELECT quantity::text AS quantity
             FROM ims.store_items
            WHERE store_id = $1
              AND product_id = $2
            FOR UPDATE`,
          [storeId, itemId]
        );

        let currentStoreQty = Number(storeItem.rows[0]?.quantity || 0);
        if (!storeItem.rows[0]) currentStoreQty = Number(adj.opening_balance || 0);
        const nextStoreQty = currentStoreQty + delta;

        if (!allowNegative && nextStoreQty < 0) {
          throw new Error(
            `Insufficient stock reversing adjustment ${id} for item ${itemId} (${adj.item_name}). Current ${currentStoreQty}, delta ${delta}`
          );
        }

        await client.query(
          `INSERT INTO ims.store_items (store_id, product_id, quantity)
           VALUES ($1, $2, GREATEST(0, $3))
           ON CONFLICT (store_id, product_id)
           DO UPDATE
                 SET quantity = GREATEST(0, ims.store_items.quantity + $4),
                     updated_at = NOW()`,
          [storeId, itemId, nextStoreQty, delta]
        );

        // Mirror the inventory.service.ts behavior:
        // If items.quantity exists, update it; otherwise adjust opening_balance.
        const itemQtyColExpr = itemsHasQty
          ? `COALESCE(quantity, COALESCE(opening_balance, 0))`
          : `COALESCE(opening_balance, 0)`;

        const itemQtyRes = await client.query(
          `SELECT ${itemQtyColExpr}::text AS quantity
             FROM ims.items
            WHERE item_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [itemId, branchId]
        );
        const currentItemQty = Number(itemQtyRes.rows[0]?.quantity || 0);
        const nextItemQty = currentItemQty + delta;
        if (!allowNegative && nextItemQty < 0) {
          throw new Error(
            `Insufficient item stock reversing adjustment ${id} for item ${itemId}. Current ${currentItemQty}, delta ${delta}`
          );
        }

        if (itemsHasQty) {
          await client.query(
            `UPDATE ims.items
                SET quantity = $3
              WHERE item_id = $1
                AND branch_id = $2`,
            [itemId, branchId, nextItemQty]
          );
        } else {
          await client.query(
            `UPDATE ims.items
                SET opening_balance = $3
              WHERE item_id = $1
                AND branch_id = $2`,
            [itemId, branchId, Math.max(0, nextItemQty)]
          );
        }
      }

      results.push({
        id,
        ok: true,
        item_id: Number(adj.item_id),
        item_name: adj.item_name,
        reverse_delta: delta,
        value_delta: valueDelta,
      });

      await client.query(
        `UPDATE ims.stock_adjustment
            SET status = 'CANCELLED',
                is_deleted = 1,
                deleted_at = NOW(),
                updated_at = NOW()
          WHERE adjustment_id = $1`,
        [id]
      );
    }

    if (apply) await client.query('COMMIT');
  } catch (err) {
    if (apply) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw err;
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify(
      {
        mode: listOnly ? 'dry_run' : 'applied',
        items_quantity_column: itemsHasQty,
        ids,
        total_value_delta: Number(totalValueDelta.toFixed(2)),
        results,
      },
      null,
      2
    )
  );
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
