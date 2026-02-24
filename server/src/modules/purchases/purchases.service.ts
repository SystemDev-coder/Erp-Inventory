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
  wh_id: number | null;
  user_id: number;
  supplier_id: number;
  supplier_name?: string | null;
  currency_code: string;
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

  const categoryResult = await client.query<{ cat_id: number | null }>(
    `SELECT cat_id
       FROM ims.categories
      WHERE branch_id = $1
      ORDER BY cat_id
      LIMIT 1`,
    [branchId]
  );

  let fallbackCatId = Number(categoryResult.rows[0]?.cat_id ?? 0) || null;
  if (!fallbackCatId) {
    const anyCategory = await client.query<{ cat_id: number | null }>(
      `SELECT cat_id
         FROM ims.categories
        ORDER BY cat_id
        LIMIT 1`
    );
    fallbackCatId = Number(anyCategory.rows[0]?.cat_id ?? 0) || null;
  }
  const nextSale = item.salePrice !== undefined ? Number(item.salePrice) : requestedCost;

  const created = await client.query<{ product_id: number }>(
    `INSERT INTO ims.items
       (branch_id, cat_id, name, cost_price, sell_price, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING item_id AS product_id`,
    [branchId, fallbackCatId, itemName, requestedCost, nextSale]
  );
  return Number(created.rows[0].product_id);
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

      const items: PurchaseItemInput[] = input.items || [];
      const subtotalFromItems = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0
      );
      const subtotal = items.length > 0 ? subtotalFromItems : input.subtotal ?? 0;
      const discount = input.discount ?? 0;
      const total = input.total ?? subtotal - discount;

      if (input.whId) {
        const warehouse = await client.query(
          `SELECT wh_id
             FROM ims.warehouses
            WHERE wh_id = $1
              AND branch_id = $2
              AND is_active = TRUE`,
          [input.whId, context.branchId]
        );
        if (!warehouse.rows[0]) {
          throw ApiError.badRequest('Warehouse does not belong to this branch');
        }
      }

      if (input.payFromAccId) {
        const account = await client.query(
          `SELECT acc_id
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = $2
              AND is_active = TRUE`,
          [input.payFromAccId, context.branchId]
        );
        if (!account.rows[0]) {
          throw ApiError.badRequest('Selected account is not available in this branch');
        }
      }

      const effectiveSupplierId = input.supplierId ?? (await client.query<{ fn_get_or_create_walking_supplier: number }>(
        `SELECT ims.fn_get_or_create_walking_supplier($1) AS fn_get_or_create_walking_supplier`,
        [context.branchId]
      )).rows[0]?.fn_get_or_create_walking_supplier ?? null;

      const purchaseResult = await client.query<Purchase>(
      `INSERT INTO ims.purchases (
         branch_id, wh_id, user_id, supplier_id, currency_code, fx_rate,
         purchase_date, subtotal, discount, total, status, note
       ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        context.branchId,
        input.whId ?? null,
        context.userId,
        effectiveSupplierId,
        input.currencyCode || 'USD',
        input.fxRate || 1,
        input.purchaseDate || null,
        subtotal,
        discount,
        total,
        input.status || 'received',
        input.note || null,
      ]
      );

      const purchase = purchaseResult.rows[0] as Purchase;
      const affectedProductIds = new Set<number>();

      if (items.length > 0) {
        for (const item of items) {
          const productId = await resolveProductForPurchaseItem(
            client,
            item,
            context.branchId,
            effectiveSupplierId
          );
          affectedProductIds.add(productId);
          const lineTotal = Number(item.quantity) * Number(item.unitCost) - Number(item.discount || 0);
          await client.query(
            `INSERT INTO ims.purchase_items
               (purchase_id, item_id, quantity, unit_cost, sale_price, line_total, batch_no, expiry_date, description, discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              purchase.purchase_id,
              productId,
              item.quantity,
              item.unitCost,
              item.salePrice ?? null,
              lineTotal,
              item.batchNo || null,
              item.expiryDate || null,
              item.description || null,
              item.discount || 0,
            ]
          );
        }
      }

      // ---- Financial side effects: supplier remaining balance & account balance ----
      // 1) Always increase supplier remaining_balance by the full purchase total (if not void and supplier exists)
      if (total > 0 && (input.status || 'received') !== 'void' && effectiveSupplierId) {
        await client.query(
          `UPDATE ims.suppliers
             SET remaining_balance = remaining_balance + $1
           WHERE supplier_id = $2`,
          [total, effectiveSupplierId]
        );
      }

      // 2) If there is an inline payment, reduce account balance and supplier remaining_balance
      const paidAmountRaw = input.paidAmount ?? 0;
      const payFromAccId = input.payFromAccId;
      if (payFromAccId && paidAmountRaw > 0 && (input.status || 'received') !== 'void') {
        const paidAmount = Math.min(paidAmountRaw, total);
        if (paidAmount > 0) {
          // Subtract from cash/bank account
          const accountResult = await client.query(
            `UPDATE ims.accounts
               SET balance = balance - $1
             WHERE acc_id = $2
               AND branch_id = $3`,
            [paidAmount, payFromAccId, context.branchId]
          );
          if ((accountResult.rowCount ?? 0) === 0) {
            throw ApiError.badRequest('Payment account is not allowed for this branch');
          }

          // Reduce supplier remaining balance
          if (effectiveSupplierId) {
            await client.query(
              `UPDATE ims.suppliers
                 SET remaining_balance = remaining_balance - $1
               WHERE supplier_id = $2`,
              [paidAmount, effectiveSupplierId]
            );
          }
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

      const currentPurchase = await client.query<{ branch_id: number; supplier_id: number }>(
        `SELECT branch_id, supplier_id FROM ims.purchases WHERE purchase_id = $1`,
        [id]
      );
      if (!currentPurchase.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const currentBranchId = Number(currentPurchase.rows[0].branch_id);
      if (!scope.isAdmin && !scope.branchIds.includes(currentBranchId)) {
        throw ApiError.forbidden('You can only update purchases in your branch');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;

      if (input.supplierId !== undefined) {
        const effSupplier = input.supplierId ?? (await client.query<{ fn_get_or_create_walking_supplier: number }>(
          `SELECT ims.fn_get_or_create_walking_supplier($1) AS fn_get_or_create_walking_supplier`,
          [currentBranchId]
        )).rows[0]?.fn_get_or_create_walking_supplier ?? null;
        updates.push(`supplier_id = $${p++}`);
        values.push(effSupplier);
      }
      if (input.whId !== undefined) {
        updates.push(`wh_id = $${p++}`);
        values.push(input.whId);
      }
      if (input.purchaseDate !== undefined) {
        updates.push(`purchase_date = $${p++}`);
        values.push(input.purchaseDate);
      }
      if (input.subtotal !== undefined) {
        updates.push(`subtotal = $${p++}`);
        values.push(input.subtotal);
      }
      if (input.discount !== undefined) {
        updates.push(`discount = $${p++}`);
        values.push(input.discount);
      }
      if (input.total !== undefined) {
        updates.push(`total = $${p++}`);
        values.push(input.total);
      }
      if (input.status !== undefined) {
        updates.push(`status = $${p++}`);
        values.push(input.status);
      }
      if (input.currencyCode !== undefined) {
        updates.push(`currency_code = $${p++}`);
        values.push(input.currencyCode);
      }
      if (input.fxRate !== undefined) {
        updates.push(`fx_rate = $${p++}`);
        values.push(input.fxRate);
      }
      if (input.note !== undefined) {
        updates.push(`note = $${p++}`);
        values.push(input.note);
      }

      if (updates.length > 0) {
        values.push(id);
        // Only set purchase_date if it wasn't explicitly provided
        const hasPurchaseDate = input.purchaseDate !== undefined;
        const purchaseDateClause = hasPurchaseDate ? '' : ', purchase_date = COALESCE(purchase_date, NOW())';
        await client.query(
          `UPDATE ims.purchases
              SET ${updates.join(', ')}${purchaseDateClause}
            WHERE purchase_id = $${p}
            RETURNING *`,
          values
        );
      }

      if (input.items) {
        await client.query(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
        let supplierIdForItems: number | null = input.supplierId ?? currentPurchase.rows[0].supplier_id ?? null;
        if (supplierIdForItems == null) {
          supplierIdForItems = (await client.query<{ fn_get_or_create_walking_supplier: number }>(
            `SELECT ims.fn_get_or_create_walking_supplier($1) AS fn_get_or_create_walking_supplier`,
            [currentBranchId]
          )).rows[0]?.fn_get_or_create_walking_supplier ?? null;
        }
        for (const item of input.items) {
          const productId = await resolveProductForPurchaseItem(
            client,
            item,
            currentBranchId,
            supplierIdForItems
          );
          const lineTotal = Number(item.quantity) * Number(item.unitCost) - Number(item.discount || 0);
          await client.query(
            `INSERT INTO ims.purchase_items
               (purchase_id, item_id, quantity, unit_cost, sale_price, line_total, batch_no, expiry_date, description, discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              id,
              productId,
              item.quantity,
              item.unitCost,
              item.salePrice ?? null,
              lineTotal,
              item.batchNo || null,
              item.expiryDate || null,
              item.description || null,
              item.discount || 0,
            ]
          );
        }
        const newSubtotal = input.items.reduce(
          (sum, it) => sum + Number(it.quantity) * Number(it.unitCost) - Number(it.discount || 0),
          0
        );
        const discount = input.discount ?? 0;
        const total = input.total ?? newSubtotal - discount;
        await client.query(
          `UPDATE ims.purchases SET subtotal = $1, total = $2 WHERE purchase_id = $3`,
          [newSubtotal, total, id]
        );
      }

      const updated = await client.query<Purchase>(
        `SELECT p.*, s.name AS supplier_name
           FROM ims.purchases p
           LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
          WHERE p.purchase_id = $1`,
        [id]
      );

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
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
      await queryOne(`DELETE FROM ims.purchases WHERE purchase_id = $1`, [id]);
      return;
    }

    const purchase = await queryOne<{ branch_id: number }>(
      `SELECT branch_id FROM ims.purchases WHERE purchase_id = $1`,
      [id]
    );
    if (!purchase) return;
    if (!scope.branchIds.includes(Number(purchase.branch_id))) {
      throw ApiError.forbidden('You can only delete purchases in your branch');
    }

    await queryOne(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
    await queryOne(`DELETE FROM ims.purchases WHERE purchase_id = $1`, [id]);
  },
};
