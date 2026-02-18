import { queryMany, queryOne } from '../../db/query';
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
  sku: string | null;
  category_id: number | null;
  category_name?: string | null;
  unit_id: number | null;
  unit_name?: string | null;
  unit_symbol?: string | null;
  tax_id: number | null;
  tax_name?: string | null;
  tax_rate_percent?: number | null;
  tax_is_inclusive?: boolean | null;
  store_id: number | null;
  store_name?: string | null;
  price: number;
  cost: number;
  stock: number;
  opening_balance: number;
  is_active: boolean;
  status: string;
  reorder_level: number;
  reorder_qty: number;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

const like = (v?: string) => (v?.trim() ? `%${v.trim()}%` : undefined);
const offsetOf = (page: number, limit: number) => (page - 1) * limit;

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

const getProductSql = `
  WITH stock_totals AS (
    SELECT ws.item_id, COALESCE(SUM(ws.quantity), 0)::numeric(14,3) AS qty
      FROM ims.warehouse_stock ws
     GROUP BY ws.item_id
  )
  SELECT
    i.item_id AS product_id,
    i.branch_id,
    i.name,
    i.barcode AS sku,
    i.cat_id AS category_id,
    c.cat_name AS category_name,
    i.unit_id,
    u.unit_name,
    u.symbol AS unit_symbol,
    i.tax_id,
    t.tax_name,
    t.rate_percent AS tax_rate_percent,
    t.is_inclusive AS tax_is_inclusive,
    i.store_id,
    s.store_name,
    i.sell_price AS price,
    i.cost_price AS cost,
    COALESCE(st.qty, i.opening_balance, 0)::numeric(14,3) AS stock,
    i.opening_balance,
    i.is_active,
    CASE WHEN i.is_active THEN 'active' ELSE 'inactive' END AS status,
    i.reorder_level,
    i.reorder_qty,
    NULL::text AS description,
    i.created_at::text AS created_at,
    i.created_at::text AS updated_at
  FROM ims.items i
  LEFT JOIN ims.categories c ON c.cat_id = i.cat_id
  LEFT JOIN ims.units u ON u.unit_id = i.unit_id
  LEFT JOIN ims.taxes t ON t.tax_id = i.tax_id
  LEFT JOIN ims.stores s ON s.store_id = i.store_id
  LEFT JOIN stock_totals st ON st.item_id = i.item_id
`;

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
    const params: unknown[] = [];
    const where: string[] = [scopeClause(scope, params, 'i', filters.branchId)];
    const q = like(filters.search);
    if (q) {
      params.push(q);
      where.push(`(i.name ILIKE $${params.length} OR COALESCE(i.barcode, '') ILIKE $${params.length})`);
    }
    if (filters.categoryId) { params.push(filters.categoryId); where.push(`i.cat_id = $${params.length}`); }
    if (filters.unitId) { params.push(filters.unitId); where.push(`i.unit_id = $${params.length}`); }
    if (filters.taxId) { params.push(filters.taxId); where.push(`i.tax_id = $${params.length}`); }
    if (filters.storeId) { params.push(filters.storeId); where.push(`i.store_id = $${params.length}`); }
    if (!filters.includeInactive) where.push('i.is_active = TRUE');

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.items i WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await queryMany<Product>(
      `${getProductSql}
       WHERE ${where.join(' AND ')}
       ORDER BY i.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, offsetOf(filters.page, filters.limit)]
    );
    return { rows, total: Number(count?.total || 0), page: filters.page, limit: filters.limit };
  },

  async getProduct(id: number, scope: BranchScope): Promise<Product | null> {
    if (scope.isAdmin) return queryOne<Product>(`${getProductSql} WHERE i.item_id = $1`, [id]);
    return queryOne<Product>(`${getProductSql} WHERE i.item_id = $1 AND i.branch_id = ANY($2)`, [id, scope.branchIds]);
  },

  async createProduct(input: ProductCreateInput, scope: BranchScope): Promise<Product> {
    const branchId = pickBranchForWrite(scope, input.branchId);
    await ensureInBranch('categories', 'cat_id', input.categoryId, branchId, 'Category');
    if (input.unitId) await ensureInBranch('units', 'unit_id', input.unitId, branchId, 'Unit');
    if (input.taxId) await ensureInBranch('taxes', 'tax_id', input.taxId, branchId, 'Tax');
    if (input.storeId) await ensureInBranch('stores', 'store_id', input.storeId, branchId, 'Store');

    const openingBalance = input.openingBalance ?? input.stock ?? 0;
    const active = isActiveValue(input, true);
    const created = await queryOne<{ item_id: number }>(
      `INSERT INTO ims.items (
         branch_id, cat_id, unit_id, tax_id, store_id, name, barcode,
         reorder_level, reorder_qty, opening_balance, cost_price, sell_price, is_active
       ) VALUES (
         $1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8, $9, $10, $11, $12, $13
       )
       RETURNING item_id`,
      [
        branchId,
        input.categoryId,
        input.unitId ?? null,
        input.taxId ?? null,
        input.storeId ?? null,
        input.name,
        input.sku || '',
        input.reorderLevel ?? 0,
        input.reorderQty ?? 0,
        openingBalance,
        input.cost ?? 0,
        input.price ?? 0,
        active,
      ]
    );
    return (await this.getProduct(Number(created?.item_id), scope)) as Product;
  },

  async updateProduct(id: number, input: ProductUpdateInput, scope: BranchScope): Promise<Product | null> {
    const current = scope.isAdmin
      ? await queryOne<{ item_id: number; branch_id: number }>(`SELECT item_id, branch_id FROM ims.items WHERE item_id = $1`, [id])
      : await queryOne<{ item_id: number; branch_id: number }>(
          `SELECT item_id, branch_id FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2)`,
          [id, scope.branchIds]
        );
    if (!current) return null;

    if (input.categoryId !== undefined) await ensureInBranch('categories', 'cat_id', input.categoryId, current.branch_id, 'Category');
    if (input.unitId !== undefined && input.unitId !== null) await ensureInBranch('units', 'unit_id', input.unitId, current.branch_id, 'Unit');
    if (input.taxId !== undefined && input.taxId !== null) await ensureInBranch('taxes', 'tax_id', input.taxId, current.branch_id, 'Tax');
    if (input.storeId !== undefined && input.storeId !== null) await ensureInBranch('stores', 'store_id', input.storeId, current.branch_id, 'Store');

    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.name !== undefined) { updates.push(`name = $${p++}`); values.push(input.name); }
    if (input.sku !== undefined) { updates.push(`barcode = NULLIF($${p++}, '')`); values.push(input.sku || ''); }
    if (input.categoryId !== undefined) { updates.push(`cat_id = $${p++}`); values.push(input.categoryId); }
    if (input.unitId !== undefined) { updates.push(`unit_id = $${p++}`); values.push(input.unitId ?? null); }
    if (input.taxId !== undefined) { updates.push(`tax_id = $${p++}`); values.push(input.taxId ?? null); }
    if (input.storeId !== undefined) { updates.push(`store_id = $${p++}`); values.push(input.storeId ?? null); }
    if (input.price !== undefined) { updates.push(`sell_price = $${p++}`); values.push(input.price); }
    if (input.cost !== undefined) { updates.push(`cost_price = $${p++}`); values.push(input.cost); }
    if (input.reorderLevel !== undefined) { updates.push(`reorder_level = $${p++}`); values.push(input.reorderLevel); }
    if (input.reorderQty !== undefined) { updates.push(`reorder_qty = $${p++}`); values.push(input.reorderQty); }
    if (input.openingBalance !== undefined || input.stock !== undefined) { updates.push(`opening_balance = $${p++}`); values.push(input.openingBalance ?? input.stock ?? 0); }
    if (input.isActive !== undefined || input.status !== undefined) { updates.push(`is_active = $${p++}`); values.push(isActiveValue(input, true)); }
    if (!updates.length) return this.getProduct(id, scope);

    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.items SET ${updates.join(', ')} WHERE item_id = $1`, values);
    } else {
      values.push(scope.branchIds);
      await queryOne(`UPDATE ims.items SET ${updates.join(', ')} WHERE item_id = $1 AND branch_id = ANY($${p})`, values);
    }
    return this.getProduct(id, scope);
  },

  async deleteProduct(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.items WHERE item_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },
};
