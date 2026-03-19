import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { PoolClient } from 'pg';
import { adjustSystemAccountBalance } from '../../utils/systemAccounts';

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
    balance_adjustment?: number;
    refund_acc_id?: number | null;
    refund_account_name?: string | null;
    refund_amount?: number;
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
    balance_adjustment?: number;
    refund_acc_id?: number | null;
    refund_account_name?: string | null;
    refund_amount?: number;
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
  sold_qty?: number;
  returned_qty?: number;
  on_hand_qty?: number;
  available_qty?: number;
}

export interface CreateSalesReturnInput {
    saleId?: number;
    customerId: number;
    returnDate?: string;
    note?: string;
    refundAccId?: number;
    refundAmount?: number;
    items: ReturnItemInput[];
}

export interface CreatePurchaseReturnInput {
    purchaseId?: number;
    supplierId: number;
    returnDate?: string;
    note?: string;
    refundAccId?: number;
    refundAmount?: number;
    items: ReturnItemInput[];
}

export interface UpdateSalesReturnInput extends CreateSalesReturnInput {}
export interface UpdatePurchaseReturnInput extends CreatePurchaseReturnInput {}

const canAccessBranch = (scope: BranchScope, branchId: number) =>
    scope.isAdmin || scope.branchIds.includes(branchId);

const normalizeReturnItems = (items: ReturnItemInput[] | undefined): ReturnItemInput[] => {
    const normalized = (items || []).map((item) => {
        const itemId = Number(item.itemId);
        const rawQuantity = Number(item.quantity);
        const quantity = Math.round(rawQuantity);
        if (!itemId || Number.isNaN(itemId)) {
            throw ApiError.badRequest('Item is required for each line');
        }
        if (!quantity || Number.isNaN(rawQuantity) || quantity <= 0) {
            throw ApiError.badRequest('Quantity must be greater than zero');
        }
        return { ...item, itemId, quantity };
    });
    return normalized;
};

const roundMoney = (value: number): number => {
    const n = Number(value || 0);
    return Math.round((n + Number.EPSILON) * 100) / 100;
};

const requireRefundRules = (params: {
    total: number;
    outstanding: number;
    refundAmount: number;
    label: 'customer' | 'supplier';
}) => {
    const total = roundMoney(params.total);
    const outstanding = Math.max(Number(params.outstanding || 0), 0);
    const refundAmount = roundMoney(params.refundAmount);

    if (refundAmount < 0) {
        throw ApiError.badRequest('Refund amount cannot be negative');
    }
    if (refundAmount > total) {
        throw ApiError.badRequest('Refund amount cannot exceed return total');
    }

    const minRefund = roundMoney(Math.max(0, total - outstanding));
    if (refundAmount + 1e-9 < minRefund) {
        const who = params.label === 'customer' ? 'Customer' : 'Supplier';
        throw ApiError.badRequest(`${who} refund must be at least ${minRefund.toFixed(2)} to avoid negative balance`);
    }

    const balanceAdjustment = roundMoney(total - refundAmount);
    if (balanceAdjustment - outstanding > 1e-6) {
        throw ApiError.badRequest('Return would make balance negative; increase refund amount');
    }

    return { minRefund, balanceAdjustment, refundAmount, total };
};

let cachedSupplierNameColumn: 'name' | 'supplier_name' | null = null;
let cachedSalesHasDocType: boolean | null = null;
type BalanceColumns = { hasOpenBalance: boolean; hasRemainingBalance: boolean };
let cachedCustomerBalanceColumns: BalanceColumns | null = null;
let cachedSupplierBalanceColumns: BalanceColumns | null = null;
let cachedSalesReturnBalanceColumn: boolean | null = null;
let cachedPurchaseReturnBalanceColumn: boolean | null = null;

type LedgerEntryEnumMeta = { schema: string; name: string };
let cachedLedgerEntryEnumMeta: LedgerEntryEnumMeta | null = null;
let cachedLedgerEntryEnumLabels: Set<string> | null = null;

const getLedgerEntryEnumMeta = async (client: PoolClient): Promise<LedgerEntryEnumMeta | null> => {
    if (cachedLedgerEntryEnumMeta) return cachedLedgerEntryEnumMeta;

    const fromCustomer = await client.query<{ udt_schema: string; udt_name: string }>(
        `SELECT udt_schema, udt_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'customer_ledger'
            AND column_name = 'entry_type'
          LIMIT 1`
    );
    const row = fromCustomer.rows[0];
    if (!row?.udt_name) return null;

    cachedLedgerEntryEnumMeta = { schema: row.udt_schema || 'ims', name: row.udt_name };
    return cachedLedgerEntryEnumMeta;
};

const getLedgerEntryEnumLabels = async (client: PoolClient): Promise<Set<string>> => {
    if (cachedLedgerEntryEnumLabels) return cachedLedgerEntryEnumLabels;

    const meta = await getLedgerEntryEnumMeta(client);
    if (!meta) {
        cachedLedgerEntryEnumLabels = new Set();
        return cachedLedgerEntryEnumLabels;
    }

    const res = await client.query<{ enumlabel: string }>(
        `SELECT e.enumlabel
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = $1
            AND t.typname = $2
          ORDER BY e.enumsortorder`,
        [meta.schema, meta.name]
    );
    cachedLedgerEntryEnumLabels = new Set(res.rows.map((r) => r.enumlabel));
    return cachedLedgerEntryEnumLabels;
};

const pickLedgerEntryType = async (client: PoolClient, preferred: string[]): Promise<string> => {
    const labels = await getLedgerEntryEnumLabels(client);
    if (!labels.size) return preferred[0];

    for (const candidate of preferred) {
        if (labels.has(candidate)) return candidate;
    }

    for (const fallback of ['adjustment', 'payment', 'sale', 'purchase']) {
        if (labels.has(fallback)) return fallback;
    }

    throw ApiError.internal('Ledger entry enum is missing expected values');
};

const hasSalesReturnBalanceAdjustment = async (client: PoolClient): Promise<boolean> => {
    if (cachedSalesReturnBalanceColumn !== null) return cachedSalesReturnBalanceColumn;
    const result = await client.query<{ has_column: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'ims'
              AND table_name = 'sales_returns'
              AND column_name = 'balance_adjustment'
         ) AS has_column`
    );
    cachedSalesReturnBalanceColumn = Boolean(result.rows[0]?.has_column);
    return cachedSalesReturnBalanceColumn;
};

const hasPurchaseReturnBalanceAdjustment = async (client: PoolClient): Promise<boolean> => {
    if (cachedPurchaseReturnBalanceColumn !== null) return cachedPurchaseReturnBalanceColumn;
    const result = await client.query<{ has_column: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'ims'
              AND table_name = 'purchase_returns'
              AND column_name = 'balance_adjustment'
         ) AS has_column`
    );
    cachedPurchaseReturnBalanceColumn = Boolean(result.rows[0]?.has_column);
    return cachedPurchaseReturnBalanceColumn;
};

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

const getCustomerBalanceColumns = async (client: PoolClient): Promise<BalanceColumns> => {
    if (cachedCustomerBalanceColumns) return cachedCustomerBalanceColumns;
    const result = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'customers'`
    );
    const names = new Set(result.rows.map((row) => row.column_name));
    cachedCustomerBalanceColumns = {
        hasOpenBalance: names.has('open_balance'),
        hasRemainingBalance: names.has('remaining_balance'),
    };
    return cachedCustomerBalanceColumns;
};

const getCustomerBalanceColumn = async (
    client: PoolClient
): Promise<'remaining_balance' | 'open_balance' | null> => {
    const cols = await getCustomerBalanceColumns(client);
    if (cols.hasRemainingBalance) return 'remaining_balance';
    if (cols.hasOpenBalance) return 'open_balance';
    return null;
};

const getCustomerOutstandingForUpdate = async (
    client: PoolClient,
    params: { branchId: number; customerId: number }
): Promise<number> => {
    const column = await getCustomerBalanceColumn(client);
    if (!column) return 0;
    const row = await client.query<{ balance: string }>(
        `SELECT ${column}::text AS balance
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [params.customerId, params.branchId]
    );
    return Number(row.rows[0]?.balance || 0);
};

const adjustCustomerBalance = async (
    client: PoolClient,
    params: { branchId: number; customerId?: number | null; delta: number }
) => {
    if (!params.customerId || !params.delta) return;
    const cols = await getCustomerBalanceColumns(client);
    const updates: string[] = [];
    if (cols.hasRemainingBalance) {
        updates.push(`remaining_balance = remaining_balance + $1`);
    } else if (cols.hasOpenBalance) {
        // Legacy schema: open_balance acts as the live balance.
        updates.push(`open_balance = open_balance + $1`);
    }
    await adjustSystemAccountBalance(client, {
        branchId: params.branchId,
        kind: 'receivable',
        delta: params.delta,
    });
    if (!updates.length) return;
    await client.query(
        `UPDATE ims.customers
            SET ${updates.join(', ')}
          WHERE customer_id = $2
            AND branch_id = $3`,
        [params.delta, params.customerId, params.branchId]
    );
};

const getSupplierBalanceColumns = async (client: PoolClient): Promise<BalanceColumns> => {
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

const getSupplierBalanceColumn = async (
    client: PoolClient
): Promise<'remaining_balance' | 'open_balance' | null> => {
    const cols = await getSupplierBalanceColumns(client);
    if (cols.hasRemainingBalance) return 'remaining_balance';
    if (cols.hasOpenBalance) return 'open_balance';
    return null;
};

const getSupplierOutstandingForUpdate = async (
    client: PoolClient,
    params: { branchId: number; supplierId: number }
): Promise<number> => {
    const column = await getSupplierBalanceColumn(client);
    if (!column) return 0;
    const row = await client.query<{ balance: string }>(
        `SELECT ${column}::text AS balance
           FROM ims.suppliers
          WHERE supplier_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [params.supplierId, params.branchId]
    );
    return Number(row.rows[0]?.balance || 0);
};

const adjustSupplierBalance = async (
    client: PoolClient,
    params: { branchId: number; supplierId?: number | null; delta: number }
) => {
    if (!params.supplierId || !params.delta) return;
    const cols = await getSupplierBalanceColumns(client);
    const updates: string[] = [];
    if (cols.hasRemainingBalance) {
        updates.push(`remaining_balance = remaining_balance + $1`);
    } else if (cols.hasOpenBalance) {
        // Legacy schema: open_balance acts as the live balance.
        updates.push(`open_balance = open_balance + $1`);
    }
    await adjustSystemAccountBalance(client, {
        branchId: params.branchId,
        kind: 'payable',
        delta: params.delta,
    });
    if (!updates.length) return;
    await client.query(
        `UPDATE ims.suppliers
            SET ${updates.join(', ')}
          WHERE supplier_id = $2
            AND branch_id = $3`,
        [params.delta, params.supplierId, params.branchId]
    );
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

    // Prefer a store where the item currently exists (highest quantity) to avoid false "insufficient stock".
    const storeWithStock = await client.query<{ store_id: number }>(
        `SELECT si.store_id
           FROM ims.store_items si
           JOIN ims.stores st ON st.store_id = si.store_id
          WHERE st.branch_id = $1
            AND si.product_id = $2
          ORDER BY si.quantity DESC, si.store_id ASC
          LIMIT 1`,
        [branchId, itemId]
    );
    if (storeWithStock.rows[0]) return Number(storeWithStock.rows[0].store_id);

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

const isNegativeStockAllowed = () =>
    String(process.env.ALLOW_NEGATIVE_STOCK || '').trim().toLowerCase() === 'true';

let cachedItemsHasQuantity: boolean | null = null;
const hasItemsQuantityColumn = async (client: PoolClient): Promise<boolean> => {
    if (cachedItemsHasQuantity !== null) return cachedItemsHasQuantity;
    const row = await client.query<{ has_column: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'ims'
              AND table_name = 'items'
              AND column_name = 'quantity'
         ) AS has_column`
    );
    cachedItemsHasQuantity = Boolean(row.rows[0]?.has_column);
    return cachedItemsHasQuantity;
};

const applyItemQuantityDelta = async (
    client: PoolClient,
    params: { branchId: number; itemId: number; deltaQty: number }
) => {
    const delta = Math.round(params.deltaQty);
    if (!delta) return;
    const hasQty = await hasItemsQuantityColumn(client);
    const colExpr = hasQty
        ? `COALESCE(quantity, COALESCE(opening_balance, 0))`
        : `COALESCE(opening_balance, 0)`;
    const row = await client.query<{ quantity: string }>(
        `SELECT ${colExpr}::text AS quantity
           FROM ims.items
          WHERE item_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [params.itemId, params.branchId]
    );
    if (!row.rows[0]) throw ApiError.badRequest('Item not found');
    const currentQty = Number(row.rows[0].quantity || 0);
    const nextQty = currentQty + delta;
    if (!isNegativeStockAllowed() && nextQty < 0) {
        throw ApiError.badRequest('Insufficient stock for this return');
    }
    if (hasQty) {
        await client.query(
            `UPDATE ims.items
                SET quantity = $3
              WHERE item_id = $1
                AND branch_id = $2`,
            [params.itemId, params.branchId, nextQty]
        );
        return;
    }
    await client.query(
        `UPDATE ims.items
            SET opening_balance = $3
          WHERE item_id = $1
            AND branch_id = $2`,
        [params.itemId, params.branchId, Math.max(0, nextQty)]
    );
};

const applyStoreItemDelta = async (
    client: PoolClient,
    params: { branchId: number; itemId: number; deltaQty: number; storeId?: number | null }
) => {
    const { branchId, itemId, deltaQty } = params;
    const roundedDelta = Math.round(deltaQty);
    if (!roundedDelta) return;
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
        const existingAny = await client.query<{ qty: string; cnt: string }>(
            `SELECT COALESCE(SUM(si.quantity), 0)::text AS qty,
                    COUNT(*)::text AS cnt
               FROM ims.store_items si
               JOIN ims.stores st ON st.store_id = si.store_id
              WHERE st.branch_id = $1
                AND si.product_id = $2`,
            [branchId, itemId]
        );
        const anyCount = Number(existingAny.rows[0]?.cnt || 0);
        if (anyCount > 0) {
            currentQty = 0;
        } else {
            const item = await client.query<{ balance: string }>(
                `SELECT COALESCE(
                    NULLIF(to_jsonb(i)->>'quantity','')::numeric,
                    NULLIF(to_jsonb(i)->>'opening_balance','')::numeric,
                    0
                  )::text AS balance
                FROM ims.items i
               WHERE i.item_id = $1
                 AND i.branch_id = $2
               LIMIT 1`,
                [itemId, branchId]
            );
            currentQty = Number(item.rows[0]?.balance || 0);
        }
    }
    const nextQty = currentQty + roundedDelta;
    if (!isNegativeStockAllowed() && nextQty < 0) {
        throw ApiError.badRequest(`Insufficient stock for item ${itemId}. Available: ${Math.max(currentQty, 0)}`);
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

    // Keep master item quantity in sync with store quantities.
    const storeSum = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(si.quantity), 0)::text AS qty
           FROM ims.store_items si
           JOIN ims.stores st ON st.store_id = si.store_id
          WHERE st.branch_id = $1
            AND si.product_id = $2`,
        [branchId, itemId]
    );
    const totalQty = Number(storeSum.rows[0]?.qty || 0);
    const hasQtyColumn = await hasItemsQuantityColumn(client);
    if (hasQtyColumn) {
        await client.query(
            `UPDATE ims.items
                SET quantity = $3
              WHERE item_id = $1
                AND branch_id = $2`,
            [itemId, branchId, totalQty]
        );
    } else {
        await client.query(
            `UPDATE ims.items
                SET opening_balance = $3
              WHERE item_id = $1
                AND branch_id = $2`,
            [itemId, branchId, Math.max(0, totalQty)]
        );
    }
};

const buildItemDelta = (
    oldItems: Array<{ item_id: number; quantity: string | number }>,
    newItems: ReturnItemInput[]
) => {
    const oldMap = new Map<number, number>();
    const newMap = new Map<number, number>();
    oldItems.forEach((it) => oldMap.set(Number(it.item_id), Math.round(Number(it.quantity || 0))));
    newItems.forEach((it) => newMap.set(Number(it.itemId), Math.round(Number(it.quantity || 0))));
    const keys = new Set<number>([...oldMap.keys(), ...newMap.keys()]);
    const deltas: Array<{ itemId: number; delta: number }> = [];
    keys.forEach((k) => {
        const delta = Number((newMap.get(k) || 0) - (oldMap.get(k) || 0));
        if (delta !== 0) deltas.push({ itemId: k, delta });
    });
    return deltas;
};

const getSalesReturnLimit = async (
    client: PoolClient,
    params: {
        branchId: number;
        customerId: number;
        itemId: number;
        saleId?: number | null;
        excludeReturnId?: number | null;
    }
) => {
    const saleParams: any[] = [params.branchId, params.customerId, params.itemId];
    const saleIdFilter = params.saleId ? `AND s.sale_id = $4` : '';
    if (params.saleId) saleParams.push(params.saleId);
    const sold = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(si.quantity), 0)::text AS qty
           FROM ims.sales s
           JOIN ims.sale_items si ON si.sale_id = s.sale_id
          WHERE s.branch_id = $1
            AND s.customer_id = $2
            AND si.item_id = $3
            AND COALESCE(s.status::text, 'posted') <> 'void'
            ${saleIdFilter}`,
        saleParams
    );
    const soldQty = Number(sold.rows[0]?.qty || 0);

    const returnParams: any[] = [params.branchId, params.customerId, params.itemId];
    let excludeFilter = '';
    if (params.excludeReturnId) {
        returnParams.push(params.excludeReturnId);
        excludeFilter = `AND sr.sr_id <> $${returnParams.length}`;
    }
    const returnSaleFilter = params.saleId ? `AND sr.sale_id = $${returnParams.length + 1}` : '';
    if (params.saleId) returnParams.push(params.saleId);
    const returned = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(sri.quantity), 0)::text AS qty
           FROM ims.sales_returns sr
           JOIN ims.sales_return_items sri ON sri.sr_id = sr.sr_id
          WHERE sr.branch_id = $1
            AND sr.customer_id = $2
            AND sri.item_id = $3
            ${excludeFilter}
            ${returnSaleFilter}`,
        returnParams
    );
    const returnedQty = Number(returned.rows[0]?.qty || 0);
    return { soldQty, returnedQty, availableQty: Math.max(soldQty - returnedQty, 0) };
};

const getPurchaseReturnLimit = async (
    client: PoolClient,
    params: {
        branchId: number;
        supplierId: number;
        itemId: number;
        purchaseId?: number | null;
        excludeReturnId?: number | null;
    }
) => {
    const purchaseParams: any[] = [params.branchId, params.supplierId, params.itemId];
    const purchaseIdFilter = params.purchaseId ? `AND p.purchase_id = $4` : '';
    if (params.purchaseId) purchaseParams.push(params.purchaseId);
    const purchased = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(pi.quantity), 0)::text AS qty
           FROM ims.purchases p
           JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
          WHERE p.branch_id = $1
            AND p.supplier_id = $2
            AND pi.item_id = $3
            AND COALESCE(p.status::text, 'received') <> 'void'
            ${purchaseIdFilter}`,
        purchaseParams
    );
    const purchasedQty = Number(purchased.rows[0]?.qty || 0);

    const returnParams: any[] = [params.branchId, params.supplierId, params.itemId];
    let excludeFilter = '';
    if (params.excludeReturnId) {
        returnParams.push(params.excludeReturnId);
        excludeFilter = `AND pr.pr_id <> $${returnParams.length}`;
    }
    const returnPurchaseFilter = params.purchaseId ? `AND pr.purchase_id = $${returnParams.length + 1}` : '';
    if (params.purchaseId) returnParams.push(params.purchaseId);
    const returned = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(pri.quantity), 0)::text AS qty
           FROM ims.purchase_returns pr
           JOIN ims.purchase_return_items pri ON pri.pr_id = pr.pr_id
          WHERE pr.branch_id = $1
            AND pr.supplier_id = $2
            AND pri.item_id = $3
            ${excludeFilter}
            ${returnPurchaseFilter}`,
        returnParams
    );
    const returnedQty = Number(returned.rows[0]?.qty || 0);
    return { purchasedQty, returnedQty, availableQty: Math.max(purchasedQty - returnedQty, 0) };
};

const assertAccountInBranch = async (client: PoolClient, branchId: number, accId: number) => {
    const row = await client.query<{ acc_id: number }>(
        `SELECT acc_id
           FROM ims.accounts
          WHERE acc_id = $1
            AND branch_id = $2
          LIMIT 1`,
        [accId, branchId]
    );
    if (!row.rows[0]) throw ApiError.badRequest('Account not found for this branch');
};

const applyAccountBalanceDelta = async (
    client: PoolClient,
    params: { branchId: number; accId: number; delta: number }
) => {
    const { branchId, accId, delta } = params;
    if (!delta) return;
    const current = await client.query<{ balance: string }>(
        `SELECT balance::text AS balance
           FROM ims.accounts
          WHERE acc_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [accId, branchId]
    );
    if (!current.rows[0]) throw ApiError.badRequest('Account not found for this branch');
    const balance = Number(current.rows[0].balance || 0);
    const next = balance + Number(delta);
    if (next < 0) throw ApiError.badRequest('Insufficient account balance');
    await client.query(
        `UPDATE ims.accounts
            SET balance = $3
          WHERE acc_id = $1
            AND branch_id = $2`,
        [accId, branchId, next]
    );
};

const clearRefundTransactions = async (
    client: PoolClient,
    params: { branchId: number; refTable: string; refId: number }
) => {
    const { branchId, refTable, refId } = params;
    const existing = await client.query<{ txn_id: number; acc_id: number; debit: string; credit: string }>(
        `SELECT txn_id, acc_id, debit::text AS debit, credit::text AS credit
           FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = $2
            AND ref_id = $3
            AND txn_type = 'return_refund'`,
        [branchId, refTable, refId]
    );
    for (const row of existing.rows) {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);
        if (!row.acc_id) continue;
        if (debit > 0) {
            await applyAccountBalanceDelta(client, { branchId, accId: row.acc_id, delta: debit });
        } else if (credit > 0) {
            await applyAccountBalanceDelta(client, { branchId, accId: row.acc_id, delta: -credit });
        }
    }
    if (existing.rows.length) {
        await client.query(
            `DELETE FROM ims.account_transactions
              WHERE branch_id = $1
                AND ref_table = $2
                AND ref_id = $3
                AND txn_type = 'return_refund'`,
            [branchId, refTable, refId]
        );
    }
};

const insertReturnMovement = async (
    client: PoolClient,
    params: {
        branchId: number;
        itemId: number;
        moveType: 'sales_return' | 'purchase_return';
        refTable: string;
        refId: number;
        qtyIn?: number;
        qtyOut?: number;
        unitCost?: number;
        note?: string;
    }
) => {
    const qtyIn = Math.round(Number(params.qtyIn || 0));
    const qtyOut = Math.round(Number(params.qtyOut || 0));
    if (!qtyIn && !qtyOut) return;
    await client.query(
        `INSERT INTO ims.inventory_movements
           (branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            params.branchId,
            params.itemId,
            params.moveType,
            params.refTable,
            params.refId,
            qtyIn,
            qtyOut,
            Number(params.unitCost || 0),
            params.note || null,
        ]
    );
};

export const returnsService = {
    async listSalesCustomers(scope: BranchScope): Promise<any[]> {
        const docTypeFilter = (await hasSalesDocTypeColumn())
            ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
            : '';

        const params: any[] = [];
        let where = `
            WHERE s.customer_id IS NOT NULL
              AND LOWER(COALESCE(s.status::text, '')) <> 'void'
              AND LOWER(COALESCE(s.status::text, '')) IN ('paid', 'partial')
              ${docTypeFilter}
        `;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND s.branch_id = ANY($${params.length})`;
        }

        return queryMany(
            `SELECT DISTINCT
                c.customer_id,
                COALESCE(NULLIF(BTRIM(c.full_name), ''), 'Customer') AS full_name
                , c.phone
                , COALESCE(c.customer_type::text, 'regular') AS customer_type
                , c.address
                , c.sex
                , c.gender
                , COALESCE(c.is_active, TRUE) AS is_active
                , COALESCE(
                    NULLIF(to_jsonb(c)->>'remaining_balance','')::numeric,
                    NULLIF(to_jsonb(c)->>'open_balance','')::numeric,
                    NULLIF(to_jsonb(c)->>'balance','')::numeric,
                    0
                  )::double precision AS balance
             FROM ims.sales s
             JOIN ims.sale_items si ON si.sale_id = s.sale_id
             JOIN ims.customers c ON c.customer_id = s.customer_id
             ${where}
               AND COALESCE(c.is_active, TRUE) = TRUE
             ORDER BY 2 ASC`,
            params
        );
    },

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
        const returnedBranchClause = scope.isAdmin ? '' : `AND sr.branch_id = ANY($${params.length})`;
        return queryMany<ReturnItemOption>(
            `WITH sold AS (
                SELECT si.item_id, COALESCE(SUM(si.quantity), 0) AS sold_qty
                  FROM ims.sales s
                  JOIN ims.sale_items si ON si.sale_id = s.sale_id
                 ${where}
                 GROUP BY si.item_id
             ),
             returned AS (
                SELECT sri.item_id, COALESCE(SUM(sri.quantity), 0) AS returned_qty
                  FROM ims.sales_returns sr
                  JOIN ims.sales_return_items sri ON sri.sr_id = sr.sr_id
                 WHERE sr.customer_id = $1
                  ${returnedBranchClause}
                 GROUP BY sri.item_id
             ),
             price AS (
                SELECT
                    si.item_id,
                    MAX(
                        COALESCE(
                          NULLIF(si.unit_price, 0),
                          CASE
                            WHEN COALESCE(si.quantity, 0) > 0
                              THEN NULLIF(si.line_total, 0) / si.quantity
                            ELSE NULL
                          END
                        )
                    ) AS unit_price
                  FROM ims.sales s
                  JOIN ims.sale_items si ON si.sale_id = s.sale_id
                 ${where}
                 GROUP BY si.item_id
             )
             SELECT
                i.item_id,
                i.name,
                i.barcode,
                COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price,
                COALESCE(price.unit_price, i.sell_price, i.cost_price, 0)::numeric(14,2) AS sell_price,
                COALESCE(sold.sold_qty, 0)::int AS sold_qty,
                COALESCE(returned.returned_qty, 0)::int AS returned_qty,
                GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0)::int AS available_qty
             FROM sold
             JOIN ims.items i ON i.item_id = sold.item_id
             LEFT JOIN returned ON returned.item_id = sold.item_id
             LEFT JOIN price ON price.item_id = sold.item_id
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
        const returnedBranchClause = scope.isAdmin ? '' : `AND pr.branch_id = ANY($${params.length})`;
        return queryMany<ReturnItemOption>(
            `WITH purchased AS (
                SELECT pi.item_id, COALESCE(SUM(pi.quantity), 0) AS purchased_qty
                  FROM ims.purchases p
                  JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
                 ${where}
                 GROUP BY pi.item_id
             ),
             returned AS (
                SELECT pri.item_id, COALESCE(SUM(pri.quantity), 0) AS returned_qty
                  FROM ims.purchase_returns pr
                  JOIN ims.purchase_return_items pri ON pri.pr_id = pr.pr_id
                 WHERE pr.supplier_id = $1
                  ${returnedBranchClause}
                 GROUP BY pri.item_id
             ),
              price AS (
                 SELECT
                     pi.item_id,
                    MAX(
                        COALESCE(
                          NULLIF(pi.unit_cost, 0),
                          CASE
                            WHEN COALESCE(pi.quantity, 0) > 0
                              THEN NULLIF(pi.line_total, 0) / pi.quantity
                            ELSE NULL
                          END
                        )
                    ) AS unit_cost
                  FROM ims.purchases p
                  JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
                 ${where}
                 GROUP BY pi.item_id
              )
              SELECT
                 i.item_id,
                 i.name,
                 i.barcode,
                 COALESCE(price.unit_cost, i.cost_price, 0)::numeric(14,2) AS cost_price,
                 COALESCE(i.sell_price, 0)::numeric(14,2) AS sell_price,
                 COALESCE(purchased.purchased_qty, 0)::int AS sold_qty,
                 COALESCE(returned.returned_qty, 0)::int AS returned_qty,
                 GREATEST(
                   COALESCE(
                     CASE
                       WHEN COALESCE(stock.cnt, 0) > 0 THEN stock.qty
                       ELSE COALESCE(
                         NULLIF(to_jsonb(i)->>'quantity','')::numeric,
                         NULLIF(to_jsonb(i)->>'opening_balance','')::numeric,
                         0
                       )
                     END,
                     0
                   ),
                   0
                 )::int AS on_hand_qty,
                 LEAST(
                   GREATEST(COALESCE(purchased.purchased_qty, 0) - COALESCE(returned.returned_qty, 0), 0),
                   GREATEST(
                     COALESCE(
                       CASE
                         WHEN COALESCE(stock.cnt, 0) > 0 THEN stock.qty
                         ELSE COALESCE(
                           NULLIF(to_jsonb(i)->>'quantity','')::numeric,
                           NULLIF(to_jsonb(i)->>'opening_balance','')::numeric,
                           0
                         )
                       END,
                       0
                     ),
                     0
                   )
                 )::int AS available_qty
              FROM purchased
              JOIN ims.items i ON i.item_id = purchased.item_id
              LEFT JOIN LATERAL (
                 SELECT
                   COALESCE(SUM(si.quantity), 0)::numeric AS qty,
                   COUNT(*)::int AS cnt
                 FROM ims.store_items si
                 JOIN ims.stores st ON st.store_id = si.store_id
                 WHERE st.branch_id = i.branch_id
                   AND si.product_id = i.item_id
              ) stock ON TRUE
              LEFT JOIN returned ON returned.item_id = purchased.item_id
              LEFT JOIN price ON price.item_id = purchased.item_id
              ORDER BY i.name`,
            params
        );
    },

    async listSalesReturns(
        scope: BranchScope,
        dateRange?: { fromDate?: string; toDate?: string }
    ): Promise<SalesReturn[]> {
        const params: any[] = [];
        const whereParts: string[] = [];
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            whereParts.push(`sr.branch_id = ANY($${params.length})`);
        }
        if (dateRange?.fromDate && dateRange?.toDate) {
            params.push(dateRange.fromDate);
            whereParts.push(`sr.return_date::date >= $${params.length}::date`);
            params.push(dateRange.toDate);
            whereParts.push(`sr.return_date::date <= $${params.length}::date`);
        }
        const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        return queryMany<SalesReturn>(
            `SELECT
          sr.*,
          ('SR-' || LPAD(sr.sr_id::text, 5, '0')) AS reference_no,
          'POSTED'::text AS status,
          sr.return_date AS created_at,
          refund.acc_id AS refund_acc_id,
          COALESCE(refund.debit, refund.credit, 0)::numeric(14,2) AS refund_amount,
          ra.name AS refund_account_name,
          b.branch_name,
          u.name AS created_by_name,
          c.full_name AS customer_name
       FROM ims.sales_returns sr
       LEFT JOIN LATERAL (
          SELECT at.acc_id, at.debit, at.credit
            FROM ims.account_transactions at
           WHERE at.branch_id = sr.branch_id
             AND at.ref_table = 'sales_returns'
             AND at.ref_id = sr.sr_id
             AND at.txn_type = 'return_refund'
           ORDER BY at.txn_id DESC
           LIMIT 1
        ) refund ON TRUE
       LEFT JOIN ims.accounts ra ON ra.acc_id = refund.acc_id
       LEFT JOIN ims.branches b ON b.branch_id = sr.branch_id
       LEFT JOIN ims.users u ON u.user_id = sr.user_id
       LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id
       ${where}
       ORDER BY sr.return_date DESC, sr.sr_id DESC
       LIMIT 500`,
            params
        );
    },

    async getSalesReturn(scope: BranchScope, returnId: number): Promise<SalesReturn | null> {
        if (!Number.isFinite(returnId) || returnId <= 0) {
            throw ApiError.badRequest('Return id is required');
        }
        const params: any[] = [returnId];
        let where = `WHERE sr.sr_id = $1`;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND sr.branch_id = ANY($${params.length})`;
        }
        return queryOne<SalesReturn>(
            `SELECT
           sr.*,
           ('SR-' || LPAD(sr.sr_id::text, 5, '0')) AS reference_no,
           'POSTED'::text AS status,
           sr.return_date AS created_at,
           refund.acc_id AS refund_acc_id,
           COALESCE(refund.debit, refund.credit, 0)::numeric(14,2) AS refund_amount,
           ra.name AS refund_account_name,
           b.branch_name,
           u.name AS created_by_name,
           c.full_name AS customer_name
        FROM ims.sales_returns sr
        LEFT JOIN LATERAL (
           SELECT at.acc_id, at.debit, at.credit
             FROM ims.account_transactions at
            WHERE at.branch_id = sr.branch_id
              AND at.ref_table = 'sales_returns'
              AND at.ref_id = sr.sr_id
              AND at.txn_type = 'return_refund'
            ORDER BY at.txn_id DESC
            LIMIT 1
         ) refund ON TRUE
        LEFT JOIN ims.accounts ra ON ra.acc_id = refund.acc_id
        LEFT JOIN ims.branches b ON b.branch_id = sr.branch_id
        LEFT JOIN ims.users u ON u.user_id = sr.user_id
        LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id
        ${where}
        LIMIT 1`,
            params
        );
    },

    async listSalesReturnItems(scope: BranchScope, returnId: number): Promise<SalesReturnItem[]> {
        if (!Number.isFinite(returnId) || returnId <= 0) {
            throw ApiError.badRequest('Return id is required');
        }
        const row = await queryOne<{ branch_id: number }>(
            `SELECT branch_id FROM ims.sales_returns WHERE sr_id = $1`,
            [returnId]
        );
        if (!row) throw ApiError.notFound('Sales return not found');
        if (!canAccessBranch(scope, Number(row.branch_id))) {
            throw ApiError.forbidden('Access denied');
        }
        return queryMany<SalesReturnItem>(
            `SELECT
                sri.sr_item_id,
                sri.sr_id,
                sri.item_id,
                i.name AS item_name,
                sri.quantity,
                sri.unit_price,
                sri.line_total
             FROM ims.sales_return_items sri
             JOIN ims.items i ON i.item_id = sri.item_id
            WHERE sri.sr_id = $1
            ORDER BY sri.sr_item_id`,
            [returnId]
        );
    },

    async createSalesReturn(
        input: CreateSalesReturnInput,
        context: { branchId: number; userId: number }
    ): Promise<SalesReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const items = normalizeReturnItems(input.items);
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
                const limit = await getSalesReturnLimit(client, {
                    branchId: context.branchId,
                    customerId: input.customerId,
                    itemId: item.itemId,
                    saleId: input.saleId ?? null,
                });
                if (Number(item.quantity) > limit.availableQty) {
                    throw ApiError.badRequest(
                        `Return qty exceeds sold qty for item #${item.itemId} (available ${limit.availableQty})`
                    );
                }
            }

            const subtotal = items.reduce(
                (s, i) => s + Number(i.quantity) * Number(i.unitPrice || 0),
                0
            );
            const total = roundMoney(subtotal);
            const currentOutstanding = await getCustomerOutstandingForUpdate(client, {
                branchId: context.branchId,
                customerId: input.customerId,
            });
            const refundAmountInput = Number(input.refundAmount || 0);
            const { balanceAdjustment, refundAmount } = requireRefundRules({
                total,
                outstanding: currentOutstanding,
                refundAmount: refundAmountInput,
                label: 'customer',
            });
            const hasBalanceColumn = await hasSalesReturnBalanceAdjustment(client);

            const returnEntryType = await pickLedgerEntryType(client, ['return', 'adjustment', 'payment']);
            const refundEntryType = await pickLedgerEntryType(client, ['refund', 'adjustment', 'payment']);

            const insertColumns = [
                'branch_id',
                'sale_id',
                'user_id',
                'customer_id',
                'return_date',
                'subtotal',
                'total',
                'note',
            ];
            const insertValues: Array<string | number | null> = [
                context.branchId,
                input.saleId ?? null,
                context.userId,
                input.customerId,
                input.returnDate || null,
                subtotal,
                total,
                input.note || null,
            ];
            if (hasBalanceColumn) {
                insertColumns.push('balance_adjustment');
                insertValues.push(balanceAdjustment);
            }
            const placeholders = insertValues
                .map((_, idx) =>
                    insertColumns[idx] === 'return_date' ? `COALESCE($${idx + 1}::timestamptz, NOW())` : `$${idx + 1}`
                )
                .join(', ');

            const returnRes = await client.query<SalesReturn>(
                `INSERT INTO ims.sales_returns (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
                insertValues
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

                await insertReturnMovement(client, {
                    branchId: context.branchId,
                    itemId: item.itemId,
                    moveType: 'sales_return',
                    refTable: 'sales_returns',
                    refId: sr.sr_id,
                    qtyIn: Number(item.quantity),
                    unitCost: 0,
                    note: 'Sales return',
                });
            }

            let refundAccId: number | null = null;
            if (refundAmount > 0) {
                refundAccId = Number(input.refundAccId || 0);
                if (!refundAccId) throw ApiError.badRequest('Refund account is required');
                await assertAccountInBranch(client, context.branchId, refundAccId);
                await applyAccountBalanceDelta(client, {
                    branchId: context.branchId,
                    accId: refundAccId,
                    delta: -refundAmount,
                });
                await client.query(
                    `INSERT INTO ims.account_transactions
                       (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
                     VALUES ($1, $2, 'return_refund', 'sales_returns', $3, $4, 0, $5)`,
                    [context.branchId, refundAccId, sr.sr_id, refundAmount, 'Customer refund']
                );
            }
            const ledgerCredit = Number(total);
            if (input.customerId && ledgerCredit > 0) {
                await client.query(
                    `INSERT INTO ims.customer_ledger
                       (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'sales_returns', $4, NULL, 0, $5, $6)`,
                    [context.branchId, input.customerId, returnEntryType, sr.sr_id, ledgerCredit, input.note || null]
                );
            }
            if (refundAmount > 0 && input.customerId) {
                await client.query(
                    `INSERT INTO ims.customer_ledger
                       (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'sales_returns', $4, $5, $6, 0, $7)`,
                    [context.branchId, input.customerId, refundEntryType, sr.sr_id, refundAccId, refundAmount, 'Customer refund']
                );
            }
            if (balanceAdjustment > 0) {
                await adjustCustomerBalance(client, {
                    branchId: context.branchId,
                    customerId: input.customerId,
                    delta: -balanceAdjustment,
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
            const hasBalanceColumn = await hasSalesReturnBalanceAdjustment(client);

            const selectColumns = hasBalanceColumn
                ? 'sr_id, branch_id, customer_id, balance_adjustment'
                : 'sr_id, branch_id, customer_id';
            const existing = await client.query<{ sr_id: number; branch_id: number; customer_id: number | null; balance_adjustment?: string }>(
                `SELECT ${selectColumns}
                   FROM ims.sales_returns
                  WHERE sr_id = $1
                  LIMIT 1`,
                [id]
            );
            const current = existing.rows[0];
            const previousBalanceAdjustment = hasBalanceColumn
                ? Number(current?.balance_adjustment || 0)
                : 0;
            if (!current) throw ApiError.notFound('Sales return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) {
                throw ApiError.forbidden('Access denied');
            }
            if (!input.customerId || Number(input.customerId) <= 0) {
                throw ApiError.badRequest('Customer is required');
            }

            const items = normalizeReturnItems(input.items);
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
                const limit = await getSalesReturnLimit(client, {
                    branchId: Number(current.branch_id),
                    customerId: input.customerId,
                    itemId: item.itemId,
                    saleId: input.saleId ?? null,
                    excludeReturnId: id,
                });
                if (Number(item.quantity) > limit.availableQty) {
                    throw ApiError.badRequest(
                        `Return qty exceeds sold qty for item #${item.itemId} (available ${limit.availableQty})`
                    );
                }
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
            const total = roundMoney(subtotal);
            const oldCustomerId = Number(current.customer_id || 0);
            if (previousBalanceAdjustment > 0 && oldCustomerId) {
                await adjustCustomerBalance(client, {
                    branchId: Number(current.branch_id),
                    customerId: oldCustomerId,
                    delta: previousBalanceAdjustment,
                });
            }

            const refundUpdateRequested =
                Object.prototype.hasOwnProperty.call(input, 'refundAccId') ||
                Object.prototype.hasOwnProperty.call(input, 'refundAmount');
            const existingRefundRes = await client.query<{ amount: string }>(
                `SELECT COALESCE(SUM(debit), 0)::text AS amount
                   FROM ims.account_transactions
                  WHERE branch_id = $1
                    AND ref_table = 'sales_returns'
                    AND ref_id = $2
                    AND txn_type = 'return_refund'`,
                [current.branch_id, id]
            );
            const previousRefundAmount = Number(existingRefundRes.rows[0]?.amount || 0);
            const refundAmountCandidate = refundUpdateRequested ? Number(input.refundAmount || 0) : previousRefundAmount;

            const newCustomerId = Number(input.customerId || 0);
            const currentOutstanding = newCustomerId
                ? await getCustomerOutstandingForUpdate(client, {
                    branchId: Number(current.branch_id),
                    customerId: newCustomerId,
                })
                : 0;
            const { balanceAdjustment: newBalanceAdjustment, refundAmount } = requireRefundRules({
                total,
                outstanding: currentOutstanding,
                refundAmount: refundAmountCandidate,
                label: 'customer',
            });

            const updateSets = [
                'sale_id = $2',
                'customer_id = $3',
                'return_date = COALESCE($4::timestamptz, return_date)',
                'subtotal = $5',
                'total = $6',
                'note = $7',
                'user_id = $8',
            ];
            const updateValues: Array<string | number | null> = [
                id,
                input.saleId ?? null,
                input.customerId,
                input.returnDate || null,
                subtotal,
                total,
                input.note || null,
                context.userId,
            ];
            if (hasBalanceColumn) {
                updateSets.push(`balance_adjustment = $${updateValues.length + 1}`);
                updateValues.push(newBalanceAdjustment);
            }

            await client.query(
                `UPDATE ims.sales_returns
                    SET ${updateSets.join(', ')}
                  WHERE sr_id = $1`,
                updateValues
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

            await client.query(
                `DELETE FROM ims.inventory_movements
                  WHERE branch_id = $1
                    AND ref_table = 'sales_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );

            for (const item of items) {
                await insertReturnMovement(client, {
                    branchId: Number(current.branch_id),
                    itemId: item.itemId,
                    moveType: 'sales_return',
                    refTable: 'sales_returns',
                    refId: id,
                    qtyIn: Number(item.quantity),
                    unitCost: 0,
                    note: 'Sales return',
                });
            }
            if (refundUpdateRequested) {
                await clearRefundTransactions(client, {
                    branchId: Number(current.branch_id),
                    refTable: 'sales_returns',
                    refId: id,
                });
                if (refundAmount > 0) {
                    const refundAccId = Number(input.refundAccId || 0);
                    if (!refundAccId) throw ApiError.badRequest('Refund account is required');
                    await assertAccountInBranch(client, Number(current.branch_id), refundAccId);
                    await applyAccountBalanceDelta(client, {
                        branchId: Number(current.branch_id),
                        accId: refundAccId,
                        delta: -refundAmount,
                    });
                    await client.query(
                        `INSERT INTO ims.account_transactions
                           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
                         VALUES ($1, $2, 'return_refund', 'sales_returns', $3, $4, 0, $5)`,
                        [current.branch_id, refundAccId, id, refundAmount, 'Customer refund']
                    );
                }
            }
            await client.query(
                `DELETE FROM ims.customer_ledger
                  WHERE branch_id = $1
                    AND ref_table = 'sales_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );
            const ledgerCredit = Number(total);
            if (input.customerId && ledgerCredit > 0) {
                const returnEntryType = await pickLedgerEntryType(client, ['return', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.customer_ledger
                       (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'sales_returns', $4, NULL, 0, $5, $6)`,
                    [current.branch_id, input.customerId, returnEntryType, id, ledgerCredit, input.note || null]
                );
            }
            if (refundAmount > 0 && input.customerId) {
                const refundAccId = refundUpdateRequested ? Number(input.refundAccId || 0) : null;
                const refundEntryType = await pickLedgerEntryType(client, ['refund', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.customer_ledger
                       (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'sales_returns', $4, $5, $6, 0, $7)`,
                    [current.branch_id, input.customerId, refundEntryType, id, refundAccId, refundAmount, 'Customer refund']
                );
            }
            if (newBalanceAdjustment > 0 && newCustomerId) {
                await adjustCustomerBalance(client, {
                    branchId: Number(current.branch_id),
                    customerId: newCustomerId,
                    delta: -newBalanceAdjustment,
                });
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
            const hasBalanceColumn = await hasSalesReturnBalanceAdjustment(client);
            const selectColumns = hasBalanceColumn
                ? 'sr_id, branch_id, customer_id, balance_adjustment'
                : 'sr_id, branch_id, customer_id';
            const existing = await client.query<{ sr_id: number; branch_id: number; customer_id: number | null; balance_adjustment?: string }>(
                `SELECT ${selectColumns} FROM ims.sales_returns WHERE sr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            const previousBalanceAdjustment = hasBalanceColumn
                ? Number(current?.balance_adjustment || 0)
                : 0;
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

            await clearRefundTransactions(client, {
                branchId: Number(current.branch_id),
                refTable: 'sales_returns',
                refId: id,
            });

            await client.query(
                `DELETE FROM ims.customer_ledger
                  WHERE branch_id = $1
                    AND ref_table = 'sales_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );
            if (previousBalanceAdjustment > 0) {
                await adjustCustomerBalance(client, {
                    branchId: Number(current.branch_id),
                    customerId: current.customer_id,
                    delta: previousBalanceAdjustment,
                });
            }

            await client.query(
                `DELETE FROM ims.inventory_movements
                  WHERE branch_id = $1
                    AND ref_table = 'sales_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );

            await client.query(`DELETE FROM ims.sales_returns WHERE sr_id = $1`, [id]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async listPurchaseReturns(
        scope: BranchScope,
        dateRange?: { fromDate?: string; toDate?: string }
    ): Promise<PurchaseReturn[]> {
        const supplierNameColumn = await getSupplierNameColumn();
        const params: any[] = [];
        const whereParts: string[] = [];
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            whereParts.push(`pr.branch_id = ANY($${params.length})`);
        }
        if (dateRange?.fromDate && dateRange?.toDate) {
            params.push(dateRange.fromDate);
            whereParts.push(`pr.return_date::date >= $${params.length}::date`);
            params.push(dateRange.toDate);
            whereParts.push(`pr.return_date::date <= $${params.length}::date`);
        }
        const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        return queryMany<PurchaseReturn>(
            `SELECT
          pr.*,
          ('PR-' || LPAD(pr.pr_id::text, 5, '0')) AS reference_no,
          'POSTED'::text AS status,
          pr.return_date AS created_at,
          refund.acc_id AS refund_acc_id,
          COALESCE(refund.credit, refund.debit, 0)::numeric(14,2) AS refund_amount,
          ra.name AS refund_account_name,
          b.branch_name,
          u.name AS created_by_name,
          s.${supplierNameColumn} AS supplier_name
       FROM ims.purchase_returns pr
       LEFT JOIN LATERAL (
          SELECT at.acc_id, at.debit, at.credit
            FROM ims.account_transactions at
           WHERE at.branch_id = pr.branch_id
             AND at.ref_table = 'purchase_returns'
             AND at.ref_id = pr.pr_id
             AND at.txn_type = 'return_refund'
           ORDER BY at.txn_id DESC
           LIMIT 1
        ) refund ON TRUE
       LEFT JOIN ims.accounts ra ON ra.acc_id = refund.acc_id
       LEFT JOIN ims.branches b ON b.branch_id = pr.branch_id
       LEFT JOIN ims.users u ON u.user_id = pr.user_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = pr.supplier_id
       ${where}
       ORDER BY pr.return_date DESC, pr.pr_id DESC
       LIMIT 500`,
            params
        );
    },

    async getPurchaseReturn(scope: BranchScope, returnId: number): Promise<PurchaseReturn | null> {
        if (!Number.isFinite(returnId) || returnId <= 0) {
            throw ApiError.badRequest('Return id is required');
        }
        const params: any[] = [returnId];
        let where = `WHERE pr.pr_id = $1`;
        if (!scope.isAdmin) {
            params.push(scope.branchIds);
            where += ` AND pr.branch_id = ANY($${params.length})`;
        }
        return queryOne<PurchaseReturn>(
            `SELECT
          pr.*,
          ('PR-' || LPAD(pr.pr_id::text, 5, '0')) AS reference_no,
          'POSTED'::text AS status,
          pr.return_date AS created_at,
          refund.acc_id AS refund_acc_id,
          COALESCE(refund.debit, refund.credit, 0)::numeric(14,2) AS refund_amount,
          ra.name AS refund_account_name,
          b.branch_name,
          u.name AS created_by_name,
          s.${await getSupplierNameColumn()} AS supplier_name
       FROM ims.purchase_returns pr
       LEFT JOIN LATERAL (
          SELECT at.acc_id, at.debit, at.credit
            FROM ims.account_transactions at
           WHERE at.branch_id = pr.branch_id
             AND at.ref_table = 'purchase_returns'
             AND at.ref_id = pr.pr_id
             AND at.txn_type = 'return_refund'
           ORDER BY at.txn_id DESC
           LIMIT 1
        ) refund ON TRUE
       LEFT JOIN ims.accounts ra ON ra.acc_id = refund.acc_id
       LEFT JOIN ims.branches b ON b.branch_id = pr.branch_id
       LEFT JOIN ims.users u ON u.user_id = pr.user_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = pr.supplier_id
       ${where}
       LIMIT 1`,
            params
        );
    },

    async listPurchaseReturnItems(scope: BranchScope, returnId: number): Promise<PurchaseReturnItem[]> {
        if (!Number.isFinite(returnId) || returnId <= 0) {
            throw ApiError.badRequest('Return id is required');
        }
        const row = await queryOne<{ branch_id: number }>(
            `SELECT branch_id FROM ims.purchase_returns WHERE pr_id = $1`,
            [returnId]
        );
        if (!row) throw ApiError.notFound('Purchase return not found');
        if (!canAccessBranch(scope, Number(row.branch_id))) {
            throw ApiError.forbidden('Access denied');
        }
        return queryMany<PurchaseReturnItem>(
            `SELECT
                pri.pr_item_id,
                pri.pr_id,
                pri.item_id,
                i.name AS item_name,
                pri.quantity,
                pri.unit_cost,
                pri.line_total
             FROM ims.purchase_return_items pri
             JOIN ims.items i ON i.item_id = pri.item_id
            WHERE pri.pr_id = $1
            ORDER BY pri.pr_item_id`,
            [returnId]
        );
    },

    async createPurchaseReturn(
        input: CreatePurchaseReturnInput,
        context: { branchId: number; userId: number }
    ): Promise<PurchaseReturn> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const items = normalizeReturnItems(input.items);
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
                const limit = await getPurchaseReturnLimit(client, {
                    branchId: context.branchId,
                    supplierId: input.supplierId,
                    itemId: item.itemId,
                    purchaseId: input.purchaseId ?? null,
                });
                if (Number(item.quantity) > limit.availableQty) {
                    throw ApiError.badRequest(
                        `Return qty exceeds purchased qty for item #${item.itemId} (available ${limit.availableQty})`
                    );
                }
            }

            const subtotal = items.reduce(
                (s, i) => s + Number(i.quantity) * Number(i.unitCost || 0),
                0
            );
            const total = roundMoney(subtotal);
            const currentOutstanding = await getSupplierOutstandingForUpdate(client, {
                branchId: context.branchId,
                supplierId: input.supplierId,
            });
            const refundAmountInput = Number(input.refundAmount || 0);
            const { balanceAdjustment, refundAmount } = requireRefundRules({
                total,
                outstanding: currentOutstanding,
                refundAmount: refundAmountInput,
                label: 'supplier',
            });
            const hasBalanceColumn = await hasPurchaseReturnBalanceAdjustment(client);

            const insertColumns = [
                'branch_id',
                'purchase_id',
                'user_id',
                'supplier_id',
                'return_date',
                'subtotal',
                'total',
                'note',
            ];
            const insertValues: Array<string | number | null> = [
                context.branchId,
                input.purchaseId ?? null,
                context.userId,
                input.supplierId,
                input.returnDate || null,
                subtotal,
                total,
                input.note || null,
            ];
            if (hasBalanceColumn) {
                insertColumns.push('balance_adjustment');
                insertValues.push(balanceAdjustment);
            }
            const placeholders = insertValues
                .map((_, idx) =>
                    insertColumns[idx] === 'return_date' ? `COALESCE($${idx + 1}::timestamptz, NOW())` : `$${idx + 1}`
                )
                .join(', ');

            const returnRes = await client.query<PurchaseReturn>(
                `INSERT INTO ims.purchase_returns (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
                insertValues
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

                await insertReturnMovement(client, {
                    branchId: context.branchId,
                    itemId: item.itemId,
                    moveType: 'purchase_return',
                    refTable: 'purchase_returns',
                    refId: pr.pr_id,
                    qtyOut: Number(item.quantity),
                    unitCost,
                    note: 'Purchase return',
                });
            }

            let refundAccId: number | null = null;
            if (refundAmount > 0) {
                refundAccId = Number(input.refundAccId || 0);
                if (!refundAccId) throw ApiError.badRequest('Refund account is required');
                await assertAccountInBranch(client, context.branchId, refundAccId);
                await applyAccountBalanceDelta(client, {
                    branchId: context.branchId,
                    accId: refundAccId,
                    delta: refundAmount,
                });
                await client.query(
                    `INSERT INTO ims.account_transactions
                       (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
                     VALUES ($1, $2, 'return_refund', 'purchase_returns', $3, 0, $4, $5)`,
                    [context.branchId, refundAccId, pr.pr_id, refundAmount, 'Supplier refund']
                );
            }
            const ledgerDebit = Number(total);
            if (ledgerDebit > 0) {
                const returnEntryType = await pickLedgerEntryType(client, ['return', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.supplier_ledger
                       (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'purchase_returns', $4, NULL, $5, 0, $6)`,
                    [context.branchId, input.supplierId, returnEntryType, pr.pr_id, ledgerDebit, input.note || null]
                );
            }
            if (refundAmount > 0) {
                const refundEntryType = await pickLedgerEntryType(client, ['refund', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.supplier_ledger
                       (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'purchase_returns', $4, $5, 0, $6, $7)`,
                    [context.branchId, input.supplierId, refundEntryType, pr.pr_id, refundAccId, refundAmount, 'Supplier refund']
                );
            }
            if (balanceAdjustment > 0) {
                await adjustSupplierBalance(client, {
                    branchId: context.branchId,
                    supplierId: input.supplierId,
                    delta: -balanceAdjustment,
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
            const hasBalanceColumn = await hasPurchaseReturnBalanceAdjustment(client);
            const selectColumns = hasBalanceColumn
                ? 'pr_id, branch_id, supplier_id, balance_adjustment'
                : 'pr_id, branch_id, supplier_id';
            const existing = await client.query<{ pr_id: number; branch_id: number; supplier_id: number | null; balance_adjustment?: string }>(
                `SELECT ${selectColumns} FROM ims.purchase_returns WHERE pr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            const previousBalanceAdjustment = hasBalanceColumn
                ? Number(current?.balance_adjustment || 0)
                : 0;
            if (!current) throw ApiError.notFound('Purchase return not found');
            if (!canAccessBranch(scope, Number(current.branch_id))) throw ApiError.forbidden('Access denied');
            if (!input.supplierId || Number(input.supplierId) <= 0) throw ApiError.badRequest('Supplier is required');

            const items = normalizeReturnItems(input.items);
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
                const limit = await getPurchaseReturnLimit(client, {
                    branchId: Number(current.branch_id),
                    supplierId: input.supplierId,
                    itemId: item.itemId,
                    purchaseId: input.purchaseId ?? null,
                    excludeReturnId: id,
                });
                if (Number(item.quantity) > limit.availableQty) {
                    throw ApiError.badRequest(
                        `Return qty exceeds purchased qty for item #${item.itemId} (available ${limit.availableQty})`
                    );
                }
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
            const total = roundMoney(subtotal);
            const oldSupplierId = Number(current.supplier_id || 0);
            if (previousBalanceAdjustment > 0 && oldSupplierId) {
                await adjustSupplierBalance(client, {
                    branchId: Number(current.branch_id),
                    supplierId: oldSupplierId,
                    delta: previousBalanceAdjustment,
                });
            }

            const refundUpdateRequested =
                Object.prototype.hasOwnProperty.call(input, 'refundAccId') ||
                Object.prototype.hasOwnProperty.call(input, 'refundAmount');
            const existingRefundRes = await client.query<{ amount: string }>(
                `SELECT COALESCE(SUM(credit), 0)::text AS amount
                   FROM ims.account_transactions
                  WHERE branch_id = $1
                    AND ref_table = 'purchase_returns'
                    AND ref_id = $2
                    AND txn_type = 'return_refund'`,
                [current.branch_id, id]
            );
            const previousRefundAmount = Number(existingRefundRes.rows[0]?.amount || 0);
            const refundAmountCandidate = refundUpdateRequested ? Number(input.refundAmount || 0) : previousRefundAmount;

            const newSupplierId = Number(input.supplierId || 0);
            const currentOutstanding = newSupplierId
                ? await getSupplierOutstandingForUpdate(client, {
                    branchId: Number(current.branch_id),
                    supplierId: newSupplierId,
                })
                : 0;
            const { balanceAdjustment: newBalanceAdjustment, refundAmount } = requireRefundRules({
                total,
                outstanding: currentOutstanding,
                refundAmount: refundAmountCandidate,
                label: 'supplier',
            });

            const updateSets = [
                'purchase_id = $2',
                'supplier_id = $3',
                'return_date = COALESCE($4::timestamptz, return_date)',
                'subtotal = $5',
                'total = $6',
                'note = $7',
                'user_id = $8',
            ];
            const updateValues: Array<string | number | null> = [
                id,
                input.purchaseId ?? null,
                input.supplierId,
                input.returnDate || null,
                subtotal,
                total,
                input.note || null,
                context.userId,
            ];
            if (hasBalanceColumn) {
                updateSets.push(`balance_adjustment = $${updateValues.length + 1}`);
                updateValues.push(newBalanceAdjustment);
            }

            await client.query(
                `UPDATE ims.purchase_returns
                    SET ${updateSets.join(', ')}
                  WHERE pr_id = $1`,
                updateValues
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

            await client.query(
                `DELETE FROM ims.inventory_movements
                  WHERE branch_id = $1
                    AND ref_table = 'purchase_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );

            for (const item of items) {
                await insertReturnMovement(client, {
                    branchId: Number(current.branch_id),
                    itemId: item.itemId,
                    moveType: 'purchase_return',
                    refTable: 'purchase_returns',
                    refId: id,
                    qtyOut: Number(item.quantity),
                    unitCost: Number(item.unitCost || 0),
                    note: 'Purchase return',
                });
            }
            if (refundUpdateRequested) {
                await clearRefundTransactions(client, {
                    branchId: Number(current.branch_id),
                    refTable: 'purchase_returns',
                    refId: id,
                });
                if (refundAmount > 0) {
                    const refundAccId = Number(input.refundAccId || 0);
                    if (!refundAccId) throw ApiError.badRequest('Refund account is required');
                    await assertAccountInBranch(client, Number(current.branch_id), refundAccId);
                    await applyAccountBalanceDelta(client, {
                        branchId: Number(current.branch_id),
                        accId: refundAccId,
                        delta: refundAmount,
                    });
                    await client.query(
                        `INSERT INTO ims.account_transactions
                           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
                         VALUES ($1, $2, 'return_refund', 'purchase_returns', $3, 0, $4, $5)`,
                        [current.branch_id, refundAccId, id, refundAmount, 'Supplier refund']
                    );
                }
            }
            await client.query(
                `DELETE FROM ims.supplier_ledger
                  WHERE branch_id = $1
                    AND ref_table = 'purchase_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );
            const ledgerDebit = Number(total);
            if (ledgerDebit > 0) {
                const returnEntryType = await pickLedgerEntryType(client, ['return', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.supplier_ledger
                       (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'purchase_returns', $4, NULL, $5, 0, $6)`,
                    [current.branch_id, input.supplierId, returnEntryType, id, ledgerDebit, input.note || null]
                );
            }
            if (refundAmount > 0) {
                const refundAccId = refundUpdateRequested ? Number(input.refundAccId || 0) : null;
                const refundEntryType = await pickLedgerEntryType(client, ['refund', 'adjustment', 'payment']);
                await client.query(
                    `INSERT INTO ims.supplier_ledger
                       (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
                     VALUES ($1, $2, $3, 'purchase_returns', $4, $5, 0, $6, $7)`,
                    [current.branch_id, input.supplierId, refundEntryType, id, refundAccId, refundAmount, 'Supplier refund']
                );
            }
            if (newBalanceAdjustment > 0 && newSupplierId) {
                await adjustSupplierBalance(client, {
                    branchId: Number(current.branch_id),
                    supplierId: newSupplierId,
                    delta: -newBalanceAdjustment,
                });
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
            const hasBalanceColumn = await hasPurchaseReturnBalanceAdjustment(client);
            const selectColumns = hasBalanceColumn
                ? 'pr_id, branch_id, supplier_id, balance_adjustment'
                : 'pr_id, branch_id, supplier_id';
            const existing = await client.query<{ pr_id: number; branch_id: number; supplier_id: number | null; balance_adjustment?: string }>(
                `SELECT ${selectColumns} FROM ims.purchase_returns WHERE pr_id = $1`,
                [id]
            );
            const current = existing.rows[0];
            const previousBalanceAdjustment = hasBalanceColumn
                ? Number(current?.balance_adjustment || 0)
                : 0;
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

            await clearRefundTransactions(client, {
                branchId: Number(current.branch_id),
                refTable: 'purchase_returns',
                refId: id,
            });

            await client.query(
                `DELETE FROM ims.supplier_ledger
                  WHERE branch_id = $1
                    AND ref_table = 'purchase_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );
            if (previousBalanceAdjustment > 0) {
                await adjustSupplierBalance(client, {
                    branchId: Number(current.branch_id),
                    supplierId: current.supplier_id,
                    delta: previousBalanceAdjustment,
                });
            }

            await client.query(
                `DELETE FROM ims.inventory_movements
                  WHERE branch_id = $1
                    AND ref_table = 'purchase_returns'
                    AND ref_id = $2`,
                [current.branch_id, id]
            );

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
