import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { PoolClient } from 'pg';
import { ApiError } from '../../utils/ApiError';
import {
  BranchScope,
  assertBranchAccess,
  pickBranchForWrite,
} from '../../utils/branchScope';
import {
  CategoryCreateInput,
  CategoryUpdateInput,
  ProductCreateInput,
  ProductUpdateInput,
  TaxCreateInput,
  TaxUpdateInput,
  UnitCreateInput,
  UnitUpdateInput,
} from './products.schemas';

type MasterFilters = {
  search?: string;
  branchId?: number;
  includeInactive?: boolean;
  page: number;
  limit: number;
};

type ProductFilters = MasterFilters & {
  categoryId?: number;
  unitId?: number;
  taxId?: number;
  storeId?: number;
};

type Paged<T> = { rows: T[]; total: number; page: number; limit: number };

export interface Category {
  category_id: number;
  branch_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface Unit {
  unit_id: number;
  branch_id: number;
  unit_name: string;
  symbol: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Tax {
  tax_id: number;
  branch_id: number;
  tax_name: string;
  rate_percent: number;
  is_inclusive: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  product_id: number;
  branch_id: number;
  name: string;
  barcode: string | null;
  sku?: string | null;
  store_id: number | null;
  store_name?: string | null;
  stock_alert: number;
  cost_price: number;
  sell_price: number;
  price?: number;
  cost?: number;
  stock: number;
  quantity?: number;
  opening_balance: number;
  is_active: boolean;
  status: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

const like = (v?: string) => (v?.trim() ? `%${v.trim()}%` : undefined);
const offsetOf = (page: number, limit: number) => (page - 1) * limit;
let cachedItemsHasStockAlert: boolean | null = null;
let cachedItemsCatIdRequired: boolean | null = null;

const hasItemsStockAlertColumn = async (): Promise<boolean> => {
  if (cachedItemsHasStockAlert !== null) return cachedItemsHasStockAlert;
  const row = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'items'
          AND column_name = 'stock_alert'
     ) AS has_column`
  );
  cachedItemsHasStockAlert = Boolean(row?.has_column);
  return cachedItemsHasStockAlert;
};

const isItemsCatIdRequired = async (): Promise<boolean> => {
  if (cachedItemsCatIdRequired !== null) return cachedItemsCatIdRequired;
  const row = await queryOne<{ is_required: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'items'
          AND column_name = 'cat_id'
          AND is_nullable = 'NO'
     ) AS is_required`
  );
  cachedItemsCatIdRequired = Boolean(row?.is_required);
  return cachedItemsCatIdRequired;
};

const ensureDefaultCategory = async (branchId: number): Promise<number> => {
  const existing = await queryOne<{ cat_id: number }>(
    `SELECT cat_id
       FROM ims.categories
      WHERE branch_id = $1
      ORDER BY cat_id
      LIMIT 1`,
    [branchId]
  );
  if (existing?.cat_id) return Number(existing.cat_id);

  const created = await queryOne<{ cat_id: number }>(
    `INSERT INTO ims.categories (branch_id, cat_name, description, is_active)
     VALUES ($1, 'General', 'Auto-created default category', TRUE)
     RETURNING cat_id`,
    [branchId]
  );
  if (!created?.cat_id) throw ApiError.internal('Failed to create default category');
  return Number(created.cat_id);
};

const scopeClause = (
  scope: BranchScope,
  params: unknown[],
  alias: string,
  branchId?: number
) => {
  if (branchId) {
    assertBranchAccess(scope, branchId);
    params.push(branchId);
    return `${alias}.branch_id = $${params.length}`;
  }
  if (!scope.isAdmin) {
    params.push(scope.branchIds);
    return `${alias}.branch_id = ANY($${params.length})`;
  }
  return 'TRUE';
};

const ensureInBranch = async (
  table: 'categories' | 'units' | 'taxes' | 'stores',
  idColumn: string,
  id: number,
  branchId: number,
  label: string
) => {
  const row = await queryOne<{ id: number }>(
    `SELECT ${idColumn} AS id
       FROM ims.${table}
      WHERE ${idColumn} = $1
        AND branch_id = $2`,
    [id, branchId]
  );
  if (!row) throw ApiError.badRequest(`${label} not found in selected branch`);
};

const isActiveValue = (
  input: { isActive?: boolean; status?: string },
  fallback: boolean
) => {
  if (input.isActive !== undefined) return input.isActive;
  if (input.status !== undefined) return input.status !== 'inactive';
  return fallback;
};

const getCategorySql = `
  SELECT
    c.cat_id AS category_id,
    c.branch_id,
    c.cat_name AS name,
    c.description,
    COALESCE(c.is_active, TRUE) AS is_active,
    c.created_at::text AS created_at,
    c.updated_at::text AS updated_at
  FROM ims.categories c
`;

const getUnitSql = `
  SELECT
    u.unit_id,
    u.branch_id,
    u.unit_name,
    u.symbol,
    u.is_active,
    u.created_at::text AS created_at
  FROM ims.units u
`;

const getTaxSql = `
  SELECT
    t.tax_id,
    t.branch_id,
    t.tax_name,
    t.rate_percent,
    t.is_inclusive,
    t.is_active,
    t.created_at::text AS created_at
  FROM ims.taxes t
`;

const getProductSql = (stockAlertExpr: string, storeIdExpr = 'NULL::bigint') => `
  SELECT
    i.item_id AS product_id,
    i.branch_id,
    i.name,
    i.barcode,
    i.barcode AS sku,
    i.store_id,
    s.store_name,
    ${stockAlertExpr} AS stock_alert,
    i.cost_price,
    i.sell_price,
    i.sell_price AS price,
    i.cost_price AS cost,
    COALESCE(sq.qty, 0)::numeric(14,3) AS quantity,
    COALESCE(sq.qty, 0)::numeric(14,3) AS stock,
    i.opening_balance,
    i.is_active,
    CASE WHEN i.is_active THEN 'active' ELSE 'inactive' END AS status,
    NULL::text AS description,
    i.created_at::text AS created_at,
    i.created_at::text AS updated_at
  FROM ims.items i
  LEFT JOIN ims.stores s ON s.store_id = i.store_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS qty
      FROM ims.store_items si
     WHERE si.product_id = i.item_id
       AND si.store_id = COALESCE(
         ${storeIdExpr}::bigint,
         i.store_id,
         (
           SELECT s2.store_id
             FROM ims.stores s2
            WHERE s2.branch_id = i.branch_id
            ORDER BY s2.store_id
            LIMIT 1
         )
       )
  ) sq ON TRUE
`;

const upsertStoreItemQuantity = async (
  client: PoolClient,
  branchId: number,
  storeId: number,
  itemId: number,
  quantity: number
) => {
  const store = await client.query(
    `SELECT store_id
       FROM ims.stores
      WHERE store_id = $1
        AND branch_id = $2`,
    [storeId, branchId]
  );
  if (!store.rows[0]) {
    throw ApiError.badRequest('Store not found in selected branch');
  }

  await client.query(
    `INSERT INTO ims.store_items (store_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id, product_id)
     DO UPDATE
           SET quantity = EXCLUDED.quantity,
               updated_at = NOW()`,
    [storeId, itemId, quantity]
  );
};

export const productsService = {
  async listCategories(scope: BranchScope, filters: MasterFilters): Promise<Paged<Category>> {
    const params: unknown[] = [];
    const where: string[] = [scopeClause(scope, params, 'c', filters.branchId)];
    const q = like(filters.search);
    if (q) {
      params.push(q);
      where.push(`(c.cat_name ILIKE $${params.length} OR COALESCE(c.description, '') ILIKE $${params.length})`);
    }
    if (!filters.includeInactive) where.push('COALESCE(c.is_active, TRUE) = TRUE');

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.categories c WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await queryMany<Category>(
      `${getCategorySql}
       WHERE ${where.join(' AND ')}
       ORDER BY c.cat_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, offsetOf(filters.page, filters.limit)]
    );
    return { rows, total: Number(count?.total || 0), page: filters.page, limit: filters.limit };
  },

  async getCategory(id: number, scope: BranchScope): Promise<Category | null> {
    if (scope.isAdmin) {
      return queryOne<Category>(`${getCategorySql} WHERE c.cat_id = $1`, [id]);
    }
    return queryOne<Category>(
      `${getCategorySql} WHERE c.cat_id = $1 AND c.branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },

  async createCategory(input: CategoryCreateInput, scope: BranchScope): Promise<Category> {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const created = await queryOne<{ cat_id: number }>(
      `INSERT INTO ims.categories (branch_id, cat_name, description, is_active)
       VALUES ($1, $2, NULLIF($3, ''), COALESCE($4, TRUE))
       RETURNING cat_id`,
      [branchId, input.name, input.description || '', input.isActive]
    );
    return (await this.getCategory(Number(created?.cat_id), scope)) as Category;
  },

  async updateCategory(id: number, input: CategoryUpdateInput, scope: BranchScope): Promise<Category | null> {
    const existing = await this.getCategory(id, scope);
    if (!existing) return null;
    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.name !== undefined) { updates.push(`cat_name = $${p++}`); values.push(input.name); }
    if (input.description !== undefined) { updates.push(`description = NULLIF($${p++}, '')`); values.push(input.description || ''); }
    if (input.isActive !== undefined) { updates.push(`is_active = $${p++}`); values.push(input.isActive); }
    updates.push('updated_at = NOW()');
    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.categories SET ${updates.join(', ')} WHERE cat_id = $1`, values);
    } else {
      values.push(scope.branchIds);
      await queryOne(`UPDATE ims.categories SET ${updates.join(', ')} WHERE cat_id = $1 AND branch_id = ANY($${p})`, values);
    }
    return this.getCategory(id, scope);
  },

  async deleteCategory(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.categories WHERE cat_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.categories WHERE cat_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async listUnits(scope: BranchScope, filters: MasterFilters): Promise<Paged<Unit>> {
    const params: unknown[] = [];
    const where: string[] = [scopeClause(scope, params, 'u', filters.branchId)];
    const q = like(filters.search);
    if (q) {
      params.push(q);
      where.push(`(u.unit_name ILIKE $${params.length} OR COALESCE(u.symbol, '') ILIKE $${params.length})`);
    }
    if (!filters.includeInactive) where.push('u.is_active = TRUE');

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.units u WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await queryMany<Unit>(
      `${getUnitSql}
       WHERE ${where.join(' AND ')}
       ORDER BY u.unit_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, offsetOf(filters.page, filters.limit)]
    );
    return { rows, total: Number(count?.total || 0), page: filters.page, limit: filters.limit };
  },

  async getUnit(id: number, scope: BranchScope): Promise<Unit | null> {
    if (scope.isAdmin) return queryOne<Unit>(`${getUnitSql} WHERE u.unit_id = $1`, [id]);
    return queryOne<Unit>(`${getUnitSql} WHERE u.unit_id = $1 AND u.branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async createUnit(input: UnitCreateInput, scope: BranchScope): Promise<Unit> {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const created = await queryOne<{ unit_id: number }>(
      `INSERT INTO ims.units (branch_id, unit_name, symbol, is_active)
       VALUES ($1, $2, NULLIF($3, ''), COALESCE($4, TRUE))
       RETURNING unit_id`,
      [branchId, input.unitName, input.symbol || '', input.isActive]
    );
    return (await this.getUnit(Number(created?.unit_id), scope)) as Unit;
  },

  async updateUnit(id: number, input: UnitUpdateInput, scope: BranchScope): Promise<Unit | null> {
    const existing = await this.getUnit(id, scope);
    if (!existing) return null;
    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.unitName !== undefined) { updates.push(`unit_name = $${p++}`); values.push(input.unitName); }
    if (input.symbol !== undefined) { updates.push(`symbol = NULLIF($${p++}, '')`); values.push(input.symbol || ''); }
    if (input.isActive !== undefined) { updates.push(`is_active = $${p++}`); values.push(input.isActive); }
    if (!updates.length) return existing;
    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.units SET ${updates.join(', ')} WHERE unit_id = $1`, values);
    } else {
      values.push(scope.branchIds);
      await queryOne(`UPDATE ims.units SET ${updates.join(', ')} WHERE unit_id = $1 AND branch_id = ANY($${p})`, values);
    }
    return this.getUnit(id, scope);
  },

  async deleteUnit(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.units WHERE unit_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.units WHERE unit_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async listTaxes(scope: BranchScope, filters: MasterFilters): Promise<Paged<Tax>> {
    const params: unknown[] = [];
    const where: string[] = [scopeClause(scope, params, 't', filters.branchId)];
    const q = like(filters.search);
    if (q) {
      params.push(q);
      where.push(`t.tax_name ILIKE $${params.length}`);
    }
    if (!filters.includeInactive) where.push('t.is_active = TRUE');

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.taxes t WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await queryMany<Tax>(
      `${getTaxSql}
       WHERE ${where.join(' AND ')}
       ORDER BY t.tax_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, offsetOf(filters.page, filters.limit)]
    );
    return { rows, total: Number(count?.total || 0), page: filters.page, limit: filters.limit };
  },

  async getTax(id: number, scope: BranchScope): Promise<Tax | null> {
    if (scope.isAdmin) return queryOne<Tax>(`${getTaxSql} WHERE t.tax_id = $1`, [id]);
    return queryOne<Tax>(`${getTaxSql} WHERE t.tax_id = $1 AND t.branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async createTax(input: TaxCreateInput, scope: BranchScope): Promise<Tax> {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const created = await queryOne<{ tax_id: number }>(
      `INSERT INTO ims.taxes (branch_id, tax_name, rate_percent, is_inclusive, is_active)
       VALUES ($1, $2, $3, COALESCE($4, FALSE), COALESCE($5, TRUE))
       RETURNING tax_id`,
      [branchId, input.taxName, input.ratePercent, input.isInclusive, input.isActive]
    );
    return (await this.getTax(Number(created?.tax_id), scope)) as Tax;
  },

  async updateTax(id: number, input: TaxUpdateInput, scope: BranchScope): Promise<Tax | null> {
    const existing = await this.getTax(id, scope);
    if (!existing) return null;
    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.taxName !== undefined) { updates.push(`tax_name = $${p++}`); values.push(input.taxName); }
    if (input.ratePercent !== undefined) { updates.push(`rate_percent = $${p++}`); values.push(input.ratePercent); }
    if (input.isInclusive !== undefined) { updates.push(`is_inclusive = $${p++}`); values.push(input.isInclusive); }
    if (input.isActive !== undefined) { updates.push(`is_active = $${p++}`); values.push(input.isActive); }
    if (!updates.length) return existing;
    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.taxes SET ${updates.join(', ')} WHERE tax_id = $1`, values);
    } else {
      values.push(scope.branchIds);
      await queryOne(`UPDATE ims.taxes SET ${updates.join(', ')} WHERE tax_id = $1 AND branch_id = ANY($${p})`, values);
    }
    return this.getTax(id, scope);
  },

  async deleteTax(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.taxes WHERE tax_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.taxes WHERE tax_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async listProducts(scope: BranchScope, filters: ProductFilters): Promise<Paged<Product>> {
    const stockAlertExpr = (await hasItemsStockAlertColumn()) ? 'i.stock_alert' : 'COALESCE(i.reorder_level, 5)';
    const params: unknown[] = [];
    const where: string[] = [scopeClause(scope, params, 'i', filters.branchId)];
    const q = like(filters.search);
    if (q) {
      params.push(q);
      where.push(`(i.name ILIKE $${params.length} OR COALESCE(i.barcode, '') ILIKE $${params.length})`);
    }
    if (!filters.includeInactive) where.push('i.is_active = TRUE');

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.items i WHERE ${where.join(' AND ')}`,
      params
    );

    const dataParams = [...params];
    const storeQtyParam = filters.storeId ? `$${dataParams.push(filters.storeId)}` : 'NULL::bigint';
    const rows = await queryMany<Product>(
      `${getProductSql(stockAlertExpr, storeQtyParam)}
       WHERE ${where.join(' AND ')}
       ORDER BY i.name
       LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`,
      [...dataParams, filters.limit, offsetOf(filters.page, filters.limit)]
    );
    return { rows, total: Number(count?.total || 0), page: filters.page, limit: filters.limit };
  },

  async getProduct(id: number, scope: BranchScope, storeId?: number): Promise<Product | null> {
    const stockAlertExpr = (await hasItemsStockAlertColumn()) ? 'i.stock_alert' : 'COALESCE(i.reorder_level, 5)';
    if (scope.isAdmin) {
      const params: unknown[] = [id];
      const storeExpr = storeId ? `$${params.push(storeId)}` : 'NULL::bigint';
      return queryOne<Product>(`${getProductSql(stockAlertExpr, storeExpr)} WHERE i.item_id = $1`, params);
    }
    const params: unknown[] = [id, scope.branchIds];
    const storeExpr = storeId ? `$${params.push(storeId)}` : 'NULL::bigint';
    return queryOne<Product>(
      `${getProductSql(stockAlertExpr, storeExpr)} WHERE i.item_id = $1 AND i.branch_id = ANY($2)`,
      params
    );
  },

  async createProduct(input: ProductCreateInput, scope: BranchScope): Promise<Product> {
    const catIdRequired = await isItemsCatIdRequired();
    const stockAlertColumn = (await hasItemsStockAlertColumn()) ? 'stock_alert' : 'reorder_level';
    const branchId = pickBranchForWrite(scope, input.branchId);
    if (input.storeId) await ensureInBranch('stores', 'store_id', input.storeId, branchId, 'Store');
    const categoryId = catIdRequired ? await ensureDefaultCategory(branchId) : null;

    const openingBalance = input.openingBalance ?? 0;
    const active = isActiveValue(input, true);
    const createdId = await withTransaction(async (client) => {
      const created = await client.query<{ item_id: number }>(
        `INSERT INTO ims.items (
           branch_id, ${catIdRequired ? 'cat_id, ' : ''}store_id, name, barcode, ${stockAlertColumn}, opening_balance, cost_price, sell_price, is_active
         ) VALUES (
           $1, ${catIdRequired ? '$2, ' : ''}$${catIdRequired ? 3 : 2}, $${catIdRequired ? 4 : 3}, NULLIF($${catIdRequired ? 5 : 4}, ''), $${catIdRequired ? 6 : 5}, $${catIdRequired ? 7 : 6}, $${catIdRequired ? 8 : 7}, $${catIdRequired ? 9 : 8}, $${catIdRequired ? 10 : 9}
         )
         RETURNING item_id`,
        catIdRequired
          ? [
              branchId,
              categoryId,
              input.storeId ?? null,
              input.name,
              input.barcode || '',
              input.stockAlert ?? 5,
              openingBalance,
              input.costPrice ?? 0,
              input.sellPrice ?? 0,
              active,
            ]
          : [
              branchId,
              input.storeId ?? null,
              input.name,
              input.barcode || '',
              input.stockAlert ?? 5,
              openingBalance,
              input.costPrice ?? 0,
              input.sellPrice ?? 0,
              active,
            ]
      );
      const itemId = Number(created.rows[0]?.item_id || 0);
      if (!itemId) {
        throw ApiError.internal('Failed to create item');
      }

      if (input.storeId) {
        const quantity = Number(input.quantity ?? input.openingBalance ?? 0);
        await upsertStoreItemQuantity(client, branchId, input.storeId, itemId, quantity);
      }
      return itemId;
    });

    return (await this.getProduct(createdId, scope, input.storeId ?? undefined)) as Product;
  },

  async updateProduct(id: number, input: ProductUpdateInput, scope: BranchScope): Promise<Product | null> {
    const stockAlertColumn = (await hasItemsStockAlertColumn()) ? 'stock_alert' : 'reorder_level';
    const current = scope.isAdmin
      ? await queryOne<{ item_id: number; branch_id: number; store_id: number | null }>(
          `SELECT item_id, branch_id, store_id FROM ims.items WHERE item_id = $1`,
          [id]
        )
      : await queryOne<{ item_id: number; branch_id: number; store_id: number | null }>(
          `SELECT item_id, branch_id, store_id FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2)`,
          [id, scope.branchIds]
        );
    if (!current) return null;

    if (input.storeId !== undefined && input.storeId !== null) await ensureInBranch('stores', 'store_id', input.storeId, current.branch_id, 'Store');

    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.name !== undefined) { updates.push(`name = $${p++}`); values.push(input.name); }
    if (input.barcode !== undefined) { updates.push(`barcode = NULLIF($${p++}, '')`); values.push(input.barcode || ''); }
    if (input.storeId !== undefined) { updates.push(`store_id = $${p++}`); values.push(input.storeId ?? null); }
    if (input.stockAlert !== undefined) { updates.push(`${stockAlertColumn} = $${p++}`); values.push(input.stockAlert); }
    if (input.sellPrice !== undefined) { updates.push(`sell_price = $${p++}`); values.push(input.sellPrice); }
    if (input.costPrice !== undefined) { updates.push(`cost_price = $${p++}`); values.push(input.costPrice); }
    if (input.openingBalance !== undefined) { updates.push(`opening_balance = $${p++}`); values.push(input.openingBalance); }
    if (input.isActive !== undefined || input.status !== undefined) { updates.push(`is_active = $${p++}`); values.push(isActiveValue(input, true)); }
    const hasQuantityUpdate = input.quantity !== undefined;
    if (!updates.length && !hasQuantityUpdate) return this.getProduct(id, scope, current.store_id ?? undefined);

    await withTransaction(async (client) => {
      if (updates.length) {
        if (scope.isAdmin) {
          await client.query(`UPDATE ims.items SET ${updates.join(', ')} WHERE item_id = $1`, values);
        } else {
          values.push(scope.branchIds);
          await client.query(`UPDATE ims.items SET ${updates.join(', ')} WHERE item_id = $1 AND branch_id = ANY($${p})`, values);
        }
      }

      const targetStoreId = input.storeId !== undefined ? input.storeId : current.store_id;
      if (!targetStoreId && input.quantity !== undefined) {
        throw ApiError.badRequest('Store is required when updating quantity');
      }
      if (targetStoreId && input.quantity !== undefined) {
        await upsertStoreItemQuantity(client, current.branch_id, targetStoreId, id, Number(input.quantity));
      }
    });

    const outputStoreId = input.storeId !== undefined ? (input.storeId ?? undefined) : (current.store_id ?? undefined);
    return this.getProduct(id, scope, outputStoreId);
  },

  async deleteProduct(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.items WHERE item_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },
};
