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

export const purchasesService = {
  async listPurchases(search?: string): Promise<Purchase[]> {
    const params: any[] = [];
    let filter = '';
    if (search) {
      params.push(`%${search}%`);
      filter = `WHERE s.supplier_name ILIKE $1 OR p.note ILIKE $1`;
    }

    return queryMany<Purchase>(
      `SELECT p.*, s.supplier_name
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         ${filter}
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

  async createPurchase(
    input: PurchaseInput,
    context: { branchId: number; userId: number }
  ): Promise<Purchase> {
    const items: PurchaseItemInput[] = input.items || [];

    // Compute totals if items provided
    let subtotal = input.subtotal ?? 0;
    if (items.length > 0) {
      subtotal = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0
      );
    }
    const discount = input.discount ?? 0;
    const total = input.total ?? subtotal - discount;

    const purchase = await queryOne<Purchase>(
      `INSERT INTO ims.purchases (
         branch_id, wh_id, user_id, supplier_id, currency_code, fx_rate,
         purchase_date, purchase_type, subtotal, discount, total, status, note
       ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        context.branchId,
        input.whId ?? null,
        context.userId,
        input.supplierId,
        input.currencyCode || 'USD',
        input.fxRate || 1,
        input.purchaseDate || null,
        input.purchaseType || 'cash',
        subtotal,
        discount,
        total,
        input.status || 'received',
        input.note || null,
      ]
    );

    if (items.length > 0 && purchase) {
      for (const item of items) {
        const lineTotal = Number(item.quantity) * Number(item.unitCost);
        await queryOne(
          `INSERT INTO ims.purchase_items
             (purchase_id, product_id, quantity, unit_cost, line_total, batch_no, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            purchase.purchase_id,
            item.productId,
            item.quantity,
            item.unitCost,
            lineTotal,
            item.batchNo || null,
            item.expiryDate || null,
          ]
        );
      }
    }

    return purchase as Purchase;
  },

  async updatePurchase(
    id: number,
    input: Partial<PurchaseInput>
  ): Promise<Purchase | null> {
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
      updates.push(`purchase_type = $${p++}`);
      values.push(input.purchaseType);
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

    if (updates.length === 0) {
      return this.getPurchase(id);
    }

    values.push(id);

    return queryOne<Purchase>(
      `UPDATE ims.purchases
          SET ${updates.join(', ')}, purchase_date = COALESCE(purchase_date, NOW())
        WHERE purchase_id = $${p}
        RETURNING *`,
      values
    );
  },

  async deletePurchase(id: number): Promise<void> {
    // Remove items first to satisfy FK
    await queryOne(`DELETE FROM ims.purchase_items WHERE purchase_id = $1`, [id]);
    await queryOne(`DELETE FROM ims.purchases WHERE purchase_id = $1`, [id]);
  },
};
