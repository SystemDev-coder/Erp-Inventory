import { pool } from '../../db/pool';
import { queryMany } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { PoolClient } from 'pg';

export interface SalesReturn {
    sr_id: number;
    branch_id: number;
    branch_name?: string;
    sale_id: number | null;
    user_id: number;
    created_by_name?: string;
    customer_id: number | null;
    customer_name?: string | null;
    return_date: string;
    subtotal: number;
    total: number;
    note: string | null;
}

export interface SalesReturnItem {
    sr_item_id: number;
    sr_id: number;
    item_id: number;
    item_name?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
}

export interface PurchaseReturn {
    pr_id: number;
    branch_id: number;
    branch_name?: string;
    purchase_id: number | null;
    user_id: number;
    created_by_name?: string;
    supplier_id: number | null;
    supplier_name?: string | null;
    return_date: string;
    subtotal: number;
    total: number;
    note: string | null;
}

export interface PurchaseReturnItem {
    pr_item_id: number;
    pr_id: number;
    item_id: number;
    item_name?: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
}

export interface ReturnItemInput {
    itemId: number;
    quantity: number;
    unitPrice?: number;
    unitCost?: number;
}

export interface ReturnItemOption {
    item_id: number;
    name: string;
    barcode: string | null;
    cost_price: number;
    sell_price: number;
}

export interface CreateSalesReturnInput {
    saleId?: number;
    customerId: number;
    returnDate?: string;
    note?: string;
    items: ReturnItemInput[];
}

export interface CreatePurchaseReturnInput {
    purchaseId?: number;
    supplierId: number;
    returnDate?: string;
    note?: string;
    items: ReturnItemInput[];
}

export interface UpdateSalesReturnInput extends CreateSalesReturnInput {}
export interface UpdatePurchaseReturnInput extends CreatePurchaseReturnInput {}

const canAccessBranch = (scope: BranchScope, branchId: number) =>
    scope.isAdmin || scope.branchIds.includes(branchId);

let cachedSupplierNameColumn: 'name' | 'supplier_name' | null = null;

const getSupplierNameColumn = async (): Promise<'name' | 'supplier_name'> => {
    if (cachedSupplierNameColumn) return cachedSupplierNameColumn;
    const cols = await queryMany<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'suppliers'`
    );
    const names = new Set(cols.map((c) => c.column_name));
    cachedSupplierNameColumn = names.has('name')
        ? 'name'
        : (names.has('supplier_name') ? 'supplier_name' : 'name');
    return cachedSupplierNameColumn;
};

const getDefaultStoreId = async (client: PoolClient, branchId: number): Promise<number> => {
    const row = await client.query<{ store_id: number }>(
        `SELECT store_id
           FROM ims.stores
          WHERE branch_id = $1
          ORDER BY store_id
          LIMIT 1`,
        [branchId]
    );
    const storeId = Number(row.rows[0]?.store_id || 0);
    if (!storeId) throw ApiError.badRequest('No store configured for this branch');
    return storeId;
};

const applyStoreItemDelta = async (
    client: PoolClient,
    storeId: number,
    itemId: number,
    deltaQty: number
) => {
    if (!deltaQty) return;
    const current = await client.query<{ quantity: string }>(
        `SELECT quantity::text AS quantity
           FROM ims.store_items
          WHERE store_id = $1
            AND product_id = $2
          FOR UPDATE`,
        [storeId, itemId]
    );
    const currentQty = Number(current.rows[0]?.quantity || 0);
    const nextQty = currentQty + Number(deltaQty);
    if (nextQty < 0) {
        throw ApiError.badRequest(`Insufficient quantity for item ${itemId}`);
    }
    await client.query(
        `INSERT INTO ims.store_items (store_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, product_id)
         DO UPDATE
               SET quantity = EXCLUDED.quantity,
                   updated_at = NOW()`,
        [storeId, itemId, nextQty]
    );
};

const buildItemDelta = (
    oldItems: Array<{ item_id: number; quantity: string | number }>,
    newItems: ReturnItemInput[]
) => {
    const oldMap = new Map<number, number>();
    const newMap = new Map<number, number>();
    oldItems.forEach((it) => oldMap.set(Number(it.item_id), Number(it.quantity || 0)));
    newItems.forEach((it) => newMap.set(Number(it.itemId), Number(it.quantity || 0)));
    const keys = new Set<number>([...oldMap.keys(), ...newMap.keys()]);
    const deltas: Array<{ itemId: number; delta: number }> = [];
    keys.forEach((k) => {
        const delta = Number((newMap.get(k) || 0) - (oldMap.get(k) || 0));
        if (delta !== 0) deltas.push({ itemId: k, delta });
    });
    return deltas;
};

export const returnsService = {
    async listReturnItems(scope: BranchScope): Promise<ReturnItemOption[]> {
        const params: any[] = [];
        let where = `WHERE 1=1`;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND i.branch_id = ANY($1)`;
        }
        return queryMany<ReturnItemOption>(
            `SELECT
                i.item_id,
                i.name,
                i.barcode,
                COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price,
                COALESCE(i.sell_price, 0)::numeric(14,2) AS sell_price
             FROM ims.items i
             ${where}
             ORDER BY i.name`,
            params
        );
    },

    async listSalesReturns(scope: BranchScope): Promise<SalesReturn[]> {
        const params: any[] = [];
        let where = '';
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where = `WHERE sr.branch_id = ANY($1)`;
        }

        return queryMany<SalesReturn>(
            `SELECT
          sr.*,
          b.branch_name,
          u.name AS created_by_name,
          c.full_name AS customer_name
       FROM ims.sales_returns sr
       LEFT JOIN ims.branches b ON b.branch_id = sr.branch_id
       LEFT JOIN ims.users u ON u.user_id = sr.user_id
       LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id
       ${where}
       ORDER BY sr.return_date DESC, sr.sr_id DESC
       LIMIT 500`,
            params
        );
    },

    async createSalesReturn(
        input: CreateSalesReturnInput,
        context: { branchId: number; userId: number }
    ): Promise<SalesReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const items = input.items || [];
            if (items.length === 0) {
                throw ApiError.badRequest('At least one item is required for a return');
            }
            if (!input.customerId || Number(input.customerId) <= 0) {
                throw ApiError.badRequest('Customer is required');
            }

            const defaultStore = await client.query<{ store_id: number }>(
                `SELECT store_id
                   FROM ims.stores
                  WHERE branch_id = $1
                  ORDER BY store_id
                  LIMIT 1`,
                [context.branchId]
            );
            const storeId = Number(defaultStore.rows[0]?.store_id || 0);
            if (!storeId) {
                throw ApiError.badRequest('No store configured for this branch');
            }

            const customer = await client.query<{ customer_id: number }>(
                `SELECT customer_id
                   FROM ims.customers
                  WHERE customer_id = $1
                  LIMIT 1`,
                [input.customerId]
            );
            if (!customer.rows[0]) {
                throw ApiError.badRequest('Customer not found');
            }

            // Validate items exist in this branch
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, context.branchId]
                );
                if (!row.rows[0]) {
                    throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
                }
            }

            const subtotal = items.reduce(
                (s, i) => s + Number(i.quantity) * Number(i.unitPrice || 0),
                0
            );
            const total = subtotal;

            const returnRes = await client.query<SalesReturn>(
                `INSERT INTO ims.sales_returns
           (branch_id, sale_id, user_id, customer_id, return_date, subtotal, total, note)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8)
         RETURNING *`,
                [
                    context.branchId,
                    input.saleId ?? null,
                    context.userId,
                    input.customerId,
                    input.returnDate || null,
                    subtotal,
                    total,
                    input.note || null,
                ]
            );
            const sr = returnRes.rows[0];

            for (const item of items) {
                const unitPrice = Number(item.unitPrice || 0);
                const lineTotal = Number(item.quantity) * unitPrice;

                await client.query(
                    `INSERT INTO ims.sales_return_items (branch_id, sr_id, item_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [context.branchId, sr.sr_id, item.itemId, item.quantity, unitPrice, lineTotal]
                );

                await client.query(
                    `INSERT INTO ims.store_items (store_id, product_id, quantity)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (store_id, product_id)
                     DO UPDATE
                           SET quantity = ims.store_items.quantity + EXCLUDED.quantity,
                               updated_at = NOW()`,
                    [storeId, item.itemId, item.quantity]
                );
            }

            await client.query('COMMIT');
            return sr;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async updateSalesReturn(
        id: number,
        input: UpdateSalesReturnInput,
        scope: BranchScope,
        context: { userId: number }
    ): Promise<SalesReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query<{ sr_id: number; branch_id: number }>(
                `SELECT sr_id, branch_id
                   FROM ims.sales_returns
                  WHERE sr_id = $1
                  LIMIT 1`,
                [id]
            );
            const current = existing.rows[0];
            if (!current) throw ApiError.notFound('Sales return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) {
                throw ApiError.forbidden('Access denied');
            }
            if (!input.customerId || Number(input.customerId) <= 0) {
                throw ApiError.badRequest('Customer is required');
            }

            const items = input.items || [];
            if (!items.length) throw ApiError.badRequest('At least one item is required for a return');
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, current.branch_id]
                );
                if (!row.rows[0]) throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
            }

            const storeId = await getDefaultStoreId(client, Number(current.branch_id));
            const oldItemsRes = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.sales_return_items
                  WHERE sr_id = $1`,
                [id]
            );
            const deltas = buildItemDelta(oldItemsRes.rows, items);
            for (const d of deltas) {
                await applyStoreItemDelta(client, storeId, d.itemId, d.delta);
            }

            const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice || 0), 0);
            const total = subtotal;

            await client.query(
                `UPDATE ims.sales_returns
                    SET sale_id = $2,
                        customer_id = $3,
                        return_date = COALESCE($4::timestamptz, return_date),
                        subtotal = $5,
                        total = $6,
                        note = $7,
                        user_id = $8
                  WHERE sr_id = $1`,
                [
                    id,
                    input.saleId ?? null,
                    input.customerId,
                    input.returnDate || null,
                    subtotal,
                    total,
                    input.note || null,
                    context.userId,
                ]
            );

            await client.query(`DELETE FROM ims.sales_return_items WHERE sr_id = $1`, [id]);
            for (const item of items) {
                const unitPrice = Number(item.unitPrice || 0);
                await client.query(
                    `INSERT INTO ims.sales_return_items (branch_id, sr_id, item_id, quantity, unit_price, line_total)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        current.branch_id,
                        id,
                        item.itemId,
                        item.quantity,
                        unitPrice,
                        Number(item.quantity) * unitPrice,
                    ]
                );
            }

            const updated = await client.query<SalesReturn>(`SELECT * FROM ims.sales_returns WHERE sr_id = $1`, [id]);
            await client.query('COMMIT');
            return updated.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async deleteSalesReturn(id: number, scope: BranchScope): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query<{ sr_id: number; branch_id: number }>(
                `SELECT sr_id, branch_id FROM ims.sales_returns WHERE sr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            if (!current) throw ApiError.notFound('Sales return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) throw ApiError.forbidden('Access denied');

            const storeId = await getDefaultStoreId(client, Number(current.branch_id));
            const lines = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.sales_return_items
                  WHERE sr_id = $1`,
                [id]
            );
            for (const line of lines.rows) {
                await applyStoreItemDelta(client, storeId, Number(line.item_id), -Number(line.quantity || 0));
            }

            await client.query(`DELETE FROM ims.sales_returns WHERE sr_id = $1`, [id]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async listPurchaseReturns(scope: BranchScope): Promise<PurchaseReturn[]> {
        const supplierNameColumn = await getSupplierNameColumn();
        const params: any[] = [];
        let where = '';
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where = `WHERE pr.branch_id = ANY($1)`;
        }

        return queryMany<PurchaseReturn>(
            `SELECT
          pr.*,
          b.branch_name,
          u.name AS created_by_name,
          s.${supplierNameColumn} AS supplier_name
       FROM ims.purchase_returns pr
       LEFT JOIN ims.branches b ON b.branch_id = pr.branch_id
       LEFT JOIN ims.users u ON u.user_id = pr.user_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = pr.supplier_id
       ${where}
       ORDER BY pr.return_date DESC, pr.pr_id DESC
       LIMIT 500`,
            params
        );
    },

    async createPurchaseReturn(
        input: CreatePurchaseReturnInput,
        context: { branchId: number; userId: number }
    ): Promise<PurchaseReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const items = input.items || [];
            if (items.length === 0) {
                throw ApiError.badRequest('At least one item is required for a return');
            }
            if (!input.supplierId || Number(input.supplierId) <= 0) {
                throw ApiError.badRequest('Supplier is required');
            }

            const defaultStore = await client.query<{ store_id: number }>(
                `SELECT store_id
                   FROM ims.stores
                  WHERE branch_id = $1
                  ORDER BY store_id
                  LIMIT 1`,
                [context.branchId]
            );
            const storeId = Number(defaultStore.rows[0]?.store_id || 0);
            if (!storeId) {
                throw ApiError.badRequest('No store configured for this branch');
            }

            const supplier = await client.query<{ supplier_id: number }>(
                `SELECT supplier_id
                   FROM ims.suppliers
                  WHERE supplier_id = $1
                  LIMIT 1`,
                [input.supplierId]
            );
            if (!supplier.rows[0]) {
                throw ApiError.badRequest('Supplier not found');
            }

            // Validate items exist in branch
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, context.branchId]
                );
                if (!row.rows[0]) {
                    throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
                }
            }

            const subtotal = items.reduce(
                (s, i) => s + Number(i.quantity) * Number(i.unitCost || 0),
                0
            );
            const total = subtotal;

            const returnRes = await client.query<PurchaseReturn>(
                `INSERT INTO ims.purchase_returns
           (branch_id, purchase_id, user_id, supplier_id, return_date, subtotal, total, note)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8)
         RETURNING *`,
                [
                    context.branchId,
                    input.purchaseId ?? null,
                    context.userId,
                    input.supplierId,
                    input.returnDate || null,
                    subtotal,
                    total,
                    input.note || null,
                ]
            );
            const pr = returnRes.rows[0];

            for (const item of items) {
                const unitCost = Number(item.unitCost || 0);
                const lineTotal = Number(item.quantity) * unitCost;

                await client.query(
                    `INSERT INTO ims.purchase_return_items (branch_id, pr_id, item_id, quantity, unit_cost, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [context.branchId, pr.pr_id, item.itemId, item.quantity, unitCost, lineTotal]
                );

                await client.query(
                    `INSERT INTO ims.store_items (store_id, product_id, quantity)
                     VALUES ($1, $2, 0)
                     ON CONFLICT (store_id, product_id)
                     DO UPDATE
                           SET quantity = GREATEST(0, ims.store_items.quantity - $3),
                               updated_at = NOW()`,
                    [storeId, item.itemId, item.quantity]
                );
            }

            await client.query('COMMIT');
            return pr;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async updatePurchaseReturn(
        id: number,
        input: UpdatePurchaseReturnInput,
        scope: BranchScope,
        context: { userId: number }
    ): Promise<PurchaseReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query<{ pr_id: number; branch_id: number }>(
                `SELECT pr_id, branch_id FROM ims.purchase_returns WHERE pr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            if (!current) throw ApiError.notFound('Purchase return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) throw ApiError.forbidden('Access denied');
            if (!input.supplierId || Number(input.supplierId) <= 0) throw ApiError.badRequest('Supplier is required');

            const items = input.items || [];
            if (!items.length) throw ApiError.badRequest('At least one item is required for a return');
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, current.branch_id]
                );
                if (!row.rows[0]) throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
            }

            const storeId = await getDefaultStoreId(client, Number(current.branch_id));
            const oldItemsRes = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.purchase_return_items
                  WHERE pr_id = $1`,
                [id]
            );
            const deltas = buildItemDelta(oldItemsRes.rows, items);
            for (const d of deltas) {
                await applyStoreItemDelta(client, storeId, d.itemId, -d.delta);
            }

            const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost || 0), 0);
            const total = subtotal;
            await client.query(
                `UPDATE ims.purchase_returns
                    SET purchase_id = $2,
                        supplier_id = $3,
                        return_date = COALESCE($4::timestamptz, return_date),
                        subtotal = $5,
                        total = $6,
                        note = $7,
                        user_id = $8
                  WHERE pr_id = $1`,
                [
                    id,
                    input.purchaseId ?? null,
                    input.supplierId,
                    input.returnDate || null,
                    subtotal,
                    total,
                    input.note || null,
                    context.userId,
                ]
            );

            await client.query(`DELETE FROM ims.purchase_return_items WHERE pr_id = $1`, [id]);
            for (const item of items) {
                const unitCost = Number(item.unitCost || 0);
                await client.query(
                    `INSERT INTO ims.purchase_return_items (branch_id, pr_id, item_id, quantity, unit_cost, line_total)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        current.branch_id,
                        id,
                        item.itemId,
                        item.quantity,
                        unitCost,
                        Number(item.quantity) * unitCost,
                    ]
                );
            }

            const updated = await client.query<PurchaseReturn>(`SELECT * FROM ims.purchase_returns WHERE pr_id = $1`, [id]);
            await client.query('COMMIT');
            return updated.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async deletePurchaseReturn(id: number, scope: BranchScope): Promise<void> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query<{ pr_id: number; branch_id: number }>(
                `SELECT pr_id, branch_id FROM ims.purchase_returns WHERE pr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            if (!current) throw ApiError.notFound('Purchase return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) throw ApiError.forbidden('Access denied');

            const storeId = await getDefaultStoreId(client, Number(current.branch_id));
            const lines = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.purchase_return_items
                  WHERE pr_id = $1`,
                [id]
            );
            for (const line of lines.rows) {
                await applyStoreItemDelta(client, storeId, Number(line.item_id), Number(line.quantity || 0));
            }

            await client.query(`DELETE FROM ims.purchase_returns WHERE pr_id = $1`, [id]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },
};
