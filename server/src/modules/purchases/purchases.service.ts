import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { BranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';
import { syncLowStockNotifications } from '../../utils/stockAlerts';
import { PurchaseInput, PurchaseItemInput } from './purchases.schemas';
import { PoolClient } from 'pg';

export interface Purchase {
  purchase_id: number;
  branch_id: number;
  store_id?: number | null;
  user_id: number;
  supplier_id: number;
  supplier_name?: string | null;
  fx_rate: number;
  purchase_date: string;
  purchase_type: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  note: string | null;
}

export interface PurchaseItem {
  purchase_item_id: number;
  purchase_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  sale_price?: number | null;
  line_total: number;
  batch_no?: string | null;
  expiry_date?: string | null;
}

export interface PurchaseItemView extends PurchaseItem {
  purchase_date: string;
  supplier_id: number;
  supplier_name: string | null;
  product_name: string | null;
  cost_price?: number | null;
  sale_price?: number | null;
  purchase_type: string;
}

const normalizeItemName = (value: string) => value.trim().replace(/\s+/g, ' ');
const AUTO_PURCHASE_NOTE_PREFIX = '[AUTO-PURCHASE]';
type PurchaseStatus = 'received' | 'partial' | 'unpaid' | 'void';

interface PreparedPurchaseItem {
  productId: number;
  quantity: number;
  unitCost: number;
  salePrice: number | null;
  discount: number;
  batchNo: string | null;
  expiryDate: string | null;
  description: string | null;
  lineTotal: number;
}

interface PurchaseStockLine {
  itemId: number;
  quantity: number;
  unitCost: number;
}

interface SupplierBalanceColumns {
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
}

let cachedSupplierBalanceColumns: SupplierBalanceColumns | null = null;

const resolveProductForPurchaseItem = async (
  client: PoolClient,
  item: PurchaseItemInput,
  branchId: number,
  supplierId: number | null
): Promise<number> => {
  const requestedCost = Number(item.unitCost || 0);

  if (item.productId) {
    const existing = await client.query<{
      product_id: number;
      current_sale: string;
    }>(
      `SELECT
          item_id AS product_id,
          COALESCE(NULLIF(sell_price, 0), cost_price, 0)::text AS current_sale
       FROM ims.items
       WHERE item_id = $1
         AND branch_id = $2
       LIMIT 1`,
      [item.productId, branchId]
    );
    if (!existing.rows[0]) {
      throw ApiError.badRequest('Selected item does not belong to this branch');
    }

    const nextSale = item.salePrice !== undefined
      ? Number(item.salePrice)
      : Number(existing.rows[0].current_sale || requestedCost);

    await client.query(
      `UPDATE ims.items
          SET cost_price = $2,
              sell_price = $3,
              is_active = TRUE
        WHERE item_id = $1`,
      [item.productId, requestedCost, nextSale]
    );
    return Number(item.productId);
  }

  const itemName = normalizeItemName(item.description || '');
  if (!itemName) {
    throw ApiError.badRequest('Item name is required when no existing item is selected');
  }

  const existingByName = await client.query<{
    product_id: number;
    current_sale: string;
  }>(
    `SELECT
        item_id AS product_id,
        COALESCE(NULLIF(sell_price, 0), cost_price, 0)::text AS current_sale
     FROM ims.items
     WHERE branch_id = $1
       AND LOWER(name) = LOWER($2)
     ORDER BY item_id DESC
     LIMIT 1`,
    [branchId, itemName]
  );

  if (existingByName.rows[0]) {
    const productId = Number(existingByName.rows[0].product_id);
    const nextSale = item.salePrice !== undefined
      ? Number(item.salePrice)
      : Number(existingByName.rows[0].current_sale || requestedCost);
    await client.query(
      `UPDATE ims.items
          SET cost_price = $2,
              sell_price = $3,
              is_active = TRUE
        WHERE item_id = $1`,
      [productId, requestedCost, nextSale]
    );
    return productId;
  }
  const nextSale = item.salePrice !== undefined ? Number(item.salePrice) : requestedCost;

  const created = await client.query<{ product_id: number }>(
    `INSERT INTO ims.items
       (branch_id, name, cost_price, sell_price, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING item_id AS product_id`,
    [branchId, itemName, requestedCost, nextSale]
  );
  const newProductId = Number(created.rows[0].product_id);

  // Link supplier to item if provided and not already linked
  if (supplierId) {
    const exists = await client.query(
      `SELECT 1 FROM ims.item_suppliers
        WHERE branch_id = $1 AND item_id = $2 AND supplier_id = $3
        LIMIT 1`,
      [branchId, newProductId, supplierId]
    );
    if (!exists.rows[0]) {
      await client.query(
        `INSERT INTO ims.item_suppliers
           (branch_id, item_id, supplier_id, is_default, supplier_sku, default_cost, created_at)
         VALUES ($1, $2, $3, TRUE, NULL, $4, NOW())`,
        [branchId, newProductId, supplierId, requestedCost]
      );
    }
  }

  return newProductId;
};

const getSupplierBalanceColumns = async (client: PoolClient): Promise<SupplierBalanceColumns> => {
  if (cachedSupplierBalanceColumns) return cachedSupplierBalanceColumns;
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'suppliers'`
  );
  const names = new Set(result.rows.map((row) => row.column_name));
  cachedSupplierBalanceColumns = {
    hasOpenBalance: names.has('open_balance'),
    hasRemainingBalance: names.has('remaining_balance'),
  };
  return cachedSupplierBalanceColumns;
};

const adjustSupplierBalance = async (
  client: PoolClient,
  params: { branchId: number; supplierId?: number | null; delta: number }
) => {
  if (!params.supplierId || !params.delta) return;

  const cols = await getSupplierBalanceColumns(client);
  const updates: string[] = [];
  if (cols.hasOpenBalance) {
    updates.push(`open_balance = GREATEST(open_balance + $1, 0)`);
  }
  if (cols.hasRemainingBalance) {
    updates.push(`remaining_balance = GREATEST(remaining_balance + $1, 0)`);
  }
  if (!updates.length) return;

  await client.query(
    `UPDATE ims.suppliers
        SET ${updates.join(', ')}
      WHERE supplier_id = $2
        AND branch_id = $3`,
    [params.delta, params.supplierId, params.branchId]
  );
};

const ensurePaymentAccount = async (
  client: PoolClient,
  params: { branchId: number; accId?: number | null }
) => {
  if (!params.accId) return;
  const account = await client.query(
    `SELECT acc_id
       FROM ims.accounts
      WHERE acc_id = $1
        AND branch_id = $2
        AND is_active = TRUE`,
    [params.accId, params.branchId]
  );
  if (!account.rows[0]) {
    throw ApiError.badRequest('Selected account is not available in this branch');
  }
};

const getOrCreateDefaultStoreId = async (client: PoolClient, branchId: number): Promise<number> => {
  const existing = await client.query<{ store_id: number }>(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
      ORDER BY store_id
      LIMIT 1`,
    [branchId]
  );
  const storeId = Number(existing.rows[0]?.store_id || 0);
  if (storeId > 0) return storeId;

  const created = await client.query<{ store_id: number }>(
    `INSERT INTO ims.stores (branch_id, store_name, store_code, is_active)
     VALUES ($1, 'Main Store', 'MAIN-' || LPAD($1::text, 3, '0'), TRUE)
     ON CONFLICT (branch_id, store_name)
     DO UPDATE SET is_active = TRUE
     RETURNING store_id`,
    [branchId]
  );
  return Number(created.rows[0]?.store_id || 0);
};

const resolvePurchaseStoreId = async (
  client: PoolClient,
  params: { branchId: number; storeId?: number | null }
): Promise<number> => {
  if (params.storeId && Number(params.storeId) > 0) {
    const scoped = await client.query<{ store_id: number }>(
      `SELECT store_id
         FROM ims.stores
        WHERE store_id = $1
          AND branch_id = $2
        LIMIT 1`,
      [params.storeId, params.branchId]
    );
    if (!scoped.rows[0]) {
      throw ApiError.badRequest('Selected store is not available in this branch');
    }
    return Number(scoped.rows[0].store_id);
  }
  return getOrCreateDefaultStoreId(client, params.branchId);
};

const getStoreForItem = async (
  client: PoolClient,
  params: { branchId: number; itemId: number; fallbackStoreId?: number | null }
): Promise<number> => {
  const item = await client.query<{ store_id: number | null }>(
    `SELECT store_id
       FROM ims.items
      WHERE item_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [params.itemId, params.branchId]
  );
  const itemStoreId = Number(item.rows[0]?.store_id || 0);
  if (itemStoreId > 0) return itemStoreId;
  if (params.fallbackStoreId && Number(params.fallbackStoreId) > 0) return Number(params.fallbackStoreId);
  return getOrCreateDefaultStoreId(client, params.branchId);
};

const applyStoreItemDelta = async (
  client: PoolClient,
  params: { storeId: number; itemId: number; delta: number }
) => {
  if (!params.delta) return;
  const existing = await client.query<{ quantity: string }>(
    `SELECT quantity::text AS quantity
       FROM ims.store_items
      WHERE store_id = $1
        AND product_id = $2
      FOR UPDATE`,
    [params.storeId, params.itemId]
  );
  const currentQty = Number(existing.rows[0]?.quantity || 0);
  const nextQty = currentQty + params.delta;
  if (nextQty < 0) {
    throw ApiError.badRequest(`Insufficient stock for item ${params.itemId}`);
  }
  await client.query(
    `INSERT INTO ims.store_items (store_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id, product_id)
     DO UPDATE
           SET quantity = EXCLUDED.quantity,
               updated_at = NOW()`,
    [params.storeId, params.itemId, nextQty]
  );
};

const applyPurchaseStockEffects = async (
  client: PoolClient,
  params: {
    branchId: number;
    purchaseId: number;
    lines: PurchaseStockLine[];
    direction: 'in' | 'out';
    moveType: 'purchase' | 'purchase_return';
    storeId?: number | null;
    note?: string | null;
  }
) => {
  if (!params.lines.length) return;

  for (const line of params.lines) {
    const qty = Number(line.quantity || 0);
    if (!qty) continue;
    const delta = params.direction === 'in' ? qty : -qty;
    const storeId = await getStoreForItem(client, {
      branchId: params.branchId,
      itemId: Number(line.itemId),
      fallbackStoreId: params.storeId ?? null,
    });

    await applyStoreItemDelta(client, {
      storeId,
      itemId: Number(line.itemId),
      delta,
    });

    const qtyIn = params.direction === 'in' ? qty : 0;
    const qtyOut = params.direction === 'out' ? qty : 0;
    await client.query(
      `INSERT INTO ims.inventory_movements (
         branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note
       )
       VALUES ($1, NULL, $2, $3::ims.movement_type_enum, 'purchases', $4, $5, $6, $7, $8)`,
      [
        params.branchId,
        Number(line.itemId),
        params.moveType,
        params.purchaseId,
        qtyIn,
        qtyOut,
        Number(line.unitCost || 0),
        params.note || (params.direction === 'in' ? 'Purchase receive' : 'Purchase rollback'),
      ]
    );
  }
};

const preparePurchaseItems = async (
  client: PoolClient,
  params: {
    branchId: number;
    supplierId: number | null;
    items: PurchaseItemInput[];
  }
): Promise<PreparedPurchaseItem[]> => {
  const prepared: PreparedPurchaseItem[] = [];
  for (const item of params.items) {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    const discount = Number(item.discount || 0);
    if (quantity <= 0) throw ApiError.badRequest('Quantity must be greater than zero');
    if (unitCost < 0) throw ApiError.badRequest('Unit cost cannot be negative');
    if (discount < 0) throw ApiError.badRequest('Line discount cannot be negative');

    const productId = await resolveProductForPurchaseItem(
      client,
      item,
      params.branchId,
      params.supplierId
    );
    const lineTotal = quantity * unitCost - discount;
    if (lineTotal < 0) {
      throw ApiError.badRequest('Line total cannot be negative');
    }

    prepared.push({
      productId,
      quantity,
      unitCost,
      salePrice: item.salePrice !== undefined ? Number(item.salePrice) : null,
      discount,
      batchNo: item.batchNo || null,
      expiryDate: item.expiryDate || null,
      description: item.description || null,
      lineTotal,
    });
  }
  return prepared;
};

const insertPurchaseItems = async (
  client: PoolClient,
  params: { branchId: number; purchaseId: number; items: PreparedPurchaseItem[] }
) => {
  for (const item of params.items) {
    await client.query(
      `INSERT INTO ims.purchase_items
         (branch_id, purchase_id, item_id, quantity, unit_cost, sale_price, line_total, batch_no, expiry_date, description, discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        params.branchId,
        params.purchaseId,
        item.productId,
        item.quantity,
        item.unitCost,
        item.salePrice,
        item.lineTotal,
        item.batchNo,
        item.expiryDate,
        item.description,
        item.discount,
      ]
    );
  }
};

const insertPurchaseBillLedger = async (
  client: PoolClient,
  params: {
    branchId: number;
    purchaseId: number;
    supplierId?: number | null;
    total: number;
    note?: string | null;
  }
) => {
  if (!params.supplierId || params.total <= 0) return;
  await client.query(
    `INSERT INTO ims.supplier_ledger
       (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
     VALUES ($1, $2, 'purchase', 'purchases', $3, NULL, 0, $4, $5)`,
    [
      params.branchId,
      params.supplierId,
      params.purchaseId,
      params.total,
      `${AUTO_PURCHASE_NOTE_PREFIX} Purchase bill${params.note ? ` - ${params.note}` : ''}`,
    ]
  );
};

const applyPurchasePayment = async (
  client: PoolClient,
  params: {
    branchId: number;
    purchaseId: number;
    userId: number;
    supplierId?: number | null;
    accId: number;
    amount: number;
    note?: string | null;
  }
) => {
  if (params.amount <= 0) return;
  await ensurePaymentAccount(client, { branchId: params.branchId, accId: params.accId });

  const accountResult = await client.query(
    `UPDATE ims.accounts
        SET balance = balance - $1
      WHERE acc_id = $2
        AND branch_id = $3`,
    [params.amount, params.accId, params.branchId]
  );
  if ((accountResult.rowCount ?? 0) === 0) {
    throw ApiError.badRequest('Payment account is not allowed for this branch');
  }

  await client.query(
    `INSERT INTO ims.supplier_payments
       (branch_id, purchase_id, user_id, acc_id, pay_date, amount_paid, reference_no, note)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
    [
      params.branchId,
      params.purchaseId,
      params.userId,
      params.accId,
      params.amount,
      null,
      `${AUTO_PURCHASE_NOTE_PREFIX} Supplier payment${params.note ? ` - ${params.note}` : ''}`,
    ]
  );

  await client.query(
    `INSERT INTO ims.account_transactions
       (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
     VALUES ($1, $2, 'supplier_payment', 'purchases', $3, $4, 0, $5)`,
    [
      params.branchId,
      params.accId,
      params.purchaseId,
      params.amount,
      `${AUTO_PURCHASE_NOTE_PREFIX} Supplier payment`,
    ]
  );

  if (params.supplierId) {
    await client.query(
      `INSERT INTO ims.supplier_ledger
         (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
       VALUES ($1, $2, 'payment', 'purchases', $3, $4, $5, 0, $6)`,
      [
        params.branchId,
        params.supplierId,
        params.purchaseId,
        params.accId,
        params.amount,
        `${AUTO_PURCHASE_NOTE_PREFIX} Supplier payment`,
      ]
    );
    await adjustSupplierBalance(client, {
      branchId: params.branchId,
      supplierId: params.supplierId,
      delta: -params.amount,
    });
  }
};

export const purchasesService = {
  async listPurchases(scope: BranchScope, search?: string, status?: string, branchId?: number): Promise<Purchase[]> {
    const params: any[] = [];
    const clauses: string[] = [];
    if (branchId) {
      params.push(branchId);
      clauses.push(`p.branch_id = $${params.length}`);
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      clauses.push(`p.branch_id = ANY($${params.length})`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(s.name ILIKE $${params.length} OR p.note ILIKE $${params.length})`);
    }
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`p.status = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<Purchase>(
      `SELECT p.*, s.name AS supplier_name
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         ${where}
        ORDER BY p.purchase_date DESC`,
      params
    );
  },

  async getPurchase(id: number, scope: BranchScope): Promise<Purchase | null> {
    if (scope.isAdmin) {
      return queryOne<Purchase>(
        `SELECT p.*, s.name AS supplier_name
           FROM ims.purchases p
           LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
          WHERE p.purchase_id = $1`,
        [id]
      );
    }

    return queryOne<Purchase>(
      `SELECT p.*, s.name AS supplier_name
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
        WHERE p.purchase_id = $1
          AND p.branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },

  async listItems(purchaseId: number): Promise<PurchaseItem[]> {
    return queryMany<PurchaseItem>(
      `SELECT * FROM ims.purchase_items WHERE purchase_id = $1 ORDER BY purchase_item_id`,
      [purchaseId]
    );
  },

  async listAllItems(scope: BranchScope, filters: {
    search?: string;
    supplierId?: number;
    productId?: number;
    branchId?: number;
    from?: string;
    to?: string;
  }): Promise<PurchaseItemView[]> {
    const clauses: string[] = [];
    const params: any[] = [];
    const addClause = (sql: string, val: any) => {
      params.push(val);
      clauses.push(sql.replace(/\$(\d+)/, `$${params.length}`));
    };

    if (filters.branchId) {
      addClause(`p.branch_id = $1`, filters.branchId);
    } else if (!scope.isAdmin) {
      addClause(`p.branch_id = ANY($1)`, scope.branchIds);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(`(COALESCE(pi.description,'') ILIKE $${params.length} OR COALESCE(pr.name,'') ILIKE $${params.length} OR COALESCE(s.name,'') ILIKE $${params.length})`);
    }
    if (filters.supplierId) addClause(`p.supplier_id = $1`, filters.supplierId);
    if (filters.productId) addClause(`pi.item_id = $1`, filters.productId);
    if (filters.from) addClause(`p.purchase_date::date >= $1`, filters.from);
    if (filters.to) addClause(`p.purchase_date::date <= $1`, filters.to);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<PurchaseItemView>(
      `SELECT
          pi.purchase_item_id,
          pi.purchase_id,
          pi.item_id        AS product_id,
          pi.quantity,
          pi.unit_cost,
          pi.sale_price,
          pi.line_total,
          pi.batch_no,
          pi.expiry_date,
          pi.description,
          pi.discount,
          p.purchase_date,
          p.purchase_type,
          p.supplier_id,
          s.name AS supplier_name,
          pr.name AS product_name,
          COALESCE(pr.cost_price, 0) AS cost_price,
          COALESCE(pi.sale_price, NULLIF(pr.sell_price, 0), COALESCE(pr.cost_price, 0)) AS sale_price
         FROM ims.purchase_items pi
         JOIN ims.purchases p ON p.purchase_id = pi.purchase_id
         LEFT JOIN ims.items pr ON pr.item_id = pi.item_id
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         ${where}
        ORDER BY p.purchase_date DESC, pi.purchase_item_id DESC`,
      params
    );
  },

  async createPurchase(
    input: PurchaseInput,
    context: { branchId: number; userId: number }
  ): Promise<Purchase> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const effectiveSupplierId = input.supplierId ?? (await client.query<{ fn_get_or_create_walking_supplier: number }>(
        `SELECT ims.fn_get_or_create_walking_supplier($1) AS fn_get_or_create_walking_supplier`,
        [context.branchId]
      )).rows[0]?.fn_get_or_create_walking_supplier ?? null;
      const items: PurchaseItemInput[] = input.items || [];
      const preparedItems = await preparePurchaseItems(client, {
        branchId: context.branchId,
        supplierId: effectiveSupplierId,
        items,
      });

      const subtotalFromItems = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const subtotal = preparedItems.length > 0
        ? subtotalFromItems
        : Number(input.subtotal ?? 0);
      const discount = Number(input.discount ?? 0);
      const total = input.total !== undefined ? Number(input.total) : subtotal - discount;
      if (subtotal < 0 || discount < 0 || total < 0) {
        throw ApiError.badRequest('Purchase amounts cannot be negative');
      }
      const status: PurchaseStatus = (input.status || 'received') as PurchaseStatus;
      const storeId = await resolvePurchaseStoreId(client, {
        branchId: context.branchId,
        storeId: input.storeId ?? null,
      });

      const purchaseResult = await client.query<Purchase>(
      `INSERT INTO ims.purchases (
         branch_id, store_id, user_id, supplier_id, fx_rate,
         purchase_date, subtotal, discount, total, status, note
       ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        context.branchId,
        storeId,
        context.userId,
        effectiveSupplierId,
        input.fxRate || 1,
        input.purchaseDate || null,
        subtotal,
        discount,
        total,
        status,
        input.note || null,
      ]
      );

      const purchase = purchaseResult.rows[0] as Purchase;
      const affectedProductIds = new Set<number>(preparedItems.map((item) => item.productId));

      if (preparedItems.length > 0) {
        await insertPurchaseItems(client, {
          branchId: context.branchId,
          purchaseId: purchase.purchase_id,
          items: preparedItems,
        });
      }

      if (status !== 'void' && preparedItems.length > 0) {
        await applyPurchaseStockEffects(client, {
          branchId: context.branchId,
          purchaseId: purchase.purchase_id,
          lines: preparedItems.map((item) => ({
            itemId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
          direction: 'in',
          moveType: 'purchase',
          storeId,
          note: `${AUTO_PURCHASE_NOTE_PREFIX} Purchase receive`,
        });
      }

      if (status !== 'void' && total > 0 && effectiveSupplierId) {
        await adjustSupplierBalance(client, {
          branchId: context.branchId,
          supplierId: effectiveSupplierId,
          delta: total,
        });
        await insertPurchaseBillLedger(client, {
          branchId: context.branchId,
          purchaseId: purchase.purchase_id,
          supplierId: effectiveSupplierId,
          total,
          note: input.note || null,
        });
      }

      const paidAmountRaw = Number(input.paidAmount || 0);
      const payFromAccId = input.payFromAccId;
      if (payFromAccId && paidAmountRaw > 0 && status !== 'void') {
        const paidAmount = Math.min(paidAmountRaw, total);
        if (paidAmount > 0) {
          await applyPurchasePayment(client, {
            branchId: context.branchId,
            purchaseId: purchase.purchase_id,
            userId: context.userId,
            supplierId: effectiveSupplierId,
            accId: payFromAccId,
            amount: paidAmount,
            note: input.note || null,
          });
        }
      }

      await syncLowStockNotifications(client, {
        branchId: context.branchId,
        productIds: Array.from(affectedProductIds),
        actorUserId: context.userId,
      });

      await client.query('COMMIT');
      return purchase;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updatePurchase(
    id: number,
    input: Partial<PurchaseInput>,
    scope: BranchScope
  ): Promise<Purchase | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentPurchase = await client.query<{
        purchase_id: number;
        branch_id: number;
        user_id: number;
        store_id: number | null;
        supplier_id: number | null;
        purchase_date: string;
        subtotal: string;
        discount: string;
        total: string;
        status: PurchaseStatus;
        fx_rate: string;
        note: string | null;
      }>(
        `SELECT purchase_id, branch_id, user_id, store_id, supplier_id, purchase_date, subtotal, discount, total, status, fx_rate, note
           FROM ims.purchases
          WHERE purchase_id = $1
          FOR UPDATE`,
        [id]
      );
      const current = currentPurchase.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      const currentBranchId = Number(current.branch_id);
      if (!scope.isAdmin && !scope.branchIds.includes(currentBranchId)) {
        throw ApiError.forbidden('You can only update purchases in your branch');
      }

      const oldItemsResult = await client.query<{
        item_id: number;
        quantity: string;
        unit_cost: string;
      }>(
        `SELECT item_id, quantity::text AS quantity, unit_cost::text AS unit_cost
           FROM ims.purchase_items
          WHERE purchase_id = $1`,
        [id]
      );
      const oldItems = oldItemsResult.rows.map((row) => ({
        itemId: Number(row.item_id),
        quantity: Number(row.quantity || 0),
        unitCost: Number(row.unit_cost || 0),
      }));

      const hasPaymentsResult = await client.query<{ payment_count: string }>(
        `SELECT COUNT(*)::text AS payment_count
           FROM ims.supplier_payments
          WHERE purchase_id = $1`,
        [id]
      );
      const hasPayments = Number(hasPaymentsResult.rows[0]?.payment_count || 0) > 0;

      let nextSupplierId = current.supplier_id ? Number(current.supplier_id) : null;
      if (input.supplierId !== undefined) {
        nextSupplierId = input.supplierId ?? (await client.query<{ fn_get_or_create_walking_supplier: number }>(
          `SELECT ims.fn_get_or_create_walking_supplier($1) AS fn_get_or_create_walking_supplier`,
          [currentBranchId]
        )).rows[0]?.fn_get_or_create_walking_supplier ?? null;

        const currentSupplierId = current.supplier_id ? Number(current.supplier_id) : null;
        if (
          hasPayments &&
          currentSupplierId &&
          nextSupplierId &&
          currentSupplierId !== nextSupplierId
        ) {
          throw ApiError.badRequest('Cannot change supplier after payments are recorded for this purchase');
        }
      }

      const preparedItems = input.items
        ? await preparePurchaseItems(client, {
            branchId: currentBranchId,
            supplierId: nextSupplierId,
            items: input.items,
          })
        : null;

      const nextStatus: PurchaseStatus = (input.status ?? current.status ?? 'received') as PurchaseStatus;
      const oldStockApplied = current.status !== 'void';
      const newStockApplied = nextStatus !== 'void';
      let storeId = current.store_id ? Number(current.store_id) : null;
      if (input.storeId !== undefined) {
        storeId = await resolvePurchaseStoreId(client, {
          branchId: currentBranchId,
          storeId: input.storeId ?? null,
        });
      }
      if (!storeId && (oldItems.length > 0 || (preparedItems && preparedItems.length > 0))) {
        storeId = await getOrCreateDefaultStoreId(client, currentBranchId);
      }

      if (preparedItems) {
        if (oldStockApplied && oldItems.length > 0) {
          await applyPurchaseStockEffects(client, {
            branchId: currentBranchId,
            purchaseId: id,
            lines: oldItems,
            direction: 'out',
            moveType: 'purchase_return',
            storeId,
            note: `${AUTO_PURCHASE_NOTE_PREFIX} Purchase update rollback`,
          });
        }

        await client.query(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
        await insertPurchaseItems(client, {
          branchId: currentBranchId,
          purchaseId: id,
          items: preparedItems,
        });

        if (newStockApplied && preparedItems.length > 0) {
          await applyPurchaseStockEffects(client, {
            branchId: currentBranchId,
            purchaseId: id,
            lines: preparedItems.map((item) => ({
              itemId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
            direction: 'in',
            moveType: 'purchase',
            storeId,
            note: `${AUTO_PURCHASE_NOTE_PREFIX} Purchase update apply`,
          });
        }
      } else if (oldStockApplied !== newStockApplied && oldItems.length > 0) {
        await applyPurchaseStockEffects(client, {
          branchId: currentBranchId,
          purchaseId: id,
          lines: oldItems,
          direction: newStockApplied ? 'in' : 'out',
          moveType: newStockApplied ? 'purchase' : 'purchase_return',
          storeId,
          note: `${AUTO_PURCHASE_NOTE_PREFIX} Purchase status change`,
        });
      }

      const computedSubtotal = preparedItems
        ? preparedItems.reduce((sum, item) => sum + item.lineTotal, 0)
        : (input.subtotal !== undefined ? Number(input.subtotal) : Number(current.subtotal || 0));
      const nextDiscount = input.discount !== undefined
        ? Number(input.discount)
        : Number(current.discount || 0);
      const nextTotal = input.total !== undefined
        ? Number(input.total)
        : (preparedItems || input.subtotal !== undefined || input.discount !== undefined
            ? computedSubtotal - nextDiscount
            : Number(current.total || 0));
      if (computedSubtotal < 0 || nextDiscount < 0 || nextTotal < 0) {
        throw ApiError.badRequest('Purchase amounts cannot be negative');
      }

      const previousSupplierId = current.supplier_id ? Number(current.supplier_id) : null;
      const previousBillAmount = current.status !== 'void' ? Number(current.total || 0) : 0;
      const nextBillAmount = nextStatus !== 'void' ? nextTotal : 0;

      if (previousSupplierId && previousBillAmount > 0) {
        await adjustSupplierBalance(client, {
          branchId: currentBranchId,
          supplierId: previousSupplierId,
          delta: -previousBillAmount,
        });
      }
      if (nextSupplierId && nextBillAmount > 0) {
        await adjustSupplierBalance(client, {
          branchId: currentBranchId,
          supplierId: nextSupplierId,
          delta: nextBillAmount,
        });
      }

      await client.query(
        `DELETE FROM ims.supplier_ledger
          WHERE branch_id = $1
            AND ref_table = 'purchases'
            AND ref_id = $2
            AND entry_type = 'purchase'`,
        [currentBranchId, id]
      );
      if (nextSupplierId && nextBillAmount > 0) {
        await insertPurchaseBillLedger(client, {
          branchId: currentBranchId,
          purchaseId: id,
          supplierId: nextSupplierId,
          total: nextBillAmount,
          note: input.note ?? current.note ?? null,
        });
      }

      const paidAmountRaw = Number(input.paidAmount || 0);
      if (input.payFromAccId && paidAmountRaw > 0 && nextStatus !== 'void') {
        const paidAmount = Math.min(paidAmountRaw, nextTotal);
        if (paidAmount > 0) {
          await applyPurchasePayment(client, {
            branchId: currentBranchId,
            purchaseId: id,
            userId: Number(current.user_id || 1),
            supplierId: nextSupplierId,
            accId: input.payFromAccId,
            amount: paidAmount,
            note: input.note ?? current.note ?? null,
          });
        }
      }

      await client.query(
        `UPDATE ims.purchases
            SET supplier_id = $2,
                purchase_date = COALESCE($3::timestamptz, purchase_date),
                subtotal = $4,
                discount = $5,
                total = $6,
                status = $7,
                fx_rate = $8,
                note = $9,
                store_id = COALESCE($10, store_id)
          WHERE purchase_id = $1`,
        [
          id,
          nextSupplierId,
          input.purchaseDate || null,
          computedSubtotal,
          nextDiscount,
          nextTotal,
          nextStatus,
          input.fxRate !== undefined ? Number(input.fxRate) : Number(current.fx_rate || 1),
          input.note !== undefined ? input.note : current.note,
          storeId,
        ]
      );

      const updated = await client.query<Purchase>(
        `SELECT p.*, s.name AS supplier_name
           FROM ims.purchases p
           LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
          WHERE p.purchase_id = $1`,
        [id]
      );

      const affectedProductIds = new Set<number>(oldItems.map((row) => Number(row.itemId)));
      (preparedItems || []).forEach((item) => affectedProductIds.add(Number(item.productId)));
      await syncLowStockNotifications(client, {
        branchId: currentBranchId,
        productIds: Array.from(affectedProductIds),
        actorUserId: Number(current.user_id || 1),
      });

      await client.query('COMMIT');
      return updated.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async deletePurchase(id: number, scope: BranchScope): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const purchase = await client.query<{
        purchase_id: number;
        branch_id: number;
        store_id: number | null;
        supplier_id: number | null;
        total: string;
        status: PurchaseStatus;
      }>(
        `SELECT purchase_id, branch_id, store_id, supplier_id, total, status
           FROM ims.purchases
          WHERE purchase_id = $1
          FOR UPDATE`,
        [id]
      );
      const current = purchase.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return;
      }
      const branchId = Number(current.branch_id);
      if (!scope.isAdmin && !scope.branchIds.includes(branchId)) {
        throw ApiError.forbidden('You can only delete purchases in your branch');
      }

      const itemsResult = await client.query<{
        item_id: number;
        quantity: string;
        unit_cost: string;
      }>(
        `SELECT item_id, quantity::text AS quantity, unit_cost::text AS unit_cost
           FROM ims.purchase_items
          WHERE purchase_id = $1`,
        [id]
      );
      const stockLines = itemsResult.rows.map((row) => ({
        itemId: Number(row.item_id),
        quantity: Number(row.quantity || 0),
        unitCost: Number(row.unit_cost || 0),
      }));

      if (current.status !== 'void' && stockLines.length > 0) {
        await applyPurchaseStockEffects(client, {
          branchId,
          purchaseId: id,
          lines: stockLines,
          direction: 'out',
          moveType: 'purchase_return',
          storeId: current.store_id ? Number(current.store_id) : null,
          note: `${AUTO_PURCHASE_NOTE_PREFIX} Purchase delete rollback`,
        });
      }

      const payments = await client.query<{ acc_id: number; amount_paid: string }>(
        `SELECT acc_id, amount_paid::text AS amount_paid
           FROM ims.supplier_payments
          WHERE purchase_id = $1
          FOR UPDATE`,
        [id]
      );
      for (const payment of payments.rows) {
        const amount = Number(payment.amount_paid || 0);
        if (!amount) continue;
        await client.query(
          `UPDATE ims.accounts
              SET balance = balance + $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [amount, branchId, payment.acc_id]
        );
        await adjustSupplierBalance(client, {
          branchId,
          supplierId: current.supplier_id ? Number(current.supplier_id) : null,
          delta: amount,
        });
      }

      if (current.status !== 'void' && current.supplier_id && Number(current.total || 0) > 0) {
        await adjustSupplierBalance(client, {
          branchId,
          supplierId: Number(current.supplier_id),
          delta: -Number(current.total || 0),
        });
      }

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'purchases'
            AND ref_id = $2
            AND txn_type = 'supplier_payment'`,
        [branchId, id]
      );
      await client.query(
        `DELETE FROM ims.supplier_ledger
          WHERE branch_id = $1
            AND ref_table = 'purchases'
            AND ref_id = $2`,
        [branchId, id]
      );
      await client.query(`DELETE FROM ims.supplier_payments WHERE purchase_id = $1`, [id]);
      await client.query(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
      await client.query(`DELETE FROM ims.purchases WHERE purchase_id = $1`, [id]);

      await syncLowStockNotifications(client, {
        branchId,
        productIds: stockLines.map((line) => Number(line.itemId)),
        actorUserId: 1,
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
