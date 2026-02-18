import { queryMany, queryOne } from '../../db/query';
import { BranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';
import {
  StoreCreateInput,
  StoreUpdateInput,
  StoreItemInput,
  StoreListQueryInput,
  StoreItemListQueryInput,
} from './stores.schemas';

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

type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  limit: number;
};

export const storesService = {
  async list(scope: BranchScope, filters: StoreListQueryInput): Promise<Paged<Store>> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (filters.branchId) {
      if (!scope.isAdmin && !scope.branchIds.includes(filters.branchId)) {
        throw ApiError.forbidden('Cannot access stores for this branch');
      }
      params.push(filters.branchId);
      where.push(`s.branch_id = $${params.length}`);
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`s.branch_id = ANY($${params.length})`);
    }

    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      where.push(`(s.store_name ILIKE $${params.length} OR COALESCE(s.store_code,'') ILIKE $${params.length})`);
    }

    if (!filters.includeInactive) {
      where.push('s.is_active = TRUE');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.stores s ${whereSql}`,
      params
    );

    const offset = (filters.page - 1) * filters.limit;
    const rows = await queryMany<Store>(
      `SELECT s.*
         FROM ims.stores s
         ${whereSql}
        ORDER BY s.store_name
        LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      [...params, filters.limit, offset]
    );

    return {
      rows,
      total: Number(count?.total || 0),
      page: filters.page,
      limit: filters.limit,
    };
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

  async listItems(
    storeId: number,
    scope: BranchScope,
    filters: StoreItemListQueryInput
  ): Promise<Paged<StoreItem>> {
    await this.get(storeId, scope);

    const params: unknown[] = [storeId];
    let whereSql = 'WHERE si.store_id = $1';

    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereSql += ` AND i.name ILIKE $${params.length}`;
    }

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM ims.store_items si
         LEFT JOIN ims.items i ON i.item_id = si.product_id
         ${whereSql}`,
      params
    );

    const offset = (filters.page - 1) * filters.limit;
    const rows = await queryMany<StoreItem>(
      `SELECT si.*, i.name AS product_name
         FROM ims.store_items si
         LEFT JOIN ims.items i ON i.item_id = si.product_id
         ${whereSql}
        ORDER BY si.store_item_id
        LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      [...params, filters.limit, offset]
    );

    return {
      rows,
      total: Number(count?.total || 0),
      page: filters.page,
      limit: filters.limit,
    };
  },

  async addItem(storeId: number, input: StoreItemInput, scope: BranchScope): Promise<StoreItem> {
    const store = await this.get(storeId, scope);
    if (!store) throw ApiError.notFound('Store not found');
    const product = await queryOne<{ item_id: number }>(
      `SELECT item_id
         FROM ims.items
        WHERE item_id = $1
          AND branch_id = $2`,
      [input.productId, store.branch_id]
    );
    if (!product) {
      throw ApiError.badRequest('Item not found in this store branch');
    }
    const existing = await queryOne<{ store_item_id: number; quantity: string }>(
      `SELECT store_item_id, quantity FROM ims.store_items WHERE store_id = $1 AND product_id = $2`,
      [storeId, input.productId]
    );
    if (existing) {
      const newQty = Number(existing.quantity) + Number(input.quantity);
      await queryOne(`UPDATE ims.store_items SET quantity = $1, updated_at = NOW() WHERE store_item_id = $2`, [newQty, existing.store_item_id]);
      const row = await queryOne<StoreItem>(`SELECT si.*, i.name AS product_name FROM ims.store_items si LEFT JOIN ims.items i ON i.item_id = si.product_id WHERE si.store_item_id = $1`, [existing.store_item_id]);
      if (!row) throw ApiError.internal('Failed to read store item');
      return row;
    }
    const inserted = await queryOne<StoreItem>(
      `INSERT INTO ims.store_items (store_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *`,
      [storeId, input.productId, input.quantity]
    );
    if (!inserted) throw ApiError.internal('Failed to add store item');
    const withName = await queryOne<StoreItem>(`SELECT si.*, i.name AS product_name FROM ims.store_items si LEFT JOIN ims.items i ON i.item_id = si.product_id WHERE si.store_item_id = $1`, [inserted.store_item_id]);
    return withName ?? inserted;
  },

  async updateItemQuantity(storeId: number, storeItemId: number, quantity: number, scope: BranchScope): Promise<StoreItem | null> {
    await this.get(storeId, scope);
    await queryOne(`UPDATE ims.store_items SET quantity = $1, updated_at = NOW() WHERE store_item_id = $2 AND store_id = $3`, [quantity, storeItemId, storeId]);
    return queryOne<StoreItem>(`SELECT si.*, i.name AS product_name FROM ims.store_items si LEFT JOIN ims.items i ON i.item_id = si.product_id WHERE si.store_item_id = $1`, [storeItemId]);
  },

  async removeItem(storeId: number, storeItemId: number, scope: BranchScope): Promise<void> {
    await this.get(storeId, scope);
    await queryOne(`DELETE FROM ims.store_items WHERE store_item_id = $1 AND store_id = $2`, [storeItemId, storeId]);
  },
};
