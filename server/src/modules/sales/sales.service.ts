import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { syncLowStockNotifications } from '../../utils/stockAlerts';
import { adjustSystemAccountBalance } from '../../utils/systemAccounts';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';
import { financeClosingService } from '../finance/financeClosing.service';
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
  currency_code?: string;
  fx_rate?: number;
  tax_id: number | null;
  total_before_tax?: number;
  tax_amount: number;
  sale_date: string;
  sale_type: 'cash' | 'credit';
  doc_type?: SaleDocType;
  quote_valid_until?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  note: string | null;
  pay_acc_id?: number | null;
  paid_amount?: number;
  is_stock_applied?: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface SaleItem {
  sale_item_id: number;
  sale_id: number;
  product_id: number;
  product_name?: string | null;
  // Some queries (e.g. listItems) alias the FK/name as item_id/item_name for legacy consistency.
  item_id?: number;
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
  fromDate?: string;
  toDate?: string;
}

interface UpdateSaleContext {
  userId?: number | null;
}

const canApplyStock = (docType: SaleDocType, status: SaleStatus) =>
  docType !== 'quotation' && status !== 'void';

interface SalesSchemaMeta {
  salesColumns: Set<string>;
  saleItemIdColumn: 'product_id' | 'item_id';
  saleItemsHasBranchId: boolean;
}

let cachedSalesSchemaMeta: SalesSchemaMeta | null = null;

const getSalesSchemaMeta = async (): Promise<SalesSchemaMeta> => {
  if (cachedSalesSchemaMeta) return cachedSalesSchemaMeta;

  const [salesCols, saleItemCols] = await Promise.all([
    queryMany<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'sales'`
    ),
    queryMany<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'sale_items'`
    ),
  ]);

  const salesColumns = new Set(salesCols.map((row) => row.column_name));
  const saleItemColumnSet = new Set(saleItemCols.map((row) => row.column_name));
  const saleItemIdColumn = saleItemColumnSet.has('product_id') ? 'product_id' : 'item_id';
  const saleItemsHasBranchId = saleItemColumnSet.has('branch_id');

  cachedSalesSchemaMeta = {
    salesColumns,
    saleItemIdColumn,
    saleItemsHasBranchId,
  };

  return cachedSalesSchemaMeta;
};

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
  const schema = await getSalesSchemaMeta();
  const result = await client.query<SaleItem>(
    `SELECT
       sale_item_id,
       sale_id,
       ${schema.saleItemIdColumn} AS product_id,
       quantity,
       unit_price,
       line_total
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
  _client: PoolClient,
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
  saleType: 'cash' | 'credit';
  status: SaleStatus;
  payAccId?: number | null;
  paidAmount?: number;
}) => {
  if (input.docType === 'quotation' || input.saleType === 'credit' || input.status === 'void') {
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

const deriveSaleStatusFromPayment = (input: {
  docType: SaleDocType;
  saleType: 'cash' | 'credit';
  status: SaleStatus;
  total: number;
  paidAmount: number;
}): SaleStatus => {
  if (input.docType === 'quotation') return input.status;
  if (input.status === 'void') return 'void';
  if (input.saleType === 'credit') return 'unpaid';

  const total = roundMoney(input.total);
  const paid = roundMoney(input.paidAmount);

  if (paid <= 0.005) return 'unpaid';
  if (paid >= total - 0.005) return 'paid';
  return 'partial';
};

type PreparedSaleItem = SaleItemInput & { unitPrice: number; productId: number; quantity: number };

const prepareSaleItems = async (
  _client: PoolClient,
  branchId: number,
  items: SaleItemInput[]
): Promise<PreparedSaleItem[]> => {
  const prepared: PreparedSaleItem[] = [];
  for (const item of items) {
    const productId = Number(item.productId);
    const rawQuantity = Number(item.quantity);
    const quantity = Math.round(rawQuantity);
    if (!productId || Number.isNaN(productId)) throw ApiError.badRequest('Item is required for each line');
    if (!quantity || Number.isNaN(rawQuantity) || quantity <= 0) {
      throw ApiError.badRequest('Quantity must be greater than zero');
    }

    const prod = await queryOne<{ sell_price: number }>(
      `SELECT sell_price FROM ims.items WHERE item_id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [productId, branchId]
    );
    if (!prod) throw ApiError.badRequest(`Item ${productId} not found in selected branch`);

    const unitPrice = item.unitPrice !== undefined && item.unitPrice > 0 ? Number(item.unitPrice) : Number(prod.sell_price || 0);
    if (unitPrice <= 0) throw ApiError.badRequest('Unit price must be greater than zero (uses item sell price by default)');

    prepared.push({ ...item, productId, quantity, unitPrice });
  }
  return prepared;
};

const insertSaleItems = async (
  client: PoolClient,
  saleId: number,
  branchId: number,
  items: PreparedSaleItem[]
) => {
  const schema = await getSalesSchemaMeta();
  for (const item of items) {
    const columns = schema.saleItemsHasBranchId
      ? ['branch_id', 'sale_id', schema.saleItemIdColumn, 'quantity', 'unit_price', 'line_total']
      : ['sale_id', schema.saleItemIdColumn, 'quantity', 'unit_price', 'line_total'];
    const values = schema.saleItemsHasBranchId
      ? [branchId, saleId, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice]
      : [saleId, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice];
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(
      `INSERT INTO ims.sale_items (${columns.join(', ')})
       VALUES (${placeholders})`,
      values
    );
  }
};

const AUTO_SALE_NOTE_PREFIX = '[AUTO-SALE]';

interface CustomerBalanceColumns {
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
}

const resolveStoreForItem = async (
  client: PoolClient,
  branchId: number,
  itemId: number,
  fallbackStoreId?: number | null
): Promise<number> => {
  if (fallbackStoreId && Number(fallbackStoreId) > 0) {
    const scoped = await client.query<{ store_id: number }>(
      `SELECT store_id
         FROM ims.stores
        WHERE store_id = $1
          AND branch_id = $2
        LIMIT 1`,
      [fallbackStoreId, branchId]
    );
    if (scoped.rows[0]) return Number(scoped.rows[0].store_id);
  }

  const item = await client.query<{ store_id: number | null }>(
    `SELECT store_id
       FROM ims.items
      WHERE item_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [itemId, branchId]
  );
  const itemStoreId = Number(item.rows[0]?.store_id || 0);
  if (itemStoreId > 0) return itemStoreId;

  const defaultStore = await client.query<{ store_id: number }>(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
      ORDER BY store_id
      LIMIT 1`,
    [branchId]
  );
  const storeId = Number(defaultStore.rows[0]?.store_id || 0);
  if (storeId > 0) return storeId;

  throw ApiError.badRequest(`No store is configured to apply stock for item ${itemId}`);
};

const applyStoreItemDelta = async (
  client: PoolClient,
  params: { branchId: number; storeId: number; itemId: number; delta: number }
) => {
  const delta = Math.round(params.delta);
  if (!delta) return;

  const existing = await client.query<{ quantity: string }>(
    `SELECT quantity::text AS quantity
       FROM ims.store_items
      WHERE store_id = $1
        AND product_id = $2
      FOR UPDATE`,
    [params.storeId, params.itemId]
  );

  let currentQty = Number(existing.rows[0]?.quantity || 0);
  if (!existing.rows[0]) {
    // If store_items row is missing, treat opening_balance as initial stock.
    const item = await client.query<{ opening_balance: string }>(
      `SELECT COALESCE(opening_balance, 0)::text AS opening_balance
         FROM ims.items
        WHERE item_id = $1
          AND branch_id = $2
        LIMIT 1`,
      [params.itemId, params.branchId]
    );
    currentQty = Number(item.rows[0]?.opening_balance || 0);
  }

  const nextQty = currentQty + delta;
  if (nextQty < 0) {
    throw ApiError.badRequest(`Insufficient store stock for item ${params.itemId}`);
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

const applyStockByFunction = async (
  client: PoolClient,
  params: {
    branchId: number;
    storeId?: number | null;
    saleId: number;
    items: Array<{ product_id: number; quantity: number }>;
    movementType: 'sale' | 'sales_return';
    direction: 'out' | 'in';
  }
) => {
  for (const item of params.items) {
    const quantity = Math.round(Number(item.quantity || 0));
    if (!quantity) continue;

    const product = await client.query<{ cost_price: string }>(
      `SELECT COALESCE(cost_price, 0)::text AS cost_price
         FROM ims.items
        WHERE item_id = $1`,
      [item.product_id]
    );
    const costPrice = Number(product.rows[0]?.cost_price || 0);
    const delta = params.direction === 'out' ? -quantity : quantity;
    const storeId = await resolveStoreForItem(
      client,
      params.branchId,
      item.product_id,
      params.storeId ?? null
    );
    await applyStoreItemDelta(client, {
      branchId: params.branchId,
      storeId,
      itemId: item.product_id,
      delta,
    });

    const qtyIn = params.direction === 'in' ? quantity : 0;
    const qtyOut = params.direction === 'out' ? quantity : 0;

    await client.query(
      `INSERT INTO ims.inventory_movements (
         branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note
       )
       VALUES (
         $1, NULL, $2, $3::ims.movement_type_enum, 'sales', $4, $5, $6, $7, $8
       )`,
      [
        params.branchId,
        item.product_id,
        params.movementType,
        params.saleId,
        qtyIn,
        qtyOut,
        costPrice,
        params.direction === 'out' ? 'Sale issue' : 'Sales return restock',
      ]
    );
  }
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

const getCustomerBalanceColumns = async (client: PoolClient): Promise<CustomerBalanceColumns> => {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(result.rows.map((row) => row.column_name));
  return {
    hasOpenBalance: names.has('open_balance'),
    hasRemainingBalance: names.has('remaining_balance'),
  };
};

const adjustCustomerBalance = async (
  client: PoolClient,
  params: { branchId: number; customerId?: number | null; amount: number; mode: 'add' | 'subtract' }
) => {
  if (!params.customerId || !params.amount) return;

  const cols = await getCustomerBalanceColumns(client);
  const updates: string[] = [];
  const signedAmount = params.mode === 'add' ? params.amount : -params.amount;
  if (cols.hasRemainingBalance) {
    updates.push(`remaining_balance = remaining_balance + $1`);
  } else if (cols.hasOpenBalance) {
    // Legacy schema: open_balance acts as the live balance.
    updates.push(`open_balance = open_balance + $1`);
  }
  await adjustSystemAccountBalance(client, {
    branchId: params.branchId,
    kind: 'receivable',
    delta: signedAmount,
  });
  if (!updates.length) return;

  await client.query(
    `UPDATE ims.customers
        SET ${updates.join(', ')}
      WHERE customer_id = $2
        AND branch_id = $3`,
    [signedAmount, params.customerId, params.branchId]
  );
};

const clearSaleFinancialEntries = async (
  client: PoolClient,
  params: { branchId: number; saleId: number }
) => {
  await client.query(
    `DELETE FROM ims.account_transactions
      WHERE branch_id = $1
        AND ref_table = 'sales'
        AND ref_id = $2`,
    [params.branchId, params.saleId]
  );
  await client.query(
    `DELETE FROM ims.customer_ledger
      WHERE branch_id = $1
        AND ref_table = 'sales'
        AND ref_id = $2
        AND entry_type IN ('sale', 'payment')`,
    [params.branchId, params.saleId]
  );
  await client.query(
    `DELETE FROM ims.sale_payments
      WHERE branch_id = $1
        AND sale_id = $2`,
    [params.branchId, params.saleId]
  );
};

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const listSalePaymentSummary = async (
  client: PoolClient,
  params: { branchId: number; saleId: number }
): Promise<Array<{ accId: number; amount: number }>> => {
  const rows = (
    await client.query<{ acc_id: number; amount_paid: string }>(
      `SELECT sp.acc_id, COALESCE(SUM(sp.amount_paid), 0)::text AS amount_paid
         FROM ims.sale_payments sp
        WHERE sp.branch_id = $1
          AND sp.sale_id = $2
        GROUP BY sp.acc_id
        HAVING COALESCE(SUM(sp.amount_paid), 0) > 0.005
        ORDER BY sp.acc_id ASC`,
      [params.branchId, params.saleId]
    )
  ).rows;

  return rows.map((row) => ({ accId: Number(row.acc_id), amount: roundMoney(row.amount_paid) }));
};

const sumSalePayments = (rows: Array<{ amount: number }>) =>
  roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));

const rewriteSaleGl = async (
  client: PoolClient,
  params: { branchId: number; saleId: number }
) => {
  const saleRes = await client.query<{
    sale_id: number;
    branch_id: number;
    sale_date: string;
    status: string;
    doc_type: string | null;
    total: string;
    tax_amount: string | null;
    pay_acc_id: number | null;
    paid_amount: string | null;
  }>(
    `SELECT
        s.sale_id,
        s.branch_id,
        s.sale_date::text AS sale_date,
        COALESCE(s.status::text, 'paid') AS status,
        COALESCE(s.doc_type::text, 'sale') AS doc_type,
        COALESCE(s.total, 0)::text AS total,
        COALESCE(s.tax_amount, 0)::text AS tax_amount,
        NULLIF(to_jsonb(s) ->> 'pay_acc_id', '')::bigint AS pay_acc_id,
        NULLIF(to_jsonb(s) ->> 'paid_amount', '')::numeric(14,2)::text AS paid_amount
      FROM ims.sales s
     WHERE s.branch_id = $1
       AND s.sale_id = $2
     LIMIT 1`,
    [params.branchId, params.saleId]
  );
  const sale = saleRes.rows[0];
  if (!sale) return;

  // Remove legacy single-sided rows + any prior GL rewrite for this sale.
  await client.query(
    `DELETE FROM ims.account_transactions
      WHERE branch_id = $1
        AND ref_table = 'sales'
        AND ref_id = $2`,
    [params.branchId, params.saleId]
  );

  const status = String(sale.status || '').toLowerCase();
  const docType = String(sale.doc_type || 'sale').toLowerCase();
  if (status === 'void' || docType === 'quotation') return;

  const total = roundMoney(sale.total);
  const taxAmount = roundMoney(sale.tax_amount);
  const revenue = roundMoney(total - taxAmount);
  const paidAmount = roundMoney(sale.paid_amount);
  const payAccId = sale.pay_acc_id ? Number(sale.pay_acc_id) : null;

  const paymentAgg = await listSalePaymentSummary(client, params);
  const paidFromPayments = sumSalePayments(paymentAgg);

  // Prefer payments table when inline columns are missing.
  const effectivePaidAmount = paidFromPayments > 0.005 ? paidFromPayments : paidAmount;
  const cashDebit = effectivePaidAmount > 0 ? effectivePaidAmount : 0;
  const arDebit = roundMoney(Math.max(total - Math.min(effectivePaidAmount, total), 0));
  const advanceCredit = roundMoney(Math.max(effectivePaidAmount - total, 0));

  const coa = await ensureCoaAccounts(client, params.branchId, [
    'accountsReceivable',
    'salesRevenue',
    'salesTaxPayable',
    'customerAdvances',
    'inventory',
    'cogs',
  ]);

  const invoiceLines: Array<{ accId: number; debit?: number; credit?: number; note?: string | null }> = [];
  if (cashDebit > 0) {
    if (paymentAgg.length > 0) {
      paymentAgg.forEach((p) => {
        if (p.amount > 0.005) {
          invoiceLines.push({ accId: p.accId, debit: p.amount, credit: 0, note: 'Cash/bank received' });
        }
      });
    } else {
      if (!payAccId) throw ApiError.badRequest('Payment account is required to post this sale');
      invoiceLines.push({ accId: payAccId, debit: cashDebit, credit: 0, note: 'Cash/bank received' });
    }
  }
  if (arDebit > 0) {
    invoiceLines.push({ accId: coa.accountsReceivable, debit: arDebit, credit: 0, note: 'Customer receivable' });
  }
  if (revenue > 0) {
    invoiceLines.push({ accId: coa.salesRevenue, debit: 0, credit: revenue, note: 'Sales revenue' });
  }
  if (taxAmount > 0) {
    invoiceLines.push({ accId: coa.salesTaxPayable, debit: 0, credit: taxAmount, note: 'Sales tax payable' });
  }
  if (advanceCredit > 0) {
    invoiceLines.push({ accId: coa.customerAdvances, debit: 0, credit: advanceCredit, note: 'Customer advance' });
  }

  await postGl(client, {
    branchId: params.branchId,
    txnDate: sale.sale_date || null,
    refTable: 'sales',
    refId: params.saleId,
    note: `Sale #${params.saleId}`,
    lines: invoiceLines,
  });

  const costRes = await client.query<{ amount: string }>(
    `SELECT COALESCE(SUM(COALESCE(qty_out, 0) * COALESCE(unit_cost, 0)), 0)::text AS amount
       FROM ims.inventory_movements
      WHERE branch_id = $1
        AND move_type = 'sale'
        AND ref_table = 'sales'
        AND ref_id = $2`,
    [params.branchId, params.saleId]
  );
  const costTotal = roundMoney(costRes.rows[0]?.amount || 0);
  if (costTotal > 0) {
    await postGl(client, {
      branchId: params.branchId,
      txnDate: sale.sale_date || null,
      refTable: 'sales',
      refId: params.saleId,
      note: `Sale #${params.saleId} (COGS)`,
      lines: [
        { accId: coa.cogs, debit: costTotal, credit: 0, note: 'Cost of goods sold' },
        { accId: coa.inventory, debit: 0, credit: costTotal, note: 'Inventory issued' },
      ],
    });
  }
};

const insertSaleFinancialEntries = async (
  client: PoolClient,
  params: {
    branchId: number;
    saleId: number;
    userId: number;
    customerId?: number | null;
    payAccId?: number | null;
    paidAmount: number;
    total: number;
    note?: string | null;
    payDate?: string | null;
  }
) => {
  const note = `${AUTO_SALE_NOTE_PREFIX}${params.note ? ` ${params.note}` : ''}`;
  if (params.customerId && params.total > 0) {
    await client.query(
      `INSERT INTO ims.customer_ledger
         (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
       VALUES ($1, $2, 'sale', 'sales', $3, NULL, $4, 0, $5)`,
      [params.branchId, params.customerId, params.saleId, params.total, note]
    );
  }

  if (params.payAccId && params.paidAmount > 0) {
     await client.query(
       `INSERT INTO ims.sale_payments
          (branch_id, sale_id, user_id, acc_id, pay_date, amount_paid, reference_no, note)
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, NULL, $7)`,
      [
        params.branchId,
        params.saleId,
        params.userId,
        params.payAccId,
        params.payDate || null,
        params.paidAmount,
        note,
      ]
      );

      if (params.customerId) {
        await client.query(
          `INSERT INTO ims.customer_ledger
           (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
         VALUES ($1, $2, 'payment', 'sales', $3, $4, 0, $5, $6)`,
        [
          params.branchId,
          params.customerId,
          params.saleId,
          params.payAccId,
          params.paidAmount,
          note,
        ]
      );
    }
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
  itemId: Number(item.product_id),
  productId: Number(item.product_id),
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
    const schema = await getSalesSchemaMeta();
    const { search, status, branchId, docType, includeVoided, fromDate, toDate } = filters;
    const scoped = listScopeCondition(scope, branchId);
    const params = scoped.params;
    const clauses = scoped.clauses;

    if (search) {
      params.push(`%${search}%`);
      clauses.push(
        `(COALESCE(c.full_name,'') ILIKE $${params.length} OR COALESCE(s.note,'') ILIKE $${params.length})`
      );
    }
    if (schema.salesColumns.has('doc_type') && docType && docType !== 'all') {
      params.push(docType);
      clauses.push(`COALESCE(s.doc_type, 'sale') = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`s.status = $${params.length}`);
    } else if (!includeVoided) {
      clauses.push(`s.status <> 'void'`);
    }
    if (fromDate && toDate) {
      params.push(fromDate);
      clauses.push(`s.sale_date::date >= $${params.length}::date`);
      params.push(toDate);
      clauses.push(`s.sale_date::date <= $${params.length}::date`);
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
    const sale = scope.isAdmin
      ? await queryOne<Sale>(
          `SELECT s.*, c.full_name AS customer_name
             FROM ims.sales s
             LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
            WHERE s.sale_id = $1`,
          [id]
        )
      : await queryOne<Sale>(
          `SELECT s.*, c.full_name AS customer_name
             FROM ims.sales s
             LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
            WHERE s.sale_id = $1
              AND s.branch_id = ANY($2)`,
          [id, scope.branchIds]
        );

    if (!sale) return null;

    // Keep "paid/balance" accurate even when collection happened from receipts/payment screens.
    const paidFromSalePaymentsRow = await queryOne<{ paid: string }>(
      `SELECT COALESCE(SUM(COALESCE(sp.amount_paid, 0)), 0)::text AS paid
         FROM ims.sale_payments sp
        WHERE sp.sale_id = $1
          AND sp.branch_id = $2`,
      [id, sale.branch_id]
    );
    const paidFromSalePayments = Number(paidFromSalePaymentsRow?.paid || 0);

    const paidFromReceiptsRow = await queryOne<{ paid: string }>(
      `SELECT COALESCE(SUM(COALESCE(r.amount, 0)), 0)::text AS paid
         FROM ims.customer_receipts r
        WHERE COALESCE((to_jsonb(r)->>'sale_id')::bigint, 0) = $1
          AND r.branch_id = $2
          AND NOT (COALESCE(to_jsonb(r)->>'is_deleted', '0') IN ('1','true','t','TRUE','T'))`,
      [id, sale.branch_id]
    );
    const paidFromReceipts = Number(paidFromReceiptsRow?.paid || 0);

    const paidFromSale = Number((sale as any).paid_amount || 0);
    const paidCombined = paidFromSalePayments + paidFromReceipts;
    const total = roundMoney((sale as any).total || 0);
    const effectivePaid = roundMoney(Math.min(Math.max(paidCombined > 0.005 ? paidCombined : paidFromSale, 0), total));

    (sale as any).paid_amount = effectivePaid;
    (sale as any).outstanding_amount = roundMoney(Math.max(total - effectivePaid, 0));

    return sale;
  },

  async listItems(saleId: number): Promise<SaleItem[]> {
    const schema = await getSalesSchemaMeta();
    return queryMany<SaleItem>(
      `SELECT
         si.sale_item_id,
         si.sale_id,
         si.${schema.saleItemIdColumn} AS item_id,
         si.quantity,
         si.unit_price,
         si.line_total,
         p.name AS item_name
         FROM ims.sale_items si
         JOIN ims.items p ON p.item_id = si.${schema.saleItemIdColumn}
        WHERE si.sale_id = $1
        ORDER BY si.sale_item_id`,
      [saleId]
    );
  },

  async createSale(input: SaleInput, context: { branchId: number; userId: number }): Promise<Sale> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = await getSalesSchemaMeta();

      const items = input.items || [];
      if (!items.length) {
        throw ApiError.badRequest('At least one item is required');
      }

      const preparedItems = await prepareSaleItems(client, context.branchId, items);
      const totals = normalizeTotals(preparedItems, input.discount, undefined);
      const tax = await resolveTaxRate(client, context.branchId, input.taxId ?? null, input.taxRate);
      const taxableBase = totals.subtotal - totals.discount;
      const taxAmount = (taxableBase * Number(tax?.rate_percent || 0)) / 100;
      const totalWithTax = taxableBase + taxAmount;

      const docType: SaleDocType = input.docType || 'sale';
      const requestedStatus: SaleStatus = input.status || (docType === 'quotation' ? 'unpaid' : 'paid');
      const saleType: 'cash' | 'credit' =
        docType === 'quotation'
          ? 'credit'
          : input.saleType || (requestedStatus === 'unpaid' ? 'credit' : 'cash');
      let status: SaleStatus =
        saleType === 'credit' && requestedStatus !== 'void' ? 'unpaid' : requestedStatus;
      const payment = normalizePayment({
        total: totalWithTax,
        docType,
        saleType,
        status,
        payAccId: input.payFromAccId,
        paidAmount: input.paidAmount,
      });
      status = deriveSaleStatusFromPayment({
        docType,
        saleType,
        status,
        total: totalWithTax,
        paidAmount: payment.paidAmount,
      });
      const shouldApplyStock = canApplyStock(docType, status);

      await ensureAccount(client, context.branchId, payment.payAccId);

      const insertColumns: string[] = [];
      const insertValues: Array<string | number | boolean | null> = [];
      const pushColumn = (column: string, value: string | number | boolean | null, required = false) => {
        if (required || schema.salesColumns.has(column)) {
          insertColumns.push(column);
          insertValues.push(value);
        }
      };

      pushColumn('branch_id', context.branchId, true);
      pushColumn('wh_id', null, true);
      pushColumn('user_id', context.userId, true);
      pushColumn('customer_id', input.customerId ?? null, true);
      pushColumn('currency_code', input.currencyCode || 'USD');
      pushColumn('fx_rate', input.fxRate || 1);
      pushColumn('tax_id', tax?.tax_id ?? null, true);
      pushColumn('total_before_tax', taxableBase);
      pushColumn('tax_amount', taxAmount, true);
      pushColumn('sale_date', input.saleDate || new Date().toISOString(), true);
      pushColumn('sale_type', saleType, true);
      pushColumn('doc_type', docType);
      pushColumn('quote_valid_until', input.quoteValidUntil || null);
      pushColumn('subtotal', totals.subtotal, true);
      pushColumn('discount', totals.discount, true);
      pushColumn('total', totalWithTax, true);
      pushColumn('status', status, true);
      pushColumn('note', input.note || null, true);
      pushColumn('pay_acc_id', payment.payAccId);
      pushColumn('paid_amount', payment.paidAmount);
      pushColumn('is_stock_applied', shouldApplyStock);

      const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');

      const saleResult = await client.query<Sale>(
        `INSERT INTO ims.sales (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
        insertValues
      );

      const sale = saleResult.rows[0];
      const affectedProductIds = Array.from(
        new Set(preparedItems.map((line) => Number(line.productId)))
      );
      const triggerEnabled = await hasSaleTrigger(client);

      await insertSaleItems(client, sale.sale_id, context.branchId, preparedItems);
      if (!triggerEnabled && shouldApplyStock) {
        await applyStockByFunction(client, {
          branchId: context.branchId,
          storeId: input.storeId ?? null,
          saleId: sale.sale_id,
          items: preparedItems.map((line) => ({
            product_id: Number(line.productId),
            quantity: Number(line.quantity),
          })),
          movementType: 'sale',
          direction: 'out',
        });
      }

      if (payment.payAccId && payment.paidAmount > 0) {
        await adjustAccountBalance(client, {
          accId: payment.payAccId,
          branchId: context.branchId,
          amount: payment.paidAmount,
          mode: 'add',
        });
      }

      const applyFinancialEffects = docType !== 'quotation' && status !== 'void';
      await clearSaleFinancialEntries(client, {
        branchId: context.branchId,
        saleId: sale.sale_id,
      });
      if (applyFinancialEffects) {
        await insertSaleFinancialEntries(client, {
          branchId: context.branchId,
          saleId: sale.sale_id,
          userId: context.userId,
          customerId: input.customerId ?? null,
          payAccId: payment.payAccId,
          paidAmount: Number(payment.paidAmount || 0),
          total: totalWithTax,
          note: input.note || null,
          payDate: input.saleDate || null,
        });
        const outstanding = Math.max(totalWithTax - Number(payment.paidAmount || 0), 0);
        if (outstanding > 0 && input.customerId) {
          await adjustCustomerBalance(client, {
            branchId: context.branchId,
            customerId: input.customerId,
            amount: outstanding,
            mode: 'add',
          });
        }
        await rewriteSaleGl(client, { branchId: context.branchId, saleId: sale.sale_id });
      }

      await syncLowStockNotifications(client, {
        branchId: context.branchId,
        productIds: affectedProductIds,
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
      const schema = await getSalesSchemaMeta();
  const supportsInlinePayment =
        schema.salesColumns.has('pay_acc_id') && schema.salesColumns.has('paid_amount');

      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      await financeClosingService.autoUnlockPeriodForDate(
        client,
        Number(current.branch_id),
        current.sale_date,
        ctx?.userId ?? null,
        `Auto reopen for sale edit #${current.sale_id}`
      );

      const currentItems = await listSaleItemsTx(client, id);
      const rawItems = input.items ? input.items : currentItems.map(mapCurrentItemToInput);
      const preparedItems = await prepareSaleItems(client, current.branch_id, rawItems);

      if (!preparedItems.length) {
        throw ApiError.badRequest('At least one item is required');
      }

      const nextDocType = (input.docType || current.doc_type || 'sale') as SaleDocType;
      const requestedNextStatus = (input.status || current.status || 'paid') as SaleStatus;
      const nextSaleType =
        (input.saleType ||
          current.sale_type ||
          (requestedNextStatus === 'unpaid' ? 'credit' : 'cash')) as 'cash' | 'credit';
      const nextStatus: SaleStatus =
        nextSaleType === 'credit' && requestedNextStatus !== 'void' ? 'unpaid' : requestedNextStatus;
      const nextQuoteValidUntil =
        input.quoteValidUntil === undefined ? current.quote_valid_until : input.quoteValidUntil;
      const nextStoreId = input.storeId === undefined ? null : input.storeId;
      const totals = normalizeTotals(preparedItems, input.discount ?? current.discount, undefined);
      const tax = await resolveTaxRate(
        client,
        current.branch_id,
        input.taxId ?? current.tax_id ?? null,
        input.taxRate
      );
      const taxableBase = totals.subtotal - (input.discount ?? current.discount ?? 0);
      const taxAmount = (taxableBase * Number(tax?.rate_percent || 0)) / 100;
      const totalWithTax = taxableBase + taxAmount;
      const previousApplyStock =
        current.is_stock_applied ?? canApplyStock(current.doc_type || 'sale', current.status);
      const previousFinancialApplied =
        current.status !== 'void' && (current.doc_type || 'sale') !== 'quotation';
      // Reverse any prior payments recorded for this sale (table-based first; fallback to inline fields for legacy schemas).
      const previousPaymentRows = await listSalePaymentSummary(client, { branchId: current.branch_id, saleId: current.sale_id });
      const legacyInlinePayment =
        supportsInlinePayment &&
        previousPaymentRows.length === 0 &&
        Number((current as any).paid_amount || 0) > 0 &&
        Number((current as any).pay_acc_id || 0) > 0 &&
        current.status !== 'void' &&
        current.doc_type !== 'quotation'
          ? [{ accId: Number((current as any).pay_acc_id), amount: roundMoney((current as any).paid_amount) }]
          : [];
      const effectivePreviousPayments = previousPaymentRows.length ? previousPaymentRows : legacyInlinePayment;
      const previousPaidAmount = sumSalePayments(effectivePreviousPayments);
      const previousSingleAccId = effectivePreviousPayments.length === 1 ? effectivePreviousPayments[0].accId : null;

      const payment = normalizePayment({
        total: totalWithTax,
        docType: nextDocType,
        saleType: nextSaleType,
        status: nextStatus,
        payAccId: (input.payFromAccId === undefined ? previousSingleAccId : input.payFromAccId) ?? null,
        paidAmount: input.paidAmount === undefined ? previousPaidAmount : (input.paidAmount ?? 0),
      });

      const finalNextStatus = deriveSaleStatusFromPayment({
        docType: nextDocType,
        saleType: nextSaleType,
        status: nextStatus,
        total: totalWithTax,
        paidAmount: payment.paidAmount,
      });
      const nextApplyStock = canApplyStock(nextDocType, finalNextStatus);
      const nextFinancialApplied = finalNextStatus !== 'void' && nextDocType !== 'quotation';

      await ensureAccount(client, current.branch_id, payment.payAccId);

      for (const row of effectivePreviousPayments) {
        await adjustAccountBalance(client, {
          accId: row.accId,
          branchId: current.branch_id,
          amount: row.amount,
          mode: 'subtract',
        });
      }

      const triggerEnabled = await hasSaleTrigger(client);
      const needsItemReset = Boolean(input.items) || previousApplyStock !== nextApplyStock;
      const affectedProductIds = new Set<number>(
        currentItems.map((line) => Number(line.product_id))
      );

      if (needsItemReset) {
        if (!triggerEnabled && previousApplyStock) {
          await applyStockByFunction(client, {
            branchId: current.branch_id,
            storeId: null,
            saleId: current.sale_id,
            items: currentItems.map((line) => ({
              product_id: Number(line.product_id),
              quantity: Number(line.quantity),
            })),
            movementType: 'sales_return',
            direction: 'in',
          });
        }

        await client.query(`DELETE FROM ims.sale_items WHERE sale_id = $1`, [id]);
        await insertSaleItems(client, id, current.branch_id, preparedItems);

        if (!triggerEnabled && nextApplyStock) {
          await applyStockByFunction(client, {
            branchId: current.branch_id,
            storeId: nextStoreId ?? null,
            saleId: current.sale_id,
            items: preparedItems.map((line) => ({
              product_id: Number(line.productId),
              quantity: Number(line.quantity),
            })),
            movementType: 'sale',
            direction: 'out',
          });
        }
      }

      preparedItems.forEach((line) => affectedProductIds.add(Number(line.productId)));

      if (payment.payAccId && payment.paidAmount > 0) {
        await adjustAccountBalance(client, {
          accId: payment.payAccId,
          branchId: current.branch_id,
          amount: payment.paidAmount,
          mode: 'add',
        });
      }

      const nextCustomerId =
        input.customerId === undefined
          ? (current.customer_id ?? null)
          : (input.customerId ?? null);
      const previousOutstanding = previousFinancialApplied
        ? Math.max(Number(current.total || 0) - Number(previousPaidAmount || 0), 0)
        : 0;
      const nextOutstanding = nextFinancialApplied
        ? Math.max(totalWithTax - Number(payment.paidAmount || 0), 0)
        : 0;

      if (previousOutstanding > 0 && current.customer_id) {
        await adjustCustomerBalance(client, {
          branchId: current.branch_id,
          customerId: current.customer_id,
          amount: previousOutstanding,
          mode: 'subtract',
        });
      }
      if (nextOutstanding > 0 && nextCustomerId) {
        await adjustCustomerBalance(client, {
          branchId: current.branch_id,
          customerId: nextCustomerId,
          amount: nextOutstanding,
          mode: 'add',
        });
      }

      await clearSaleFinancialEntries(client, {
        branchId: current.branch_id,
        saleId: current.sale_id,
      });
      if (nextFinancialApplied) {
        await insertSaleFinancialEntries(client, {
          branchId: current.branch_id,
          saleId: current.sale_id,
          userId: ctx?.userId ?? current.user_id,
          customerId: nextCustomerId,
          payAccId: payment.payAccId,
          paidAmount: Number(payment.paidAmount || 0),
          total: totalWithTax,
          note: input.note === undefined ? current.note : input.note,
          payDate: input.saleDate || current.sale_date,
        });
      }

      const updates: string[] = [];
      const values: Array<string | number | boolean | null> = [];

      const pushSet = (column: string, value: string | number | boolean | null) => {
        if (!schema.salesColumns.has(column)) return;
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };

      pushSet('customer_id', input.customerId ?? current.customer_id);
      pushSet('wh_id', null);
      if (schema.salesColumns.has('sale_date')) {
        values.push(input.saleDate || null);
        updates.push(`sale_date = COALESCE($${values.length}, sale_date)`);
      }
      pushSet('sale_type', nextSaleType);
      pushSet('doc_type', nextDocType);
      pushSet('quote_valid_until', nextQuoteValidUntil || null);
      pushSet('subtotal', totals.subtotal);
      pushSet('discount', totals.discount);
      pushSet('total', totalWithTax);
      pushSet('status', finalNextStatus);
      pushSet('note', input.note === undefined ? current.note : input.note);
      if (supportsInlinePayment) {
        pushSet('pay_acc_id', payment.payAccId);
        pushSet('paid_amount', payment.paidAmount);
      }
      pushSet('is_stock_applied', nextApplyStock);
      pushSet('tax_id', tax?.tax_id ?? current.tax_id ?? null);
      pushSet('total_before_tax', taxableBase);
      pushSet('tax_amount', taxAmount);

      if (schema.salesColumns.has('voided_at')) {
        values.push(finalNextStatus);
        updates.push(`voided_at = CASE WHEN $${values.length} = 'void' THEN COALESCE(voided_at, NOW()) ELSE NULL END`);
      }
      if (schema.salesColumns.has('void_reason')) {
        values.push(finalNextStatus);
        const statusIdx = values.length;
        values.push((input.note === undefined ? current.note : input.note) || null);
        const noteIdx = values.length;
        updates.push(`void_reason = CASE WHEN $${statusIdx} = 'void' THEN COALESCE(void_reason, $${noteIdx}) ELSE NULL END`);
      }

      if (!updates.length) {
        throw ApiError.internal('Sales update is not supported by current schema');
      }

      values.push(id);
      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET ${updates.join(', ')}
          WHERE sale_id = $${values.length}
          RETURNING *`,
        values
      );

      await rewriteSaleGl(client, { branchId: current.branch_id, saleId: current.sale_id });

      await syncLowStockNotifications(client, {
        branchId: current.branch_id,
        productIds: Array.from(affectedProductIds),
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
      const schema = await getSalesSchemaMeta();
      const supportsInlinePayment =
        schema.salesColumns.has('pay_acc_id') && schema.salesColumns.has('paid_amount');

      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      await financeClosingService.autoUnlockPeriodForDate(
        client,
        Number(current.branch_id),
        current.sale_date,
        context.userId ?? null,
        `Auto reopen for sale void #${current.sale_id}`
      );
      if (current.status === 'void') {
        await client.query('COMMIT');
        return current;
      }

      const currentItems = await listSaleItemsTx(client, id);
      const previouslyApplied =
        current.is_stock_applied ?? canApplyStock(current.doc_type || 'sale', current.status);
      const previousFinancialApplied = (current.doc_type || 'sale') !== 'quotation';
      const previousPaymentRows = previousFinancialApplied
        ? await listSalePaymentSummary(client, { branchId: current.branch_id, saleId: current.sale_id })
        : [];
      const legacyInlinePayment =
        supportsInlinePayment &&
        previousPaymentRows.length === 0 &&
        Number(current.paid_amount || 0) > 0 &&
        Number(current.pay_acc_id || 0) > 0 &&
        current.doc_type !== 'quotation'
          ? [{ accId: Number(current.pay_acc_id), amount: roundMoney(current.paid_amount) }]
          : [];
      const effectivePreviousPayments = previousPaymentRows.length ? previousPaymentRows : legacyInlinePayment;
      const previousPaidAmount = sumSalePayments(effectivePreviousPayments);
      const previousOutstanding = previousFinancialApplied
        ? Math.max(Number(current.total || 0) - Number(previousPaidAmount || 0), 0)
        : 0;

      for (const row of effectivePreviousPayments) {
        await adjustAccountBalance(client, {
          accId: row.accId,
          branchId: current.branch_id,
          amount: row.amount,
          mode: 'subtract',
        });
      }

      if (previouslyApplied && currentItems.length) {
        await applyStockByFunction(client, {
          branchId: current.branch_id,
          storeId: null,
          saleId: current.sale_id,
          items: currentItems.map((line) => ({
            product_id: Number(line.product_id),
            quantity: Number(line.quantity),
          })),
          movementType: 'sales_return',
          direction: 'in',
        });
      }

      if (previousOutstanding > 0 && current.customer_id) {
        await adjustCustomerBalance(client, {
          branchId: current.branch_id,
          customerId: current.customer_id,
          amount: previousOutstanding,
          mode: 'subtract',
        });
      }

      await clearSaleFinancialEntries(client, {
        branchId: current.branch_id,
        saleId: current.sale_id,
      });

      const updates: string[] = [];
      const values: Array<string | number | boolean | null> = [id];

      if (schema.salesColumns.has('status')) {
        updates.push(`status = 'void'`);
      }
      if (schema.salesColumns.has('is_stock_applied')) {
        updates.push('is_stock_applied = FALSE');
      }
      if (supportsInlinePayment) {
        updates.push('pay_acc_id = NULL');
        updates.push('paid_amount = 0');
      }
      if (schema.salesColumns.has('voided_at')) {
        updates.push('voided_at = NOW()');
      }

      const reasonValue = reason || '';
      let reasonIdx = -1;
      if (schema.salesColumns.has('void_reason') || schema.salesColumns.has('note')) {
        values.push(reasonValue);
        reasonIdx = values.length;
      }

      if (schema.salesColumns.has('void_reason') && reasonIdx > 0) {
        updates.push(`void_reason = NULLIF($${reasonIdx}, '')`);
      }
      if (schema.salesColumns.has('note') && reasonIdx > 0) {
        updates.push(
          `note = CASE
             WHEN COALESCE($${reasonIdx}, '') = '' THEN note
             ELSE COALESCE(note, '') || CASE WHEN COALESCE(note, '') = '' THEN '' ELSE E'\n' END || '[VOID] ' || $${reasonIdx}
           END`
        );
      }

      if (!updates.length) {
        throw ApiError.internal('Sales void is not supported by current schema');
      }

      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET ${updates.join(', ')}
          WHERE sale_id = $1
          RETURNING *`,
        values
      );

      await syncLowStockNotifications(client, {
        branchId: current.branch_id,
        productIds: currentItems.map((line) => Number(line.product_id)),
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
    const schema = await getSalesSchemaMeta();
    if (!schema.salesColumns.has('doc_type')) {
      throw ApiError.badRequest('Quotation conversion is not supported on current database schema');
    }

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

  async deleteSale(id: number, scope: BranchScope, context?: { userId?: number | null }): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = await getSalesSchemaMeta();
      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return;
      }

      const allowQuotationDelete = schema.salesColumns.has('doc_type') && current.doc_type === 'quotation';
      if (!(current.status === 'void' || allowQuotationDelete)) {
        throw ApiError.badRequest('Only voided sales or quotations can be deleted');
      }

      await financeClosingService.autoUnlockPeriodForDate(
        client,
        Number(current.branch_id),
        current.sale_date,
        context?.userId ?? null,
        `Auto reopen for sale delete #${current.sale_id}`
      );

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
