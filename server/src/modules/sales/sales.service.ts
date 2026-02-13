import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { SaleInput, SaleItemInput } from './sales.schemas';

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
  sale_type: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  note: string | null;
}

export interface SaleItem {
  sale_item_id: number;
  sale_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export const salesService = {
  async listSales(search?: string, status?: string): Promise<Sale[]> {
    const params: any[] = [];
    const clauses: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      clauses.push(
        `(COALESCE(c.full_name,'') ILIKE $${params.length} OR COALESCE(s.note,'') ILIKE $${params.length})`,
      );
    }
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`s.status = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<Sale>(
      `SELECT s.*, c.full_name AS customer_name
         FROM ims.sales s
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
         ${where}
        ORDER BY s.sale_date DESC`,
      params,
    );
  },

  async getSale(id: number): Promise<Sale | null> {
    return queryOne<Sale>(
      `SELECT s.*, c.full_name AS customer_name
         FROM ims.sales s
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
        WHERE s.sale_id = $1`,
      [id],
    );
  },

  async listItems(saleId: number): Promise<SaleItem[]> {
    return queryMany<SaleItem>(
      `SELECT * FROM ims.sale_items WHERE sale_id = $1 ORDER BY sale_item_id`,
      [saleId],
    );
  },

  async createSale(
    input: SaleInput,
    context: { branchId: number; userId: number },
  ): Promise<Sale> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const items: SaleItemInput[] = input.items || [];
      if (!items.length) {
        throw ApiError.badRequest('At least one item is required');
      }

      const subtotalFromItems = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0,
      );
      const subtotal = items.length > 0 ? subtotalFromItems : input.subtotal ?? 0;
      const discount = input.discount ?? 0;
      const total = input.total ?? subtotal - discount;

      if (total < 0) {
        throw ApiError.badRequest('Total cannot be negative');
      }

      const saleResult = await client.query<Sale>(
        `INSERT INTO ims.sales (
           branch_id, wh_id, user_id, customer_id, currency_code, fx_rate,
           tax_id, total_before_tax, tax_amount,
           sale_date, sale_type, subtotal, discount, total, status, note
         ) VALUES ($1, $2, $3, $4, $5, $6,
                   NULL, $7, 0,
                   COALESCE($8, NOW()), $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          context.branchId,
          input.whId ?? null,
          context.userId,
          input.customerId ?? null,
          input.currencyCode || 'USD',
          input.fxRate || 1,
          subtotal,
          input.saleDate || null,
          input.saleType || 'cash',
          subtotal,
          discount,
          total,
          input.status || 'paid',
          input.note || null,
        ],
      );

      const sale = saleResult.rows[0] as Sale;

      // For each item, ensure stock exists, write sale_items and inventory_movements, and update branch_stock
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (quantity <= 0) {
          throw ApiError.badRequest('Quantity must be greater than zero');
        }

        const productId = Number(item.productId);
        if (!productId || Number.isNaN(productId)) {
          throw ApiError.badRequest('Product is required for each line');
        }

        const lineTotal = quantity * Number(item.unitPrice);

        // Check stock availability at branch
        const stockRow = await client.query<{ quantity: number }>(
          `SELECT quantity
             FROM ims.branch_stock
            WHERE branch_id = $1 AND product_id = $2
            FOR UPDATE`,
          [sale.branch_id, productId],
        );

        const currentQty = stockRow.rows[0]?.quantity ?? 0;
        if (currentQty < quantity) {
          throw ApiError.badRequest(
            `Insufficient stock for product ${productId}. Available: ${currentQty}, requested: ${quantity}`,
          );
        }

        await client.query(
          `INSERT INTO ims.sale_items
             (sale_id, product_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [sale.sale_id, productId, quantity, item.unitPrice, lineTotal],
        );

        // Reduce branch stock
        await client.query(
          `UPDATE ims.branch_stock
             SET quantity = quantity - $1
           WHERE branch_id = $2 AND product_id = $3`,
          [quantity, sale.branch_id, productId],
        );

        // Get cost price for movement (fallback 0)
        const prod = await client.query<{ cost_price: number }>(
          `SELECT cost_price FROM ims.products WHERE product_id = $1`,
          [productId],
        );
        const unitCost = Number(prod.rows[0]?.cost_price || 0);

        // Inventory movement record
        await client.query(
          `INSERT INTO ims.inventory_movements
             (branch_id, wh_id, product_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost)
           VALUES ($1, $2, $3, 'sale', 'sales', $4, 0, $5, $6)`,
          [sale.branch_id, sale.wh_id, productId, sale.sale_id, quantity, unitCost],
        );
      }

      // --- Financial effects: account cash-in ---
      const paidAmountRaw = input.paidAmount ?? 0;
      const payFromAccId = input.payFromAccId;
      if (payFromAccId && paidAmountRaw > 0 && (input.status || 'paid') !== 'void') {
        const paidAmount = Math.min(paidAmountRaw, total);
        if (paidAmount > 0) {
          await client.query(
            `UPDATE ims.accounts
               SET balance = balance + $1
             WHERE acc_id = $2`,
            [paidAmount, payFromAccId],
          );
        }
      }

      await client.query('COMMIT');
      return sale;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

