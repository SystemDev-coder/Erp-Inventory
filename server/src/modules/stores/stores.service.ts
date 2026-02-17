import { queryMany, queryOne } from '../../db/query';
import { BranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';
import { StoreCreateInput, StoreUpdateInput, StoreItemInput } from './stores.schemas';

export interface Store {
  store_id: number;
  branch_id: number;
  store_name: string;
  store_code: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface StoreItem {
  store_item_id: number;
  store_id: number;
  product_id: number;
  quantity: number;
  product_name?: string | null;
  created_at: string;
}

export const storesService = {
  async list(scope: BranchScope, branchId?: number): Promise<Store[]> {
    const params: any[] = [];
    const clause = branchId ? 'WHERE s.branch_id = $1' : scope.isAdmin ? '' : 'WHERE s.branch_id = ANY($1)';
    if (branchId) params.push(branchId);
    else if (!scope.isAdmin) params.push(scope.branchIds);
    return queryMany<Store>(`SELECT s.* FROM ims.stores s ${clause} ORDER BY s.store_name`, params);
  },

  async get(id: number, scope: BranchScope): Promise<Store | null> {
    const row = await queryOne<Store>(`SELECT * FROM ims.stores WHERE store_id = $1`, [id]);
    if (!row) return null;
    if (!scope.isAdmin && !scope.branchIds.includes(Number(row.branch_id))) {
      throw ApiError.forbidden('Access denied to this store');
    }
    return row;
  },

  async create(input: StoreCreateInput, scope: BranchScope): Promise<Store> {
    const branchId = input.branchId ?? scope.primaryBranchId;
    if (!scope.isAdmin && !scope.branchIds.includes(branchId)) {
      throw ApiError.forbidden('Cannot create store for this branch');
    }
    const created = await queryOne<Store>(
      `INSERT INTO ims.stores (branch_id, store_name, store_code, address, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [branchId, input.storeName, input.storeCode ?? null, input.address ?? null, input.phone ?? null]
    );
    if (!created) throw ApiError.internal('Failed to create store');
    return created;
  },

  async update(id: number, input: StoreUpdateInput, scope: BranchScope): Promise<Store | null> {
    const existing = await this.get(id, scope);
    if (!existing) return null;
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (input.storeName !== undefined) { updates.push(`store_name = $${p++}`); values.push(input.storeName); }
    if (input.storeCode !== undefined) { updates.push(`store_code = $${p++}`); values.push(input.storeCode); }
    if (input.address !== undefined) { updates.push(`address = $${p++}`); values.push(input.address); }
    if (input.phone !== undefined) { updates.push(`phone = $${p++}`); values.push(input.phone); }
    if (updates.length === 0) return existing;
    values.push(id);
    await queryOne(`UPDATE ims.stores SET ${updates.join(', ')}, updated_at = NOW() WHERE store_id = $${p}`, values);
    return this.get(id, scope);
  },

  async delete(id: number, scope: BranchScope): Promise<void> {
    const existing = await this.get(id, scope);
    if (!existing) return;
    await queryOne(`DELETE FROM ims.store_items WHERE store_id = $1`, [id]);
    await queryOne(`DELETE FROM ims.stores WHERE store_id = $1`, [id]);
  },

  async listItems(storeId: number, scope: BranchScope): Promise<StoreItem[]> {
    await this.get(storeId, scope);
    return queryMany<StoreItem>(
      `SELECT si.*, p.name AS product_name FROM ims.store_items si
       LEFT JOIN ims.products p ON p.product_id = si.product_id
       WHERE si.store_id = $1 ORDER BY si.store_item_id`,
      [storeId]
    );
  },

  async addItem(storeId: number, input: StoreItemInput, scope: BranchScope): Promise<StoreItem> {
    await this.get(storeId, scope);
    const existing = await queryOne<{ store_item_id: number; quantity: string }>(
      `SELECT store_item_id, quantity FROM ims.store_items WHERE store_id = $1 AND product_id = $2`,
      [storeId, input.productId]
    );
    if (existing) {
      const newQty = Number(existing.quantity) + Number(input.quantity);
      await queryOne(`UPDATE ims.store_items SET quantity = $1, updated_at = NOW() WHERE store_item_id = $2`, [newQty, existing.store_item_id]);
      const row = await queryOne<StoreItem>(`SELECT si.*, p.name AS product_name FROM ims.store_items si LEFT JOIN ims.products p ON p.product_id = si.product_id WHERE si.store_item_id = $1`, [existing.store_item_id]);
      if (!row) throw ApiError.internal('Failed to read store item');
      return row;
    }
    const inserted = await queryOne<StoreItem>(
      `INSERT INTO ims.store_items (store_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *`,
      [storeId, input.productId, input.quantity]
    );
    if (!inserted) throw ApiError.internal('Failed to add store item');
    const withName = await queryOne<StoreItem>(`SELECT si.*, p.name AS product_name FROM ims.store_items si LEFT JOIN ims.products p ON p.product_id = si.product_id WHERE si.store_item_id = $1`, [inserted.store_item_id]);
    return withName ?? inserted;
  },

  async updateItemQuantity(storeId: number, storeItemId: number, quantity: number, scope: BranchScope): Promise<StoreItem | null> {
    await this.get(storeId, scope);
    await queryOne(`UPDATE ims.store_items SET quantity = $1, updated_at = NOW() WHERE store_item_id = $2 AND store_id = $3`, [quantity, storeItemId, storeId]);
    return queryOne<StoreItem>(`SELECT si.*, p.name AS product_name FROM ims.store_items si LEFT JOIN ims.products p ON p.product_id = si.product_id WHERE si.store_item_id = $1`, [storeItemId]);
  },

  async removeItem(storeId: number, storeItemId: number, scope: BranchScope): Promise<void> {
    await this.get(storeId, scope);
    await queryOne(`DELETE FROM ims.store_items WHERE store_item_id = $1 AND store_id = $2`, [storeItemId, storeId]);
  },
};
