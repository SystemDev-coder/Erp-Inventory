import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { syncLowStockNotifications } from '../../utils/stockAlerts';
import {
  QuotationConvertInput,
  SaleInput,
  SaleItemInput,
  SaleUpdateInput,
} from './sales.schemas';

type SaleDocType = 'sale' | 'invoice' | 'quotation';
type SaleStatus = 'paid' | 'partial' | 'unpaid' | 'void';

export interface Sale {
  sale_id: number;
  branch_id: number;
  wh_id: number | null;
  user_id: number;
  customer_id: number | null;
  customer_name?: string | null;
  tax_id: number | null;
  total_before_tax: number;
  tax_amount: number;
  sale_date: string;
  sale_type: 'cash' | 'credit';
  doc_type: SaleDocType;
  quote_valid_until: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  note: string | null;
  pay_acc_id: number | null;
  paid_amount: number;
  is_stock_applied: boolean;
  voided_at: string | null;
  void_reason: string | null;
}

export interface SaleItem {
  sale_item_id: number;
  sale_id: number;
  item_id: number;
  item_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface SalesListFilters {
  search?: string;
  status?: string;
  branchId?: number;
  docType?: string;
  includeVoided?: boolean;
}

interface UpdateSaleContext {
  userId?: number | null;
}

let salesColumnsCache: Set<string> | null = null;
let hasApplyStockMoveFnCache: boolean | null = null;
let customerBalanceColumnCache: 'open_balance' | 'remaining_balance' | null = null;

const getSalesColumns = async (client: PoolClient): Promise<Set<string>> => {
  if (salesColumnsCache) return salesColumnsCache;
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'sales'`
  );
  salesColumnsCache = new Set(result.rows.map((row) => row.column_name));
  return salesColumnsCache;
};

const canApplyStock = (docType: SaleDocType, status: SaleStatus) =>
  docType !== 'quotation' && status !== 'void';

const hasSaleTrigger = async (client: PoolClient): Promise<boolean> => {
  const result = await client.query<{ has_trigger: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'ims'
          AND c.relname = 'sale_items'
          AND t.tgname = 'trg_sale_items_stock'
          AND NOT t.tgisinternal
     ) AS has_trigger`
  );
  return Boolean(result.rows[0]?.has_trigger);
};

const ensureWarehouse = async (client: PoolClient, branchId: number, whId?: number | null) => {
  if (!whId) return;
  const warehouse = await client.query(
    `SELECT wh_id
       FROM ims.warehouses
      WHERE wh_id = $1
        AND branch_id = $2
        AND is_active = TRUE`,
    [whId, branchId]
  );
  if (!warehouse.rows[0]) {
    throw ApiError.badRequest('Warehouse does not belong to this branch');
  }
};

const ensureAccount = async (client: PoolClient, branchId: number, accId?: number | null) => {
  if (!accId) return;
  const account = await client.query(
    `SELECT acc_id
       FROM ims.accounts
      WHERE acc_id = $1
        AND branch_id = $2
        AND is_active = TRUE`,
    [accId, branchId]
  );
  if (!account.rows[0]) {
    throw ApiError.badRequest('Selected account is not available in this branch');
  }
};

const listSaleItemsTx = async (client: PoolClient, saleId: number): Promise<SaleItem[]> => {
  const result = await client.query<SaleItem>(
    `SELECT *
       FROM ims.sale_items
      WHERE sale_id = $1
      ORDER BY sale_item_id`,
    [saleId]
  );
  return result.rows;
};

const normalizeTotals = (items: SaleItemInput[], discountInput?: number, totalInput?: number) => {
  const subtotal = items.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0
  );
  const discount = Number(discountInput || 0);
  const total = totalInput !== undefined ? Number(totalInput) : subtotal - discount;
  if (subtotal < 0 || discount < 0 || total < 0) {
    throw ApiError.badRequest('Amounts cannot be negative');
  }
  return { subtotal, discount, total };
};

const resolveTaxRate = async (
  client: PoolClient,
  branchId: number,
  taxId?: number | null,
  taxRate?: number
) => {
  if (taxRate !== undefined && taxRate !== null) return { tax_id: null, rate_percent: taxRate };
  if (taxId) {
    const row = await queryOne<{ tax_id: number; rate_percent: number }>(
      `SELECT tax_id, rate_percent FROM ims.taxes WHERE tax_id = $1 AND branch_id = $2 AND is_active = TRUE LIMIT 1`,
      [taxId, branchId]
    );
    if (row) return row;
  }
  return { tax_id: null, rate_percent: 0 };
};

const normalizePayment = (input: {
  total: number;
  docType: SaleDocType;
  status: SaleStatus;
  payAccId?: number | null;
  paidAmount?: number;
}) => {
  if (input.docType === 'quotation' || input.status === 'void') {
    return { payAccId: null, paidAmount: 0 };
  }

  let paidAmount = Number(input.paidAmount ?? 0);
  if (input.status === 'paid') {
    paidAmount = paidAmount > 0 ? paidAmount : input.total;
  } else if (input.status === 'unpaid') {
    paidAmount = 0;
  }

  paidAmount = Math.min(Math.max(paidAmount, 0), input.total);
  if (input.status === 'partial' && paidAmount <= 0) {
    throw ApiError.badRequest('Paid amount is required for partial sales');
  }
  if (paidAmount > 0 && !input.payAccId) {
    throw ApiError.badRequest('Select account for paid amount');
  }

  return {
    payAccId: input.payAccId ?? null,
    paidAmount,
  };
};

type PreparedSaleItem = SaleItemInput & { unitPrice: number; itemId: number; quantity: number };

const prepareSaleItems = async (
  client: PoolClient,
  branchId: number,
  items: SaleItemInput[]
): Promise<PreparedSaleItem[]> => {
  const prepared: PreparedSaleItem[] = [];
  for (const item of items) {
    const itemId = Number(item.itemId);
    const quantity = Number(item.quantity);
    if (!itemId || Number.isNaN(itemId)) throw ApiError.badRequest('Item is required for each line');
    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      throw ApiError.badRequest('Quantity must be greater than zero');
    }

    const prod = await queryOne<{ sell_price: number }>(
      `SELECT sell_price FROM ims.items WHERE item_id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [itemId, branchId]
    );
    if (!prod) throw ApiError.badRequest(`Item ${itemId} not found in selected branch`);

    const unitPrice = item.unitPrice !== undefined && item.unitPrice > 0 ? Number(item.unitPrice) : Number(prod.sell_price || 0);
    if (unitPrice <= 0) throw ApiError.badRequest('Unit price must be greater than zero (uses item sell price by default)');

    prepared.push({ ...item, itemId, quantity, unitPrice });
  }
  return prepared;
};

const hasApplyStockMoveFn = async (client: PoolClient): Promise<boolean> => {
  if (hasApplyStockMoveFnCache !== null) return hasApplyStockMoveFnCache;
  const result = await client.query<{ has_fn: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'ims'
          AND p.proname = 'fn_apply_stock_move'
     ) AS has_fn`
  );
  hasApplyStockMoveFnCache = Boolean(result.rows[0]?.has_fn);
  return hasApplyStockMoveFnCache;
};

const getCustomerBalanceColumn = async (
  client: PoolClient
): Promise<'open_balance' | 'remaining_balance'> => {
  if (customerBalanceColumnCache) return customerBalanceColumnCache;
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'
        AND column_name IN ('open_balance', 'remaining_balance')`
  );
  const names = new Set(result.rows.map((row) => row.column_name));
  customerBalanceColumnCache = names.has('open_balance') ? 'open_balance' : 'remaining_balance';
  return customerBalanceColumnCache;
};

const adjustCustomerBalance = async (
  client: PoolClient,
  params: { customerId?: number | null; branchId: number; delta: number }
) => {
  const customerId = params.customerId ? Number(params.customerId) : null;
  const delta = Number(params.delta || 0);
  if (!customerId || !delta) return;
  const balanceColumn = await getCustomerBalanceColumn(client);
  const result = await client.query(
    `UPDATE ims.customers
        SET ${balanceColumn} = GREATEST(COALESCE(${balanceColumn}, 0) + $1, 0)
      WHERE customer_id = $2
        AND branch_id = $3`,
    [delta, customerId, params.branchId]
  );
  if ((result.rowCount ?? 0) === 0) {
    throw ApiError.badRequest('Selected customer is not available in this branch');
  }
};

const calculateOutstandingBalance = (params: {
  docType?: string | null;
  status?: string | null;
  total?: number | null;
  paidAmount?: number | null;
}) => {
  const docType = String(params.docType || 'sale');
  const status = String(params.status || 'paid');
  if (docType === 'quotation' || status === 'void') return 0;
  return Math.max(Number(params.total || 0) - Number(params.paidAmount || 0), 0);
};

const insertSaleItems = async (
  client: PoolClient,
  branchId: number,
  saleId: number,
  items: PreparedSaleItem[]
) => {
  const saleItemsColumnsResult = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'sale_items'`
  );
  const saleItemsColumns = new Set(saleItemsColumnsResult.rows.map((row) => row.column_name));

  for (const item of items) {
    const columns: string[] = ['sale_id', 'item_id', 'quantity', 'unit_price', 'line_total'];
    const values: unknown[] = [
      saleId,
      item.itemId,
      item.quantity,
      item.unitPrice,
      item.quantity * item.unitPrice,
    ];
    if (saleItemsColumns.has('branch_id')) {
      columns.unshift('branch_id');
      values.unshift(branchId);
    }
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
    await client.query(
      `INSERT INTO ims.sale_items (${columns.join(', ')})
       VALUES (${placeholders})`,
      values
    );
  }
};

const applyStockByFunction = async (
  client: PoolClient,
  params: {
    branchId: number;
    whId?: number | null;
    saleId: number;
    items: Array<{ item_id: number; quantity: number }>;
    movementType: 'sale' | 'sales_return';
    direction: 'out' | 'in';
  }
): Promise<boolean> => {
  const hasApplyStockFn = await hasApplyStockMoveFn(client);
  let fallbackWhId = params.whId ?? null;
  if (!hasApplyStockFn && !fallbackWhId) {
    const defaultWarehouse = await client.query<{ wh_id: number }>(
      `SELECT wh_id
         FROM ims.warehouses
        WHERE branch_id = $1
          AND is_active = TRUE
        ORDER BY wh_id
        LIMIT 1`,
      [params.branchId]
    );
    fallbackWhId = defaultWarehouse.rows[0]?.wh_id ?? null;
  }
  if (!hasApplyStockFn && !fallbackWhId) {
    return false;
  }
  for (const item of params.items) {
    const quantity = Number(item.quantity || 0);
    if (!quantity) continue;

    const product = await client.query<{ cost_price: string }>(
      `SELECT COALESCE(cost_price, 0)::text AS cost_price
         FROM ims.items
        WHERE item_id = $1`,
      [item.item_id]
    );
    const costPrice = Number(product.rows[0]?.cost_price || 0);
    if (hasApplyStockFn) {
      const delta = params.direction === 'out' ? -quantity : quantity;
      await client.query(
        `SELECT ims.fn_apply_stock_move(
           $1,
           $2,
           $3,
           $4,
           $5::ims.movement_type_enum,
           'sales',
           $6,
           $7,
           $8
         )`,
        [
          params.branchId,
          params.whId ?? null,
          item.item_id,
          delta,
          params.movementType,
          params.saleId,
          costPrice,
          params.direction === 'out',
        ]
      );
      continue;
    }

    if (params.direction === 'out') {
      await client.query(`SELECT ims.fn_stock_sub($1, $2, $3, $4)`, [
        params.branchId,
        fallbackWhId,
        item.item_id,
        quantity,
      ]);
    } else {
      await client.query(`SELECT ims.fn_stock_add($1, $2, $3, $4)`, [
        params.branchId,
        fallbackWhId,
        item.item_id,
        quantity,
      ]);
    }

    await client.query(
      `INSERT INTO ims.inventory_movements
         (branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
       VALUES ($1, $2, $3, $4::ims.movement_type_enum, 'sales', $5, $6, $7, $8, $9)`,
      [
        params.branchId,
        fallbackWhId,
        item.item_id,
        params.movementType,
        params.saleId,
        params.direction === 'in' ? quantity : 0,
        params.direction === 'out' ? quantity : 0,
        costPrice,
        params.direction === 'out' ? 'Sale issue' : 'Sale reversal',
      ]
    );
  }
  return true;
};

const adjustAccountBalance = async (
  client: PoolClient,
  params: { accId: number; branchId: number; amount: number; mode: 'add' | 'subtract' }
) => {
  if (!params.amount) return;
  const signedAmount = params.mode === 'add' ? params.amount : -params.amount;
  const result = await client.query(
    `UPDATE ims.accounts
        SET balance = balance + $1
      WHERE acc_id = $2
        AND branch_id = $3`,
    [signedAmount, params.accId, params.branchId]
  );
  if ((result.rowCount ?? 0) === 0) {
    throw ApiError.badRequest('Payment account is not allowed for this branch');
  }
};

const getSaleForUpdate = async (
  client: PoolClient,
  saleId: number,
  scope: BranchScope
): Promise<Sale | null> => {
  if (scope.isAdmin) {
    const result = await client.query<Sale>(
      `SELECT s.*
         FROM ims.sales s
        WHERE s.sale_id = $1
        FOR UPDATE`,
      [saleId]
    );
    return result.rows[0] || null;
  }

  const result = await client.query<Sale>(
    `SELECT s.*
       FROM ims.sales s
      WHERE s.sale_id = $1
        AND s.branch_id = ANY($2)
      FOR UPDATE`,
    [saleId, scope.branchIds]
  );
  return result.rows[0] || null;
};

const mapCurrentItemToInput = (item: SaleItem): SaleItemInput => ({
  itemId: Number(item.item_id),
  quantity: Number(item.quantity),
  unitPrice: Number(item.unit_price),
});

const listScopeCondition = (scope: BranchScope, branchId?: number) => {
  const params: any[] = [];
  const clauses: string[] = [];
  if (branchId) {
    params.push(branchId);
    clauses.push(`s.branch_id = $${params.length}`);
  } else if (!scope.isAdmin) {
    params.push(scope.branchIds);
    clauses.push(`s.branch_id = ANY($${params.length})`);
  }
  return { params, clauses };
};

export const salesService = {
  async listSales(scope: BranchScope, filters: SalesListFilters): Promise<Sale[]> {
    const { search, status, branchId, docType, includeVoided } = filters;
    const scoped = listScopeCondition(scope, branchId);
    const params = scoped.params;
    const clauses = scoped.clauses;

    if (search) {
      params.push(`%${search}%`);
      clauses.push(
        `(COALESCE(c.full_name,'') ILIKE $${params.length} OR COALESCE(s.note,'') ILIKE $${params.length})`
      );
    }
    if (docType && docType !== 'all') {
      params.push(docType);
      clauses.push(`COALESCE(s.doc_type, 'sale') = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`s.status = $${params.length}`);
    } else if (!includeVoided) {
      clauses.push(`s.status <> 'void'`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<Sale>(
      `SELECT s.*, c.full_name AS customer_name
         FROM ims.sales s
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
         ${where}
        ORDER BY s.sale_date DESC, s.sale_id DESC`,
      params
    );
  },

  async getSale(id: number, scope: BranchScope): Promise<Sale | null> {
    if (scope.isAdmin) {
      return queryOne<Sale>(
        `SELECT s.*, c.full_name AS customer_name
           FROM ims.sales s
           LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
          WHERE s.sale_id = $1`,
        [id]
      );
    }

    return queryOne<Sale>(
      `SELECT s.*, c.full_name AS customer_name
         FROM ims.sales s
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
        WHERE s.sale_id = $1
          AND s.branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },

  async listItems(saleId: number): Promise<SaleItem[]> {
    return queryMany<SaleItem>(
      `SELECT si.*, p.name AS item_name
         FROM ims.sale_items si
         JOIN ims.items p ON p.item_id = si.item_id
        WHERE si.sale_id = $1
        ORDER BY si.sale_item_id`,
      [saleId]
    );
  },

  async createSale(input: SaleInput, context: { branchId: number; userId: number }): Promise<Sale> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const items = input.items || [];
      if (!items.length) {
        throw ApiError.badRequest('At least one item is required');
      }

      const preparedItems = await prepareSaleItems(client, context.branchId, items);
      const totals = normalizeTotals(preparedItems, input.discount, input.total);
      const tax = await resolveTaxRate(client, context.branchId, input.taxId ?? null, input.taxRate);
      const taxableBase = totals.subtotal - totals.discount;
      const taxAmount = (taxableBase * Number(tax?.rate_percent || 0)) / 100;
      const totalWithTax = totals.total !== undefined ? totals.total : taxableBase + taxAmount;

      const docType: SaleDocType = input.docType || 'sale';
      const status: SaleStatus = input.status || (docType === 'quotation' ? 'unpaid' : 'paid');
      const shouldApplyStock = canApplyStock(docType, status);
      const saleType: 'cash' | 'credit' =
        docType === 'quotation'
          ? 'credit'
          : input.saleType || (status === 'unpaid' ? 'credit' : 'cash');
      const payment = normalizePayment({
        total: totals.total,
        docType,
        status,
        payAccId: input.payFromAccId,
        paidAmount: input.paidAmount,
      });

      await ensureWarehouse(client, context.branchId, input.whId);
      await ensureAccount(client, context.branchId, payment.payAccId);
      const salesColumns = await getSalesColumns(client);

      const insertColumns: string[] = ['branch_id', 'wh_id', 'user_id', 'customer_id'];
      const insertValues: unknown[] = [
        context.branchId,
        input.whId ?? null,
        context.userId,
        input.customerId ?? null,
      ];
      const pushInsert = (column: string, value: unknown) => {
        if (!salesColumns.has(column)) return;
        insertColumns.push(column);
        insertValues.push(value);
      };

      pushInsert('tax_id', tax?.tax_id ?? null);
      pushInsert('total_before_tax', totals.subtotal);
      pushInsert('tax_amount', taxAmount);
      if (salesColumns.has('sale_date') && input.saleDate) {
        insertColumns.push('sale_date');
        insertValues.push(input.saleDate);
      }
      pushInsert('sale_type', saleType);
      pushInsert('doc_type', docType);
      pushInsert('quote_valid_until', input.quoteValidUntil || null);
      pushInsert('subtotal', totals.subtotal);
      pushInsert('discount', totals.discount);
      pushInsert('total', totalWithTax);
      pushInsert('status', status);
      pushInsert('note', input.note || null);
      pushInsert('pay_acc_id', payment.payAccId);
      pushInsert('paid_amount', payment.paidAmount);
      pushInsert('is_stock_applied', shouldApplyStock);

      const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');

      const saleResult = await client.query<Sale>(
        `INSERT INTO ims.sales (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
        insertValues
      );

      const sale = saleResult.rows[0];
      const affectedItemIds = Array.from(new Set(items.map((line) => Number(line.itemId))));
      const triggerEnabled = await hasSaleTrigger(client);
      let stockApplied = shouldApplyStock;

      await insertSaleItems(client, context.branchId, sale.sale_id, preparedItems);
      if (!triggerEnabled && shouldApplyStock) {
        stockApplied = await applyStockByFunction(client, {
          branchId: context.branchId,
          whId: input.whId ?? null,
          saleId: sale.sale_id,
          items: items.map((line) => ({
            item_id: Number(line.itemId),
            quantity: Number(line.quantity),
          })),
          movementType: 'sale',
          direction: 'out',
        });
      }

      if (salesColumns.has('is_stock_applied') && stockApplied !== shouldApplyStock) {
        await client.query(`UPDATE ims.sales SET is_stock_applied = $1 WHERE sale_id = $2`, [
          stockApplied,
          sale.sale_id,
        ]);
        sale.is_stock_applied = stockApplied;
      }

      if (payment.payAccId && payment.paidAmount > 0) {
        await adjustAccountBalance(client, {
          accId: payment.payAccId,
          branchId: context.branchId,
          amount: payment.paidAmount,
          mode: 'add',
        });
      }

      const customerOutstanding = calculateOutstandingBalance({
        docType,
        status,
        total: totalWithTax,
        paidAmount: payment.paidAmount,
      });
      await adjustCustomerBalance(client, {
        customerId: input.customerId ?? null,
        branchId: context.branchId,
        delta: customerOutstanding,
      });

      await syncLowStockNotifications(client, {
        branchId: context.branchId,
        productIds: affectedItemIds,
        actorUserId: context.userId,
      });

      await client.query('COMMIT');
      return sale;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateSale(
    id: number,
    input: SaleUpdateInput,
    scope: BranchScope,
    ctx?: UpdateSaleContext
  ): Promise<Sale | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      const currentItems = await listSaleItemsTx(client, id);
      const rawItems = input.items ? input.items : currentItems.map(mapCurrentItemToInput);
      const preparedItems = await prepareSaleItems(client, current.branch_id, rawItems);

      if (!preparedItems.length) {
        throw ApiError.badRequest('At least one item is required');
      }

      const nextDocType = (input.docType || current.doc_type || 'sale') as SaleDocType;
      const nextStatus = (input.status || current.status || 'paid') as SaleStatus;
      const nextSaleType =
        (input.saleType ||
          current.sale_type ||
          (nextStatus === 'unpaid' ? 'credit' : 'cash')) as 'cash' | 'credit';
      const nextQuoteValidUntil =
        input.quoteValidUntil === undefined ? current.quote_valid_until : input.quoteValidUntil;
      const nextWhId = input.whId === undefined ? current.wh_id : input.whId;
      const nextCustomerId =
        input.customerId === undefined ? current.customer_id : input.customerId ?? null;
      const totals = normalizeTotals(preparedItems, input.discount ?? current.discount, input.total);
      const tax = await resolveTaxRate(
        client,
        current.branch_id,
        input.taxId ?? current.tax_id ?? null,
        input.taxRate
      );
      const taxableBase = totals.subtotal - (input.discount ?? current.discount ?? 0);
      const taxAmount = (taxableBase * Number(tax?.rate_percent || 0)) / 100;
      const totalWithTax =
        input.total !== undefined ? Number(input.total) : taxableBase + taxAmount;
      const nextApplyStock = canApplyStock(nextDocType, nextStatus);
      const previousApplyStock =
        current.is_stock_applied ?? canApplyStock(current.doc_type || 'sale', current.status);
      const payment = normalizePayment({
        total: totals.total,
        docType: nextDocType,
        status: nextStatus,
        payAccId:
          input.payFromAccId === undefined ? current.pay_acc_id : input.payFromAccId,
        paidAmount:
          input.paidAmount === undefined ? Number(current.paid_amount || 0) : input.paidAmount,
      });

      await ensureWarehouse(client, current.branch_id, nextWhId);
      await ensureAccount(client, current.branch_id, payment.payAccId);

      const hadPreviousPayment =
        Number(current.paid_amount || 0) > 0 &&
        Number(current.pay_acc_id || 0) > 0 &&
        current.status !== 'void' &&
        current.doc_type !== 'quotation';
      if (hadPreviousPayment) {
        await adjustAccountBalance(client, {
          accId: Number(current.pay_acc_id),
          branchId: current.branch_id,
          amount: Number(current.paid_amount),
          mode: 'subtract',
        });
      }

      const triggerEnabled = await hasSaleTrigger(client);
      const needsItemReset = Boolean(input.items) || previousApplyStock !== nextApplyStock;
      let nextStockApplied = nextApplyStock;
      const affectedItemIds = new Set<number>(
        currentItems.map((line) => Number(line.item_id))
      );

      if (needsItemReset) {
        if (!triggerEnabled && previousApplyStock) {
          await applyStockByFunction(client, {
            branchId: current.branch_id,
            whId: current.wh_id,
            saleId: current.sale_id,
            items: currentItems.map((line) => ({
              item_id: Number(line.item_id),
              quantity: Number(line.quantity),
            })),
            movementType: 'sales_return',
            direction: 'in',
          });
        }

        await client.query(`DELETE FROM ims.sale_items WHERE sale_id = $1`, [id]);
        await insertSaleItems(client, current.branch_id, id, preparedItems);

        if (!triggerEnabled && nextApplyStock) {
          nextStockApplied = await applyStockByFunction(client, {
            branchId: current.branch_id,
            whId: nextWhId,
            saleId: current.sale_id,
            items: preparedItems.map((line) => ({
              item_id: Number(line.itemId),
              quantity: Number(line.quantity),
            })),
            movementType: 'sale',
            direction: 'out',
          });
        }
      }

      preparedItems.forEach((line) => affectedItemIds.add(Number(line.itemId)));

      if (payment.payAccId && payment.paidAmount > 0) {
        await adjustAccountBalance(client, {
          accId: payment.payAccId,
          branchId: current.branch_id,
          amount: payment.paidAmount,
          mode: 'add',
        });
      }

      const previousOutstanding = calculateOutstandingBalance({
        docType: current.doc_type,
        status: current.status,
        total: Number(current.total || 0),
        paidAmount: Number(current.paid_amount || 0),
      });
      const nextOutstanding = calculateOutstandingBalance({
        docType: nextDocType,
        status: nextStatus,
        total: totalWithTax,
        paidAmount: payment.paidAmount,
      });
      const previousCustomerId = current.customer_id ? Number(current.customer_id) : null;
      const normalizedNextCustomerId = nextCustomerId ? Number(nextCustomerId) : null;
      if (previousCustomerId === normalizedNextCustomerId) {
        await adjustCustomerBalance(client, {
          customerId: normalizedNextCustomerId,
          branchId: current.branch_id,
          delta: nextOutstanding - previousOutstanding,
        });
      } else {
        await adjustCustomerBalance(client, {
          customerId: previousCustomerId,
          branchId: current.branch_id,
          delta: -previousOutstanding,
        });
        await adjustCustomerBalance(client, {
          customerId: normalizedNextCustomerId,
          branchId: current.branch_id,
          delta: nextOutstanding,
        });
      }

      const salesColumns = await getSalesColumns(client);
      const nextNote = input.note === undefined ? current.note : input.note;
      const updateValues: unknown[] = [];
      const updateClauses: string[] = [];
      const pushUpdate = (column: string, value: unknown) => {
        if (!salesColumns.has(column)) return;
        updateValues.push(value);
        updateClauses.push(`${column} = $${updateValues.length}`);
      };

      pushUpdate('customer_id', nextCustomerId);
      pushUpdate('wh_id', nextWhId ?? null);
      pushUpdate('sale_date', input.saleDate || current.sale_date);
      pushUpdate('sale_type', nextSaleType);
      pushUpdate('doc_type', nextDocType);
      pushUpdate('quote_valid_until', nextQuoteValidUntil || null);
      pushUpdate('subtotal', totals.subtotal);
      pushUpdate('discount', totals.discount);
      pushUpdate('total', totalWithTax);
      pushUpdate('status', nextStatus);
      pushUpdate('note', nextNote ?? null);
      pushUpdate('pay_acc_id', payment.payAccId);
      pushUpdate('paid_amount', payment.paidAmount);
      pushUpdate('is_stock_applied', nextStockApplied);
      pushUpdate('tax_id', tax?.tax_id ?? current.tax_id ?? null);
      pushUpdate('total_before_tax', totals.subtotal);
      pushUpdate('tax_amount', taxAmount);
      if (salesColumns.has('voided_at')) {
        updateClauses.push(
          `voided_at = ${nextStatus === 'void' ? 'COALESCE(voided_at, NOW())' : 'NULL'}`
        );
      }
      if (salesColumns.has('void_reason')) {
        if (nextStatus === 'void') {
          updateValues.push((current.void_reason ?? nextNote ?? null) as unknown);
          updateClauses.push(`void_reason = $${updateValues.length}`);
        } else {
          updateClauses.push(`void_reason = NULL`);
        }
      }
      if (updateClauses.length === 0) {
        await client.query('COMMIT');
        return current;
      }

      updateValues.push(id);
      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET ${updateClauses.join(', ')}
          WHERE sale_id = $${updateValues.length}
          RETURNING *`,
        updateValues
      );

      await syncLowStockNotifications(client, {
        branchId: current.branch_id,
        productIds: Array.from(affectedItemIds),
        actorUserId: ctx?.userId ?? null,
      });

      await client.query('COMMIT');
      return updatedResult.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async voidSale(
    id: number,
    reason: string | undefined,
    scope: BranchScope,
    context: { userId?: number | null }
  ): Promise<Sale | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      if (current.status === 'void') {
        await client.query('COMMIT');
        return current;
      }

      const currentItems = await listSaleItemsTx(client, id);
      const previouslyApplied =
        current.is_stock_applied ?? canApplyStock(current.doc_type || 'sale', current.status);

      if (
        Number(current.paid_amount || 0) > 0 &&
        Number(current.pay_acc_id || 0) > 0 &&
        current.doc_type !== 'quotation'
      ) {
        await adjustAccountBalance(client, {
          accId: Number(current.pay_acc_id),
          branchId: current.branch_id,
          amount: Number(current.paid_amount),
          mode: 'subtract',
        });
      }

      const currentOutstanding = calculateOutstandingBalance({
        docType: current.doc_type,
        status: current.status,
        total: Number(current.total || 0),
        paidAmount: Number(current.paid_amount || 0),
      });
      await adjustCustomerBalance(client, {
        customerId: current.customer_id ? Number(current.customer_id) : null,
        branchId: current.branch_id,
        delta: -currentOutstanding,
      });

      if (previouslyApplied && currentItems.length) {
        await applyStockByFunction(client, {
          branchId: current.branch_id,
          whId: current.wh_id,
          saleId: current.sale_id,
          items: currentItems.map((line) => ({
            item_id: Number(line.item_id),
            quantity: Number(line.quantity),
          })),
          movementType: 'sales_return',
          direction: 'in',
        });
      }

      const salesColumns = await getSalesColumns(client);
      const trimmedReason = String(reason || '').trim();
      const updateValues: unknown[] = [];
      const updateClauses: string[] = [];
      const pushUpdate = (column: string, value: unknown) => {
        if (!salesColumns.has(column)) return;
        updateValues.push(value);
        updateClauses.push(`${column} = $${updateValues.length}`);
      };
      const nextVoidNote = trimmedReason
        ? `${current.note ? `${current.note}\n` : ''}[VOID] ${trimmedReason}`
        : current.note;

      pushUpdate('status', 'void');
      pushUpdate('is_stock_applied', false);
      pushUpdate('pay_acc_id', null);
      pushUpdate('paid_amount', 0);
      if (salesColumns.has('voided_at')) {
        updateClauses.push('voided_at = NOW()');
      }
      pushUpdate('void_reason', trimmedReason || null);
      pushUpdate('note', nextVoidNote);

      if (updateClauses.length === 0) {
        await client.query('COMMIT');
        return current;
      }

      updateValues.push(id);
      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET ${updateClauses.join(', ')}
          WHERE sale_id = $${updateValues.length}
          RETURNING *`,
        updateValues
      );

      await syncLowStockNotifications(client, {
        branchId: current.branch_id,
        productIds: currentItems.map((line) => Number(line.item_id)),
        actorUserId: context.userId ?? null,
      });

      await client.query('COMMIT');
      return updatedResult.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async convertQuotation(
    id: number,
    input: QuotationConvertInput,
    scope: BranchScope,
    context: { userId?: number | null }
  ): Promise<Sale | null> {
    const current = await this.getSale(id, scope);
    if (!current) return null;
    if (current.doc_type !== 'quotation') {
      throw ApiError.badRequest('Only quotations can be converted');
    }
    if (current.status === 'void') {
      throw ApiError.badRequest('Voided quotation cannot be converted');
    }

    return this.updateSale(
      id,
      {
        docType: 'invoice',
        saleDate: input.saleDate,
        status: input.status,
        note: input.note,
        payFromAccId: input.payFromAccId,
        paidAmount: input.paidAmount,
      },
      scope,
      context
    );
  },

  async deleteSale(id: number, scope: BranchScope): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return;
      }

      if (!(current.status === 'void' || current.doc_type === 'quotation')) {
        throw ApiError.badRequest('Only voided sales or quotations can be deleted');
      }

      await client.query(`DELETE FROM ims.sale_items WHERE sale_id = $1`, [id]);
      await client.query(`DELETE FROM ims.sales WHERE sale_id = $1`, [id]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
