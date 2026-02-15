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
  currency_code: string;
  fx_rate: number;
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
  product_id: number;
  product_name?: string | null;
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
        AND COALESCE(is_deleted, FALSE) = FALSE`,
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

const ensureProductInBranch = async (client: PoolClient, branchId: number, productId: number) => {
  const product = await client.query(
    `SELECT product_id
       FROM ims.products
      WHERE product_id = $1
        AND branch_id = $2
        AND is_active = TRUE
        AND COALESCE(is_deleted, FALSE) = FALSE`,
    [productId, branchId]
  );
  if (!product.rows[0]) {
    throw ApiError.badRequest(`Item ${productId} not found in selected branch`);
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

const insertSaleItems = async (
  client: PoolClient,
  saleId: number,
  branchId: number,
  items: SaleItemInput[]
) => {
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice || 0);

    if (!productId || Number.isNaN(productId)) {
      throw ApiError.badRequest('Item is required for each line');
    }
    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      throw ApiError.badRequest('Quantity must be greater than zero');
    }
    if (unitPrice < 0 || Number.isNaN(unitPrice)) {
      throw ApiError.badRequest('Unit price cannot be negative');
    }

    await ensureProductInBranch(client, branchId, productId);

    await client.query(
      `INSERT INTO ims.sale_items (sale_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5)`,
      [saleId, productId, quantity, unitPrice, quantity * unitPrice]
    );
  }
};

const applyStockByFunction = async (
  client: PoolClient,
  params: {
    branchId: number;
    whId?: number | null;
    saleId: number;
    items: Array<{ product_id: number; quantity: number }>;
    movementType: 'sale' | 'sales_return';
    direction: 'out' | 'in';
  }
) => {
  for (const item of params.items) {
    const quantity = Number(item.quantity || 0);
    if (!quantity) continue;

    const product = await client.query<{ cost_price: string }>(
      `SELECT COALESCE(cost_price, 0)::text AS cost_price
         FROM ims.products
        WHERE product_id = $1`,
      [item.product_id]
    );
    const costPrice = Number(product.rows[0]?.cost_price || 0);
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
        item.product_id,
        delta,
        params.movementType,
        params.saleId,
        costPrice,
        params.direction === 'out',
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
      `SELECT si.*, p.name AS product_name
         FROM ims.sale_items si
         JOIN ims.products p ON p.product_id = si.product_id
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

      const totals = normalizeTotals(items, input.discount, input.total);
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

      const saleResult = await client.query<Sale>(
        `INSERT INTO ims.sales (
           branch_id, wh_id, user_id, customer_id, currency_code, fx_rate,
           tax_id, total_before_tax, tax_amount,
           sale_date, sale_type, doc_type, quote_valid_until,
           subtotal, discount, total, status, note,
           pay_acc_id, paid_amount, is_stock_applied
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           NULL, $7, 0,
           COALESCE($8, NOW()), $9, $10, $11,
           $12, $13, $14, $15, $16,
           $17, $18, $19
         )
         RETURNING *`,
        [
          context.branchId,
          input.whId ?? null,
          context.userId,
          input.customerId ?? null,
          input.currencyCode || 'USD',
          input.fxRate || 1,
          totals.subtotal,
          input.saleDate || null,
          saleType,
          docType,
          input.quoteValidUntil || null,
          totals.subtotal,
          totals.discount,
          totals.total,
          status,
          input.note || null,
          payment.payAccId,
          payment.paidAmount,
          shouldApplyStock,
        ]
      );

      const sale = saleResult.rows[0];
      const affectedProductIds = Array.from(new Set(items.map((line) => Number(line.productId))));
      const triggerEnabled = await hasSaleTrigger(client);

      await insertSaleItems(client, sale.sale_id, context.branchId, items);
      if (!triggerEnabled && shouldApplyStock) {
        await applyStockByFunction(client, {
          branchId: context.branchId,
          whId: input.whId ?? null,
          saleId: sale.sale_id,
          items: items.map((line) => ({
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

      const current = await getSaleForUpdate(client, id, scope);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      const currentItems = await listSaleItemsTx(client, id);
      const nextItems = input.items
        ? input.items
        : currentItems.map(mapCurrentItemToInput);

      if (!nextItems.length) {
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
      const totals = normalizeTotals(nextItems, input.discount ?? current.discount, input.total);
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
      const affectedProductIds = new Set<number>(
        currentItems.map((line) => Number(line.product_id))
      );

      if (needsItemReset) {
        if (!triggerEnabled && previousApplyStock) {
          await applyStockByFunction(client, {
            branchId: current.branch_id,
            whId: current.wh_id,
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
        await insertSaleItems(client, id, current.branch_id, nextItems);

        if (!triggerEnabled && nextApplyStock) {
          await applyStockByFunction(client, {
            branchId: current.branch_id,
            whId: nextWhId,
            saleId: current.sale_id,
            items: nextItems.map((line) => ({
              product_id: Number(line.productId),
              quantity: Number(line.quantity),
            })),
            movementType: 'sale',
            direction: 'out',
          });
        }
      }

      nextItems.forEach((line) => affectedProductIds.add(Number(line.productId)));

      if (payment.payAccId && payment.paidAmount > 0) {
        await adjustAccountBalance(client, {
          accId: payment.payAccId,
          branchId: current.branch_id,
          amount: payment.paidAmount,
          mode: 'add',
        });
      }

      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET customer_id = COALESCE($1, customer_id),
                wh_id = $2,
                sale_date = COALESCE($3, sale_date),
                sale_type = $4,
                doc_type = $5,
                quote_valid_until = $6,
                subtotal = $7,
                discount = $8,
                total = $9,
                status = $10,
                note = $11,
                pay_acc_id = $12,
                paid_amount = $13,
                is_stock_applied = $14,
                voided_at = CASE WHEN $10 = 'void' THEN COALESCE(voided_at, NOW()) ELSE NULL END,
                void_reason = CASE WHEN $10 = 'void' THEN COALESCE(void_reason, note) ELSE NULL END
          WHERE sale_id = $15
          RETURNING *`,
        [
          input.customerId ?? current.customer_id,
          nextWhId ?? null,
          input.saleDate || null,
          nextSaleType,
          nextDocType,
          nextQuoteValidUntil || null,
          totals.subtotal,
          totals.discount,
          totals.total,
          nextStatus,
          input.note === undefined ? current.note : input.note,
          payment.payAccId,
          payment.paidAmount,
          nextApplyStock,
          id,
        ]
      );

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

      if (previouslyApplied && currentItems.length) {
        await applyStockByFunction(client, {
          branchId: current.branch_id,
          whId: current.wh_id,
          saleId: current.sale_id,
          items: currentItems.map((line) => ({
            product_id: Number(line.product_id),
            quantity: Number(line.quantity),
          })),
          movementType: 'sales_return',
          direction: 'in',
        });
      }

      const updatedResult = await client.query<Sale>(
        `UPDATE ims.sales
            SET status = 'void',
                is_stock_applied = FALSE,
                pay_acc_id = NULL,
                paid_amount = 0,
                voided_at = NOW(),
                void_reason = NULLIF($2, ''),
                note = CASE
                  WHEN COALESCE($2, '') = '' THEN note
                  ELSE COALESCE(note, '') || CASE WHEN COALESCE(note, '') = '' THEN '' ELSE E'\n' END || '[VOID] ' || $2
                END
          WHERE sale_id = $1
          RETURNING *`,
        [id, reason || '']
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
