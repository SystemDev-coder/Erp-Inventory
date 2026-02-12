import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { PurchaseInput, PurchaseItemInput } from './purchases.schemas';

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
  line_total: number;
  batch_no?: string | null;
  expiry_date?: string | null;
}

export interface PurchaseItemView extends PurchaseItem {
  purchase_date: string;
  supplier_id: number;
  supplier_name: string | null;
  product_name: string | null;
  purchase_type: string;
}

export const purchasesService = {
  async listPurchases(search?: string, status?: string): Promise<Purchase[]> {
    const params: any[] = [];
    const clauses: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(s.supplier_name ILIKE $${params.length} OR p.note ILIKE $${params.length})`);
    }
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`p.status = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<Purchase>(
      `SELECT p.*, s.supplier_name
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         ${where}
        ORDER BY p.purchase_date DESC`,
      params
    );
  },

  async getPurchase(id: number): Promise<Purchase | null> {
    return queryOne<Purchase>(
      `SELECT p.*, s.supplier_name
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
        WHERE p.purchase_id = $1`,
      [id]
    );
  },

  async listItems(purchaseId: number): Promise<PurchaseItem[]> {
    return queryMany<PurchaseItem>(
      `SELECT * FROM ims.purchase_items WHERE purchase_id = $1 ORDER BY purchase_item_id`,
      [purchaseId]
    );
  },

  async listAllItems(filters: {
    search?: string;
    supplierId?: number;
    productId?: number;
    from?: string;
    to?: string;
  }): Promise<PurchaseItemView[]> {
    const clauses: string[] = [];
    const params: any[] = [];
    const addClause = (sql: string, val: any) => {
      params.push(val);
      clauses.push(sql.replace(/\$(\d+)/, `$${params.length}`));
    };

    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(`(COALESCE(pi.description,'') ILIKE $${params.length} OR COALESCE(pr.name,'') ILIKE $${params.length} OR COALESCE(s.supplier_name,'') ILIKE $${params.length})`);
    }
    if (filters.supplierId) addClause(`p.supplier_id = $1`, filters.supplierId);
    if (filters.productId) addClause(`pi.product_id = $1`, filters.productId);
    if (filters.from) addClause(`p.purchase_date::date >= $1`, filters.from);
    if (filters.to) addClause(`p.purchase_date::date <= $1`, filters.to);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return queryMany<PurchaseItemView>(
      `SELECT pi.*, p.purchase_date, p.purchase_type, p.supplier_id, s.supplier_name, pr.name AS product_name
         FROM ims.purchase_items pi
         JOIN ims.purchases p ON p.purchase_id = pi.purchase_id
         LEFT JOIN ims.products pr ON pr.product_id = pi.product_id
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
        input.supplierId,
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

      if (items.length > 0) {
        for (const item of items) {
          const lineTotal = Number(item.quantity) * Number(item.unitCost) - Number(item.discount || 0);
          await client.query(
            `INSERT INTO ims.purchase_items
               (purchase_id, product_id, quantity, unit_cost, line_total, batch_no, expiry_date, description, discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              purchase.purchase_id,
              item.productId ?? null,
              item.quantity,
              item.unitCost,
              lineTotal,
              item.batchNo || null,
              item.expiryDate || null,
              item.description || null,
              item.discount || 0,
            ]
          );
        }
      }

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
    input: Partial<PurchaseInput>
  ): Promise<Purchase | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;

      if (input.supplierId !== undefined) {
        updates.push(`supplier_id = $${p++}`);
        values.push(input.supplierId);
      }
      if (input.whId !== undefined) {
        updates.push(`wh_id = $${p++}`);
        values.push(input.whId);
      }
      if (input.purchaseDate !== undefined) {
        updates.push(`purchase_date = $${p++}`);
        values.push(input.purchaseDate);
      }
    if (input.purchaseType !== undefined) {
      // no-op: purchase_type is deprecated
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
        await client.query(
          `UPDATE ims.purchases
              SET ${updates.join(', ')}, purchase_date = COALESCE(purchase_date, NOW())
            WHERE purchase_id = $${p}
            RETURNING *`,
          values
        );
      }

      if (input.items) {
        await client.query(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
        for (const item of input.items) {
          const lineTotal = Number(item.quantity) * Number(item.unitCost) - Number(item.discount || 0);
          await client.query(
            `INSERT INTO ims.purchase_items
               (purchase_id, product_id, quantity, unit_cost, line_total, batch_no, expiry_date, description, discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              item.productId ?? null,
              item.quantity,
              item.unitCost,
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
        `SELECT p.*, s.supplier_name
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

  async deletePurchase(id: number): Promise<void> {
    // Remove items first to satisfy FK
    await queryOne(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
    await queryOne(`DELETE FROM ims.purchases WHERE purchase_id = $1`, [id]);
  },
};
