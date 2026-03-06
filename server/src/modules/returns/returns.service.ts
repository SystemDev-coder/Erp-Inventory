import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
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
    reference_no?: string | null;
    status?: string | null;
    created_at?: string | null;
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
    reference_no?: string | null;
    status?: string | null;
    created_at?: string | null;
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
let cachedSalesHasDocType: boolean | null = null;

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

const hasSalesDocTypeColumn = async (): Promise<boolean> => {
    if (cachedSalesHasDocType !== null) return cachedSalesHasDocType;
    const row = await queryOne<{ has_column: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'ims'
              AND table_name = 'sales'
              AND column_name = 'doc_type'
         ) AS has_column`
    );
    cachedSalesHasDocType = Boolean(row?.has_column);
    return cachedSalesHasDocType;
};

const resolveStoreForItem = async (
    client: PoolClient,
    branchId: number,
    itemId: number
): Promise<number> => {
    const itemStore = await client.query<{ store_id: number | null }>(
        `SELECT store_id
           FROM ims.items
          WHERE item_id = $1
            AND branch_id = $2
          LIMIT 1`,
        [itemId, branchId]
    );

    const directStoreId = Number(itemStore.rows[0]?.store_id || 0);
    if (directStoreId > 0) {
        const scopedStore = await client.query<{ store_id: number }>(
            `SELECT store_id
               FROM ims.stores
              WHERE store_id = $1
                AND branch_id = $2
              LIMIT 1`,
            [directStoreId, branchId]
        );
        if (scopedStore.rows[0]) return Number(scopedStore.rows[0].store_id);
    }

    const fallbackStore = await client.query<{ store_id: number }>(
        `SELECT store_id
           FROM ims.stores
          WHERE branch_id = $1
          ORDER BY store_id
          LIMIT 1`,
        [branchId]
    );
    const storeId = Number(fallbackStore.rows[0]?.store_id || 0);
    if (!storeId) throw ApiError.badRequest(`No store is configured for item ${itemId}`);
    return storeId;
};

const applyStoreItemDelta = async (
    client: PoolClient,
    params: { branchId: number; itemId: number; deltaQty: number; storeId?: number | null }
) => {
    const { branchId, itemId, deltaQty } = params;
    if (!deltaQty) return;
    const storeId =
        Number(params.storeId || 0) > 0
            ? Number(params.storeId)
            : await resolveStoreForItem(client, branchId, itemId);

    const current = await client.query<{ quantity: string }>(
        `SELECT quantity::text AS quantity
           FROM ims.store_items
          WHERE store_id = $1
            AND product_id = $2
          FOR UPDATE`,
        [storeId, itemId]
    );
    let currentQty = Number(current.rows[0]?.quantity || 0);
    if (!current.rows[0]) {
        const item = await client.query<{ opening_balance: string }>(
            `SELECT COALESCE(opening_balance, 0)::text AS opening_balance
               FROM ims.items
              WHERE item_id = $1
                AND branch_id = $2
              LIMIT 1`,
            [itemId, branchId]
        );
        currentQty = Number(item.rows[0]?.opening_balance || 0);
    }
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

    async listSalesItemsByCustomer(scope: BranchScope, customerId: number): Promise<ReturnItemOption[]> {
        if (!Number.isFinite(customerId) || customerId <= 0) {
            throw ApiError.badRequest('Customer is required');
        }
        const docTypeFilter = (await hasSalesDocTypeColumn())
            ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
            : '';
        const params: any[] = [customerId];
        let where = `
            WHERE s.customer_id = $1
              AND COALESCE(s.status::text, 'posted') <> 'void'
              ${docTypeFilter}
        `;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND s.branch_id = ANY($${params.length})`;
        }
        return queryMany<ReturnItemOption>(
            `SELECT
                i.item_id,
                i.name,
                i.barcode,
                COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price,
                COALESCE(
                  MAX(
                    COALESCE(
                      NULLIF(si.unit_price, 0),
                      CASE
                        WHEN COALESCE(si.quantity, 0) > 0
                          THEN NULLIF(si.line_total, 0) / si.quantity
                        ELSE NULL
                      END
                    )
                  ),
                  i.sell_price,
                  i.cost_price,
                  0
                )::numeric(14,2) AS sell_price
             FROM ims.sales s
             JOIN ims.sale_items si ON si.sale_id = s.sale_id
             JOIN ims.items i ON i.item_id = si.item_id
             ${where}
             GROUP BY i.item_id, i.name, i.barcode, i.cost_price, i.sell_price
             ORDER BY i.name`,
            params
        );
    },

    async listPurchaseItemsBySupplier(scope: BranchScope, supplierId: number): Promise<ReturnItemOption[]> {
        if (!Number.isFinite(supplierId) || supplierId <= 0) {
            throw ApiError.badRequest('Supplier is required');
        }
        const params: any[] = [supplierId];
        let where = `
            WHERE p.supplier_id = $1
              AND COALESCE(p.status::text, 'received') <> 'void'
        `;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND p.branch_id = ANY($${params.length})`;
        }
        return queryMany<ReturnItemOption>(
            `SELECT
                i.item_id,
                i.name,
                i.barcode,
                COALESCE(
                  MAX(
                    COALESCE(
                      NULLIF(pi.unit_cost, 0),
                      CASE
                        WHEN COALESCE(pi.quantity, 0) > 0
                          THEN NULLIF(pi.line_total, 0) / pi.quantity
                        ELSE NULL
                      END
                    )
                  ),
                  i.cost_price,
                  0
                )::numeric(14,2) AS cost_price,
                COALESCE(i.sell_price, 0)::numeric(14,2) AS sell_price
             FROM ims.purchases p
             JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
             JOIN ims.items i ON i.item_id = pi.item_id
             ${where}
             GROUP BY i.item_id, i.name, i.barcode, i.cost_price, i.sell_price
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
          ('SR-' || LPAD(sr.sr_id::text, 5, '0')) AS reference_no,
          'POSTED'::text AS status,
          sr.return_date AS created_at,
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
            const docTypeFilter = (await hasSalesDocTypeColumn())
                ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
                : '';
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, context.branchId]
                );
                if (!row.rows[0]) {
                    throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
                }
                const sold = await client.query<{ sale_id: number }>(
                    `SELECT s.sale_id
                       FROM ims.sales s
                       JOIN ims.sale_items si ON si.sale_id = s.sale_id
                      WHERE s.branch_id = $1
                        AND s.customer_id = $2
                        AND si.item_id = $3
                        AND COALESCE(s.status::text, 'posted') <> 'void'
                        ${docTypeFilter}
                      LIMIT 1`,
                    [context.branchId, input.customerId, item.itemId]
                );
                if (!sold.rows[0]) {
                    throw ApiError.badRequest(`Item #${item.itemId} was not sold to this customer`);
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

                await applyStoreItemDelta(client, {
                    branchId: context.branchId,
                    itemId: item.itemId,
                    deltaQty: Number(item.quantity),
                });
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
            const docTypeFilter = (await hasSalesDocTypeColumn())
                ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
                : '';
            for (const item of items) {
                const row = await client.query<{ item_id: number }>(
                    `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = $2 LIMIT 1`,
                    [item.itemId, current.branch_id]
                );
                if (!row.rows[0]) throw ApiError.badRequest(`Item #${item.itemId} does not belong to this branch`);
                const sold = await client.query<{ sale_id: number }>(
                    `SELECT s.sale_id
                       FROM ims.sales s
                       JOIN ims.sale_items si ON si.sale_id = s.sale_id
                      WHERE s.branch_id = $1
                        AND s.customer_id = $2
                        AND si.item_id = $3
                        AND COALESCE(s.status::text, 'posted') <> 'void'
                        ${docTypeFilter}
                      LIMIT 1`,
                    [current.branch_id, input.customerId, item.itemId]
                );
                if (!sold.rows[0]) throw ApiError.badRequest(`Item #${item.itemId} was not sold to this customer`);
            }

            const oldItemsRes = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.sales_return_items
                  WHERE sr_id = $1`,
                [id]
            );
            const deltas = buildItemDelta(oldItemsRes.rows, items);
            for (const d of deltas) {
                await applyStoreItemDelta(client, {
                    branchId: Number(current.branch_id),
                    itemId: d.itemId,
                    deltaQty: d.delta,
                });
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

            const lines = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.sales_return_items
                  WHERE sr_id = $1`,
                [id]
            );
            for (const line of lines.rows) {
                await applyStoreItemDelta(client, {
                    branchId: Number(current.branch_id),
                    itemId: Number(line.item_id),
                    deltaQty: -Number(line.quantity || 0),
                });
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
          ('PR-' || LPAD(pr.pr_id::text, 5, '0')) AS reference_no,
          'POSTED'::text AS status,
          pr.return_date AS created_at,
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
                const purchased = await client.query<{ purchase_id: number }>(
                    `SELECT p.purchase_id
                       FROM ims.purchases p
                       JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
                      WHERE p.branch_id = $1
                        AND p.supplier_id = $2
                        AND pi.item_id = $3
                        AND COALESCE(p.status::text, 'received') <> 'void'
                      LIMIT 1`,
                    [context.branchId, input.supplierId, item.itemId]
                );
                if (!purchased.rows[0]) {
                    throw ApiError.badRequest(`Item #${item.itemId} was not purchased from this supplier`);
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

                await applyStoreItemDelta(client, {
                    branchId: context.branchId,
                    itemId: item.itemId,
                    deltaQty: -Number(item.quantity),
                });
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
                const purchased = await client.query<{ purchase_id: number }>(
                    `SELECT p.purchase_id
                       FROM ims.purchases p
                       JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
                      WHERE p.branch_id = $1
                        AND p.supplier_id = $2
                        AND pi.item_id = $3
                        AND COALESCE(p.status::text, 'received') <> 'void'
                      LIMIT 1`,
                    [current.branch_id, input.supplierId, item.itemId]
                );
                if (!purchased.rows[0]) throw ApiError.badRequest(`Item #${item.itemId} was not purchased from this supplier`);
            }

            const oldItemsRes = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.purchase_return_items
                  WHERE pr_id = $1`,
                [id]
            );
            const deltas = buildItemDelta(oldItemsRes.rows, items);
            for (const d of deltas) {
                await applyStoreItemDelta(client, {
                    branchId: Number(current.branch_id),
                    itemId: d.itemId,
                    deltaQty: -d.delta,
                });
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

            const lines = await client.query<{ item_id: number; quantity: string }>(
                `SELECT item_id, quantity::text AS quantity
                   FROM ims.purchase_return_items
                  WHERE pr_id = $1`,
                [id]
            );
            for (const line of lines.rows) {
                await applyStoreItemDelta(client, {
                    branchId: Number(current.branch_id),
                    itemId: Number(line.item_id),
                    deltaQty: Number(line.quantity || 0),
                });
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
