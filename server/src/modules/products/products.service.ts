import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { PoolClient } from 'pg';
import { ApiError } from '../../utils/ApiError';
import {
  BranchScope,
  assertBranchAccess,
  pickBranchForWrite,
} from '../../utils/branchScope';
import { ensureCoaAccounts } from '../../utils/coaDefaults';
import { postGl, deleteGlByRef } from '../../utils/glPosting';
import { softDeleteById } from '../../db/softDelete';
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
import {
  DEFAULT_CATEGORIES_BY_BUSINESS_TYPE,
  isKnownAttributeKey,
  splitAttributes,
} from '../../config/productAttributes';

type MasterFilters = {
  search?: string;
  branchId?: number;
  includeInactive?: boolean;
  fromDate?: string;
  toDate?: string;
  page: number;
  limit: number;
};

type ProductFilters = MasterFilters & {
  categoryId?: number;
  unitId?: number;
  taxId?: number;
  storeId?: number;
  stockStatus?: 'in_stock' | 'low_stock' | 'no_stock';
};

type Paged<T> = { rows: T[]; total: number; page: number; limit: number };

export interface Category {
  category_id: number;
  branch_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  attribute_keys: string[];
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
  category_id: number | null;
  category_name?: string | null;
  unit_id: number | null;
  unit_name?: string | null;
  unit_symbol?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  serial_number?: string | null;
  attributes?: Record<string, string | number>;
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
  image_url?: string | null;
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
    return `${alias}.branch_id = ANY($${params.length}::bigint[])`;
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
    COALESCE(c.attribute_keys, ARRAY[]::text[]) AS attribute_keys,
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
    i.category_id,
    c.cat_name AS category_name,
    i.unit_id,
    u.unit_name,
    u.symbol AS unit_symbol,
    i.brand,
    i.size,
    i.color,
    i.generic_name,
    i.strength,
    i.serial_number,
    COALESCE(i.attributes, '{}'::jsonb) AS attributes,
    ${stockAlertExpr} AS stock_alert,
    i.cost_price,
    i.sell_price,
    i.sell_price AS price,
    i.cost_price AS cost,
    CASE
      WHEN COALESCE(sq.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
      ELSE COALESCE(sq.qty, 0)
    END::int AS quantity,
    CASE
      WHEN COALESCE(sq.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
      ELSE COALESCE(sq.qty, 0)
    END::int AS stock,
    i.opening_balance,
    i.is_active,
    CASE WHEN i.is_active THEN 'active' ELSE 'inactive' END AS status,
    NULL::text AS description,
    i.image_url,
    i.created_at::text AS created_at,
    i.created_at::text AS updated_at
  FROM ims.items i
  LEFT JOIN ims.stores s ON s.store_id = i.store_id
  LEFT JOIN ims.categories c ON c.cat_id = i.category_id
  LEFT JOIN ims.units u ON u.unit_id = i.unit_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(si.quantity), 0)::int AS qty,
      COUNT(*)::int AS row_count
      FROM ims.store_items si
      JOIN ims.stores s2 ON s2.store_id = si.store_id
     WHERE si.product_id = i.item_id
       AND s2.branch_id = i.branch_id
       AND (
         ${storeIdExpr} IS NULL
         OR si.store_id = ${storeIdExpr}
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

const getOrCreateDefaultStoreId = async (client: PoolClient, branchId: number): Promise<number> => {
  const existing = await client.query<{ store_id: number }>(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
      ORDER BY CASE WHEN LOWER(store_name) = 'main store' THEN 0 ELSE 1 END, store_id
      LIMIT 1`,
    [branchId]
  );
  const storeId = Number(existing.rows[0]?.store_id || 0);
  if (storeId > 0) return storeId;

  const created = await client.query<{ store_id: number }>(
    `INSERT INTO ims.stores (branch_id, store_name, store_code, is_active)
     VALUES ($1::bigint, 'Main Store', 'MAIN-' || LPAD($1::bigint::text, 3, '0'), TRUE)
     ON CONFLICT (branch_id, store_name)
     DO UPDATE SET is_active = TRUE
     RETURNING store_id`,
    [branchId]
  );
  const createdId = Number(created.rows[0]?.store_id || 0);
  if (!createdId) throw ApiError.internal('Failed to create default Main Store');
  return createdId;
};

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

// Opening stock (opening_balance * cost_price) must be reflected in the GL as an
// Inventory asset, otherwise the Balance Sheet's Inventory figure only reflects
// stock movements recorded after item creation and silently omits any starting
// stock - understating Inventory (and Equity) by however much stock was on hand
// when the item was set up.
// postGl() only writes ims.account_transactions - callers outside the normal payment/receipt
// flows (like this one) must also keep ims.accounts.balance in sync themselves, since several
// other code paths (e.g. the "pay expense charge"/"receive payment" account pickers) validate
// against that cached column directly rather than recomputing from the ledger.
const reverseAccountBalanceForRef = async (
  client: PoolClient,
  params: { branchId: number; refTable: string; refId: number }
) => {
  // H4 fix: this previously assumed debit-increases (asset/expense/cost) for
  // every account it reversed. For liability/equity/revenue accounts, credit
  // is what increases balance, so reversing must flip that sign too - not
  // doing so meant a re-post of an equity-side line (e.g. Opening Balance
  // Equity) double-added instead of correcting itself.
  const previous = await client.query<{ acc_id: number; debit: string; credit: string; account_type: string }>(
    `SELECT t.acc_id, COALESCE(t.debit, 0)::text AS debit, COALESCE(t.credit, 0)::text AS credit, a.account_type
       FROM ims.account_transactions t
       JOIN ims.accounts a ON a.acc_id = t.acc_id
      WHERE t.branch_id = $1 AND t.ref_table = $2 AND t.ref_id = $3 AND COALESCE(t.is_deleted, 0) = 0`,
    [params.branchId, params.refTable, params.refId]
  );
  for (const row of previous.rows) {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    const creditIncreases = row.account_type === 'liability' || row.account_type === 'equity' || row.account_type === 'revenue';
    const originalDelta = creditIncreases ? credit - debit : debit - credit;
    const delta = -originalDelta;
    if (delta) {
      await client.query(
        `UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`,
        [delta, Number(row.acc_id), params.branchId]
      );
    }
  }
};

const rewriteItemOpeningStockGl = async (
  client: PoolClient,
  params: { branchId: number; itemId: number; itemName: string; openingBalance: number; costPrice: number }
) => {
  await reverseAccountBalanceForRef(client, { branchId: params.branchId, refTable: 'items', refId: params.itemId });
  await deleteGlByRef(client, { branchId: params.branchId, refTable: 'items', refId: params.itemId });
  const value = roundMoney(Number(params.openingBalance || 0) * Number(params.costPrice || 0));
  if (value <= 0) return;
  const coa = await ensureCoaAccounts(client, params.branchId, ['inventory', 'openingBalanceEquity']);
  await postGl(client, {
    branchId: params.branchId,
    refTable: 'items',
    refId: params.itemId,
    note: `Opening stock: ${params.itemName}`,
    lines: [
      { accId: coa.inventory, debit: value, note: 'Opening stock' },
      { accId: coa.openingBalanceEquity, credit: value, note: 'Opening stock' },
    ],
  });
  await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
    value,
    coa.inventory,
    params.branchId,
  ]);
  // H4 fix: the Opening Balance Equity credit above was never mirrored into
  // accounts.balance (only reverseAccountBalanceForRef, called earlier in this
  // function, ever reduced it back out on a re-run - nothing added the new
  // value back in). Opening Balance Equity is an equity account (credit
  // increases it), matching the amount just posted above.
  await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
    value,
    coa.openingBalanceEquity,
    params.branchId,
  ]);
};

// Phase 3 (Central Delete Architecture): deleteProduct below now soft-deletes
// via ims.sp_soft_delete, which lets a product with real sale/purchase/return
// history be archived (that history is 'preserve'd, untouched - see
// server/sql/20260922b_product_delete_policy.sql). The one thing the generic
// policy engine can't express is "on-hand quantity must be zero" - it only
// knows whether a dependent row exists, not its quantity - so that stays a
// manual pre-check here, kept deliberately narrow to just the two tables
// that track current stock (not history: sale_items/purchase_items/etc are
// intentionally excluded).
const getProductStockOnHand = async (client: PoolClient, itemId: number): Promise<number> => {
  const result = await client.query<{ total: string }>(
    `SELECT (
       COALESCE((SELECT SUM(quantity) FROM ims.store_items WHERE product_id = $1 AND COALESCE(is_deleted, 0) = 0), 0)
       + COALESCE((SELECT SUM(quantity) FROM ims.warehouse_stock WHERE item_id = $1 AND COALESCE(is_deleted, 0) = 0), 0)
     )::text AS total`,
    [itemId]
  );
  return Number(result.rows[0]?.total || 0);
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
    if (filters.fromDate) {
      params.push(filters.fromDate);
      where.push(`c.created_at::date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      where.push(`c.created_at::date <= $${params.length}::date`);
    }

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
      `${getCategorySql} WHERE c.cat_id = $1 AND c.branch_id = ANY($2::bigint[])`,
      [id, scope.branchIds]
    );
  },

  // Phase 9: used by Excel export to resolve which attribute_keys are in
  // play across a batch of products' categories in one query.
  async getCategoriesByIds(ids: number[]): Promise<Category[]> {
    if (!ids.length) return [];
    return queryMany<Category>(`${getCategorySql} WHERE c.cat_id = ANY($1::bigint[])`, [ids]);
  },

  async createCategory(input: CategoryCreateInput, scope: BranchScope): Promise<Category> {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const attributeKeys = (input.attributeKeys || []).filter(isKnownAttributeKey);
    const created = await queryOne<{ cat_id: number }>(
      `INSERT INTO ims.categories (branch_id, cat_name, description, is_active, attribute_keys)
       VALUES ($1, $2, NULLIF($3, ''), COALESCE($4, TRUE), $5::text[])
       RETURNING cat_id`,
      [branchId, input.name, input.description || '', input.isActive, attributeKeys]
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
    if (input.attributeKeys !== undefined) {
      updates.push(`attribute_keys = $${p++}::text[]`);
      values.push(input.attributeKeys.filter(isKnownAttributeKey));
    }
    updates.push('updated_at = NOW()');
    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.categories SET ${updates.join(', ')} WHERE cat_id = $1`, values);
    } else {
      values.push(scope.branchIds);
      await queryOne(
        `UPDATE ims.categories SET ${updates.join(', ')} WHERE cat_id = $1 AND branch_id = ANY($${p}::bigint[])`,
        values
      );
    }
    return this.getCategory(id, scope);
  },

  async deleteCategory(id: number, scope: BranchScope): Promise<void> {
    // Delete-protection audit (Phase 10 Batch 1, Finding F3): items.category_id
    // is ON DELETE SET NULL, so this used to succeed silently and orphan
    // every product in the category (no error, no history destroyed, but a
    // real data-integrity surprise). Block instead, same pattern as products'
    // own delete-block check.
    const inUse = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.items WHERE category_id = $1`,
      [id]
    );
    const productCount = Number(inUse?.total || 0);
    if (productCount > 0) {
      throw ApiError.conflict('Cannot delete category with products assigned to it.', {
        code: 'RECORD_HAS_TRANSACTIONS',
        dependencies: { products: productCount },
      });
    }
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.categories WHERE cat_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.categories WHERE cat_id = $1 AND branch_id = ANY($2::bigint[])`, [id, scope.branchIds]);
  },

  // Phase 9: on-demand starter categories for a business type (electronics,
  // supermarket, clothing, pharmacy, perfume, cosmetics - see
  // DEFAULT_CATEGORIES_BY_BUSINESS_TYPE; general/other have none). Additive
  // and idempotent (ON CONFLICT on the existing branch+name unique
  // constraint), never runs automatically on a business-type switch - the
  // user triggers it explicitly from Settings/Products, so it never
  // clutters a branch that already has its own category list.
  async seedDefaultCategories(businessType: string, scope: BranchScope, branchId?: number): Promise<Category[]> {
    const defaults = DEFAULT_CATEGORIES_BY_BUSINESS_TYPE[businessType];
    if (!defaults?.length) return [];
    const targetBranchId = pickBranchForWrite(scope, branchId);
    const created: Category[] = [];
    for (const def of defaults) {
      const row = await queryOne<{ cat_id: number }>(
        `INSERT INTO ims.categories (branch_id, cat_name, description, is_active, attribute_keys)
         VALUES ($1, $2, $3, TRUE, $4::text[])
         ON CONFLICT (branch_id, cat_name) DO NOTHING
         RETURNING cat_id`,
        [targetBranchId, def.name, `${businessType} starter category`, def.attributeKeys]
      );
      if (row?.cat_id) {
        const category = await this.getCategory(Number(row.cat_id), scope);
        if (category) created.push(category);
      }
    }
    return created;
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
    if (filters.fromDate) {
      params.push(filters.fromDate);
      where.push(`u.created_at::date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      where.push(`u.created_at::date <= $${params.length}::date`);
    }

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
    return queryOne<Unit>(`${getUnitSql} WHERE u.unit_id = $1 AND u.branch_id = ANY($2::bigint[])`, [id, scope.branchIds]);
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
      await queryOne(`UPDATE ims.units SET ${updates.join(', ')} WHERE unit_id = $1 AND branch_id = ANY($${p}::bigint[])`, values);
    }
    return this.getUnit(id, scope);
  },

  async deleteUnit(id: number, scope: BranchScope): Promise<void> {
    // Delete-protection audit (Phase 10 Batch 1, Finding F3): items.unit_id
    // is ON DELETE SET NULL - same silent-orphan risk as deleteCategory above.
    const inUse = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.items WHERE unit_id = $1`,
      [id]
    );
    const productCount = Number(inUse?.total || 0);
    if (productCount > 0) {
      throw ApiError.conflict('Cannot delete unit with products assigned to it.', {
        code: 'RECORD_HAS_TRANSACTIONS',
        dependencies: { products: productCount },
      });
    }
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.units WHERE unit_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.units WHERE unit_id = $1 AND branch_id = ANY($2::bigint[])`, [id, scope.branchIds]);
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
    if (filters.fromDate) {
      params.push(filters.fromDate);
      where.push(`t.created_at::date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      where.push(`t.created_at::date <= $${params.length}::date`);
    }

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
    return queryOne<Tax>(`${getTaxSql} WHERE t.tax_id = $1 AND t.branch_id = ANY($2::bigint[])`, [id, scope.branchIds]);
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
      await queryOne(`UPDATE ims.taxes SET ${updates.join(', ')} WHERE tax_id = $1 AND branch_id = ANY($${p}::bigint[])`, values);
    }
    return this.getTax(id, scope);
  },

  async deleteTax(id: number, scope: BranchScope): Promise<void> {
    // Delete-protection audit (Phase 10 Batch 1, Finding F3): sales.tax_id is
    // ON DELETE SET NULL - would silently detach the tax used on historical
    // sales. Block instead.
    const inUse = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.sales WHERE tax_id = $1`,
      [id]
    );
    const salesCount = Number(inUse?.total || 0);
    if (salesCount > 0) {
      throw ApiError.conflict('Cannot delete tax used on existing sales.', {
        code: 'RECORD_HAS_TRANSACTIONS',
        dependencies: { sales: salesCount },
      });
    }
    if (scope.isAdmin) await queryOne(`DELETE FROM ims.taxes WHERE tax_id = $1`, [id]);
    else await queryOne(`DELETE FROM ims.taxes WHERE tax_id = $1 AND branch_id = ANY($2::bigint[])`, [id, scope.branchIds]);
  },

  // Powers the Items page's summary cards (Total/In Stock/Low Stock/No Stock). Current
  // quantity per item mirrors the same store_items-with-opening-balance-fallback logic
  // getProductSql uses, so these counts stay consistent with what the list itself shows.
  async getProductsSummary(
    scope: BranchScope,
    branchId?: number
  ): Promise<{ total: number; inStock: number; lowStock: number; noStock: number }> {
    const stockAlertExpr = (await hasItemsStockAlertColumn()) ? 'i.stock_alert' : 'COALESCE(i.reorder_level, 5)';
    const params: unknown[] = [];
    const where = scopeClause(scope, params, 'i', branchId);
    const row = await queryOne<{ total: string; in_stock: string; low_stock: string; no_stock: string }>(
      `WITH item_stock AS (
         SELECT
           ${stockAlertExpr}::numeric AS stock_alert,
           CASE
             WHEN COALESCE(sq.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
             ELSE COALESCE(sq.qty, 0)
           END::numeric AS quantity
           FROM ims.items i
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(SUM(si.quantity), 0)::numeric AS qty,
               COUNT(*)::int AS row_count
               FROM ims.store_items si
               JOIN ims.stores s2 ON s2.store_id = si.store_id
              WHERE si.product_id = i.item_id
                AND s2.branch_id = i.branch_id
           ) sq ON TRUE
          WHERE ${where}
            AND i.is_active = TRUE
       )
       SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE quantity > stock_alert)::text AS in_stock,
         COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= stock_alert)::text AS low_stock,
         COUNT(*) FILTER (WHERE quantity <= 0)::text AS no_stock
         FROM item_stock`,
      params
    );
    return {
      total: Number(row?.total || 0),
      inStock: Number(row?.in_stock || 0),
      lowStock: Number(row?.low_stock || 0),
      noStock: Number(row?.no_stock || 0),
    };
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
    if (filters.categoryId) {
      params.push(filters.categoryId);
      where.push(`i.category_id = $${params.length}`);
    }
    if (filters.unitId) {
      params.push(filters.unitId);
      where.push(`i.unit_id = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      where.push(`i.created_at::date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      where.push(`i.created_at::date <= $${params.length}::date`);
    }

    // Stock-status filter (Total/In Stock/Low Stock/No Stock summary cards,
    // made clickable): reuses the exact same quantity computation as
    // getProductsSummary above and as getProductSql's own `sq` LATERAL join
    // below, so the count always agrees with what those two already show.
    // The count query has no `sq` of its own, so it gets an identically-
    // aliased join added only when this filter is active.
    let stockJoinForCount = '';
    if (filters.stockStatus) {
      stockJoinForCount = `
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(si.quantity), 0)::int AS qty, COUNT(*)::int AS row_count
            FROM ims.store_items si
            JOIN ims.stores s2 ON s2.store_id = si.store_id
           WHERE si.product_id = i.item_id
             AND s2.branch_id = i.branch_id
        ) sq ON TRUE`;
      const qtyExpr = `CASE WHEN COALESCE(sq.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0) ELSE COALESCE(sq.qty, 0) END`;
      if (filters.stockStatus === 'no_stock') {
        where.push(`(${qtyExpr}) <= 0`);
      } else if (filters.stockStatus === 'low_stock') {
        where.push(`(${qtyExpr}) > 0 AND (${qtyExpr}) <= ${stockAlertExpr}`);
      } else {
        where.push(`(${qtyExpr}) > ${stockAlertExpr}`);
      }
    }

    const count = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.items i ${stockJoinForCount} WHERE ${where.join(' AND ')}`,
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
      const storeExpr = storeId ? `$${params.push(storeId)}::bigint` : 'NULL::bigint';
      return queryOne<Product>(`${getProductSql(stockAlertExpr, storeExpr)} WHERE i.item_id = $1`, params);
    }
    const params: unknown[] = [id, scope.branchIds];
    const storeExpr = storeId ? `$${params.push(storeId)}::bigint` : 'NULL::bigint';
    return queryOne<Product>(
      `${getProductSql(stockAlertExpr, storeExpr)} WHERE i.item_id = $1 AND i.branch_id = ANY($2::bigint[])`,
      params
    );
  },

  // Phase 12 blocker fix: exact barcode lookup for scanner/POS use. Deliberately
  // separate from listProducts' ILIKE search (which is a substring match meant
  // for typing partial text) - a scan must never resolve to the wrong item just
  // because the scanned code happens to be a substring of another item's
  // barcode. Barcode uniqueness (uq_items_branch_barcode) is only enforced per
  // branch, so unlike getProduct(id, ...) this cannot skip branch scoping for
  // admins - the same barcode text can legitimately belong to two different
  // items in two different branches.
  async getProductByBarcode(barcode: string, scope: BranchScope, branchId?: number): Promise<Product | null> {
    const trimmed = barcode.trim();
    if (!trimmed) return null;
    const stockAlertExpr = (await hasItemsStockAlertColumn()) ? 'i.stock_alert' : 'COALESCE(i.reorder_level, 5)';
    const params: unknown[] = [trimmed];
    const branchWhere = scopeClause(scope, params, 'i', branchId);
    return queryOne<Product>(
      `${getProductSql(stockAlertExpr)}
        WHERE i.barcode = $1
          AND i.is_active = TRUE
          AND (${branchWhere})`,
      params
    );
  },

  async createProduct(input: ProductCreateInput, scope: BranchScope): Promise<Product> {
    const catIdRequired = await isItemsCatIdRequired();
    const stockAlertColumn = (await hasItemsStockAlertColumn()) ? 'stock_alert' : 'reorder_level';
    const branchId = pickBranchForWrite(scope, input.branchId);
    if (input.storeId) await ensureInBranch('stores', 'store_id', input.storeId, branchId, 'Store');
    if (input.categoryId) await ensureInBranch('categories', 'cat_id', input.categoryId, branchId, 'Category');
    if (input.unitId) await ensureInBranch('units', 'unit_id', input.unitId, branchId, 'Unit');
    // Legacy compat: some older deployments still have a NOT NULL ims.items.cat_id column
    // from before the current categories/units design - keep it satisfied with a default
    // row when present, independent of the real category_id selection below.
    const legacyCatId = catIdRequired ? await ensureDefaultCategory(branchId) : null;

    const openingBalance = input.openingBalance ?? 0;
    const active = isActiveValue(input, true);
    const createdId = await withTransaction(async (client) => {
      const resolvedStoreId =
        Number(input.storeId || 0) > 0
          ? Number(input.storeId)
          : await getOrCreateDefaultStoreId(client, branchId);
      const created = await client.query<{ item_id: number }>(
        `INSERT INTO ims.items (
           branch_id, ${catIdRequired ? 'cat_id, ' : ''}store_id, name, barcode, ${stockAlertColumn}, opening_balance, cost_price, sell_price, is_active, category_id, unit_id, brand
         ) VALUES (
           $1, ${catIdRequired ? '$2, ' : ''}$${catIdRequired ? 3 : 2}, $${catIdRequired ? 4 : 3}, NULLIF($${catIdRequired ? 5 : 4}, ''), $${catIdRequired ? 6 : 5}, $${catIdRequired ? 7 : 6}, $${catIdRequired ? 8 : 7}, $${catIdRequired ? 9 : 8}, $${catIdRequired ? 10 : 9}, $${catIdRequired ? 11 : 10}, $${catIdRequired ? 12 : 11}, $${catIdRequired ? 13 : 12}
         )
         RETURNING item_id`,
        catIdRequired
          ? [
              branchId,
              legacyCatId,
              resolvedStoreId,
              input.name,
              input.barcode || '',
              input.stockAlert ?? 5,
              openingBalance,
              input.costPrice ?? 0,
              input.sellPrice ?? 0,
              active,
              input.categoryId ?? null,
              input.unitId ?? null,
              input.brand || null,
            ]
          : [
              branchId,
              resolvedStoreId,
              input.name,
              input.barcode || '',
              input.stockAlert ?? 5,
              openingBalance,
              input.costPrice ?? 0,
              input.sellPrice ?? 0,
              active,
              input.categoryId ?? null,
              input.unitId ?? null,
              input.brand || null,
            ]
      );
      const itemId = Number(created.rows[0]?.item_id || 0);
      if (!itemId) {
        throw ApiError.internal('Failed to create item');
      }

      // Phase 11/9: set separately, deliberately outside the INSERT above.
      // That INSERT's column/placeholder list already branches on
      // catIdRequired via hand-counted $N positions - adding more columns
      // there risks an off-by-one in either branch. A follow-up UPDATE is
      // just as correct here since nothing downstream in this transaction
      // reads these columns before it runs.
      const { columns: attrColumns, jsonb: attrJsonb } = splitAttributes(input.attributes);
      const finalSerialNumber = input.serialNumber || attrColumns.serial_number || null;
      const finalBrand = attrColumns.brand || null; // input.brand already set in the INSERT above
      if (
        input.size !== undefined ||
        input.color !== undefined ||
        input.genericName !== undefined ||
        input.strength !== undefined ||
        finalSerialNumber ||
        finalBrand ||
        attrColumns.size ||
        attrColumns.color ||
        Object.keys(attrJsonb).length
      ) {
        await client.query(
          `UPDATE ims.items
              SET size = COALESCE(NULLIF($1, ''), NULLIF($2, ''), size),
                  color = COALESCE(NULLIF($3, ''), NULLIF($4, ''), color),
                  generic_name = COALESCE(NULLIF($5, ''), generic_name),
                  strength = COALESCE(NULLIF($6, ''), strength),
                  serial_number = COALESCE(NULLIF($7, ''), serial_number),
                  brand = COALESCE(NULLIF($8, ''), brand),
                  attributes = attributes || $9::jsonb
            WHERE item_id = $10`,
          [
            input.size || null,
            attrColumns.size || null,
            input.color || null,
            attrColumns.color || null,
            input.genericName || null,
            input.strength || null,
            finalSerialNumber,
            finalBrand,
            JSON.stringify(attrJsonb),
            itemId,
          ]
        );
      }

      const quantity = Number(input.quantity ?? input.openingBalance ?? 0);
      await upsertStoreItemQuantity(client, branchId, resolvedStoreId, itemId, quantity);

      await rewriteItemOpeningStockGl(client, {
        branchId,
        itemId,
        itemName: input.name,
        openingBalance,
        costPrice: input.costPrice ?? 0,
      });

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
          `SELECT item_id, branch_id, store_id FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2::bigint[])`,
          [id, scope.branchIds]
        );
    if (!current) return null;

    if (input.storeId !== undefined && input.storeId !== null) await ensureInBranch('stores', 'store_id', input.storeId, current.branch_id, 'Store');
    if (input.categoryId !== undefined && input.categoryId !== null) await ensureInBranch('categories', 'cat_id', input.categoryId, current.branch_id, 'Category');
    if (input.unitId !== undefined && input.unitId !== null) await ensureInBranch('units', 'unit_id', input.unitId, current.branch_id, 'Unit');

    const updates: string[] = [];
    const values: unknown[] = [id];
    let p = 2;
    if (input.name !== undefined) { updates.push(`name = $${p++}`); values.push(input.name); }
    if (input.barcode !== undefined) { updates.push(`barcode = NULLIF($${p++}, '')`); values.push(input.barcode || ''); }
    if (input.storeId !== undefined) { updates.push(`store_id = $${p++}`); values.push(input.storeId ?? null); }
    if (input.categoryId !== undefined) { updates.push(`category_id = $${p++}`); values.push(input.categoryId ?? null); }
    if (input.unitId !== undefined) { updates.push(`unit_id = $${p++}`); values.push(input.unitId ?? null); }
    if (input.brand !== undefined) { updates.push(`brand = NULLIF($${p++}, '')`); values.push(input.brand || ''); }
    if (input.size !== undefined) { updates.push(`size = NULLIF($${p++}, '')`); values.push(input.size || ''); }
    if (input.color !== undefined) { updates.push(`color = NULLIF($${p++}, '')`); values.push(input.color || ''); }
    if (input.genericName !== undefined) { updates.push(`generic_name = NULLIF($${p++}, '')`); values.push(input.genericName || ''); }
    if (input.strength !== undefined) { updates.push(`strength = NULLIF($${p++}, '')`); values.push(input.strength || ''); }
    if (input.serialNumber !== undefined) { updates.push(`serial_number = NULLIF($${p++}, '')`); values.push(input.serialNumber || ''); }
    if (input.attributes !== undefined) {
      const { columns: attrColumns, jsonb: attrJsonb } = splitAttributes(input.attributes);
      if (attrColumns.brand) { updates.push(`brand = $${p++}`); values.push(attrColumns.brand); }
      if (attrColumns.color) { updates.push(`color = $${p++}`); values.push(attrColumns.color); }
      if (attrColumns.size) { updates.push(`size = $${p++}`); values.push(attrColumns.size); }
      if (attrColumns.generic_name) { updates.push(`generic_name = $${p++}`); values.push(attrColumns.generic_name); }
      if (attrColumns.strength) { updates.push(`strength = $${p++}`); values.push(attrColumns.strength); }
      if (attrColumns.serial_number) { updates.push(`serial_number = $${p++}`); values.push(attrColumns.serial_number); }
      // Full replace, not merge: the product form always sends the complete
      // set of dynamic fields for the item's current category, so a stale
      // key from a prior (different) category never lingers.
      updates.push(`attributes = $${p++}::jsonb`);
      values.push(JSON.stringify(attrJsonb));
    }
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
          await client.query(
            `UPDATE ims.items SET ${updates.join(', ')} WHERE item_id = $1 AND branch_id = ANY($${p}::bigint[])`,
            values
          );
        }
      }

      const targetStoreId = input.storeId !== undefined ? input.storeId : current.store_id;
      if (!targetStoreId && input.quantity !== undefined) {
        throw ApiError.badRequest('Store is required when updating quantity');
      }
      if (targetStoreId && input.quantity !== undefined) {
        await upsertStoreItemQuantity(client, current.branch_id, targetStoreId, id, Number(input.quantity));
      }

      if (input.openingBalance !== undefined || input.costPrice !== undefined) {
        const fresh = await client.query<{ name: string; opening_balance: string; cost_price: string }>(
          `SELECT name, COALESCE(opening_balance, 0)::text AS opening_balance, COALESCE(cost_price, 0)::text AS cost_price
             FROM ims.items
            WHERE item_id = $1`,
          [id]
        );
        const row = fresh.rows[0];
        if (row) {
          await rewriteItemOpeningStockGl(client, {
            branchId: current.branch_id,
            itemId: id,
            itemName: row.name,
            openingBalance: Number(row.opening_balance),
            costPrice: Number(row.cost_price),
          });
        }
      }
    });

    const outputStoreId = input.storeId !== undefined ? (input.storeId ?? undefined) : (current.store_id ?? undefined);
    return this.getProduct(id, scope, outputStoreId);
  },

  async deleteProduct(id: number, scope: BranchScope): Promise<void> {
    await withTransaction(async (client) => {
      // Phase 3 (Central Delete Architecture): this now soft-deletes via
      // ims.sp_soft_delete instead of a hard DELETE, so a product with real
      // sale/purchase/return/stock-adjustment/transfer history can be
      // archived - that history is 'preserve'd (left completely untouched),
      // see server/sql/20260922b_product_delete_policy.sql. GL/accounts.balance
      // are deliberately NOT touched here (no reverseAccountBalanceForRef/
      // deleteGlByRef) - soft-delete must stay non-destructive and reversible
      // via Trash; reversing the opening-stock GL entry is a permanent-delete
      // concern, out of scope until Phase 8.
      const found = scope.isAdmin
        ? await client.query<{ item_id: number; branch_id: number }>(
            `SELECT item_id, branch_id FROM ims.items WHERE item_id = $1`,
            [id]
          )
        : await client.query<{ item_id: number; branch_id: number }>(
            `SELECT item_id, branch_id FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2::bigint[])`,
            [id, scope.branchIds]
          );
      const row = found.rows[0];
      if (!row) return;

      const stockOnHand = await getProductStockOnHand(client, id);
      if (stockOnHand > 0) {
        throw ApiError.badRequest(
          `Cannot delete: ${stockOnHand} unit(s) of stock remain across store(s)/warehouse(s). Adjust stock to zero first.`
        );
      }

      await softDeleteById('items', id, { runner: client });
    });
  },

  // Phase 6: consolidates two "duplicate" items (near-identical products that
  // each accumulated real history before anyone noticed they're the same
  // thing) into one. Every historical/reference table is repointed from
  // fromItemId to toItemId; store_items/warehouse_stock/item_suppliers have
  // real unique keys that could collide once both point at the same target,
  // so those three are merged (quantities summed, conflicting rows dropped)
  // rather than blindly reassigned. The source item ends the transaction
  // with provably zero stock everywhere, so it's archived via the same
  // softDeleteById('items', ...) deleteProduct itself uses (called inline,
  // not via deleteProduct(), to stay on this same transaction/connection -
  // Phase 5 found a real cross-connection self-deadlock risk from mixing
  // connections within one logical operation).
  async mergeItems(fromItemId: number, toItemId: number, scope: BranchScope): Promise<void> {
    if (fromItemId === toItemId) {
      throw ApiError.badRequest('Cannot merge an item into itself');
    }

    await withTransaction(async (client) => {
      // The rls_soft_delete policy on is_deleted-bearing tables only allows a
      // row to be written into a soft-deleted state when this session has
      // explicitly set app.include_deleted='1' first (same as
      // ims.sp_soft_delete/restoreAdjustment do internally) - without it,
      // any direct UPDATE ... SET is_deleted = 1 is rejected outright.
      await client.query(`SET LOCAL app.include_deleted = '1'`);

      const rows = await client.query<{ item_id: number; branch_id: number; is_active: boolean }>(
        `SELECT item_id, branch_id, is_active FROM ims.items WHERE item_id = ANY($1::bigint[])`,
        [[fromItemId, toItemId]]
      );
      const fromItem = rows.rows.find((r) => Number(r.item_id) === fromItemId);
      const toItem = rows.rows.find((r) => Number(r.item_id) === toItemId);
      if (!fromItem || !toItem) {
        throw ApiError.notFound('Item not found');
      }
      if (
        !scope.isAdmin &&
        (!scope.branchIds.includes(Number(fromItem.branch_id)) || !scope.branchIds.includes(Number(toItem.branch_id)))
      ) {
        throw ApiError.forbidden('You can only merge items in your branch');
      }
      // Mirrors the same branch-scoping caution already documented on
      // transfer()'s CRIT-02 fix: the schema has no concept of "this item in
      // branch A is the same item as that one in branch B" yet.
      if (Number(fromItem.branch_id) !== Number(toItem.branch_id)) {
        throw ApiError.badRequest('Cannot merge items across different branches');
      }
      if (!toItem.is_active) {
        throw ApiError.badRequest('Cannot merge into an inactive item');
      }

      // 1. Purely-referential tables: no unique key on item_id, safe to
      // reassign directly. inventory_transaction has two item-referencing
      // columns (item_id, product_id) - both are reassigned.
      const simpleReassignTables: Array<{ table: string; column: string }> = [
        { table: 'sale_items', column: 'item_id' },
        { table: 'purchase_items', column: 'item_id' },
        { table: 'sales_return_items', column: 'item_id' },
        { table: 'purchase_return_items', column: 'item_id' },
        { table: 'stock_adjustment', column: 'item_id' },
        { table: 'transfer_items', column: 'item_id' },
        { table: 'warehouse_transfer_items', column: 'item_id' },
        { table: 'inventory_transaction', column: 'item_id' },
        { table: 'inventory_transaction', column: 'product_id' },
        { table: 'inventory_movements', column: 'item_id' },
      ];
      for (const { table, column } of simpleReassignTables) {
        await client.query(`UPDATE ims.${table} SET ${column} = $1 WHERE ${column} = $2`, [toItemId, fromItemId]);
      }

      // 2. store_items: unique on (store_id, product_id). Where the target
      // already has a row for a store, fold the source's quantity into it
      // and archive the source's row; otherwise just repoint it.
      await client.query(
        `UPDATE ims.store_items tgt
            SET quantity = tgt.quantity + src.quantity,
                updated_at = NOW()
           FROM ims.store_items src
          WHERE tgt.product_id = $1
            AND src.product_id = $2
            AND tgt.store_id = src.store_id
            AND COALESCE(tgt.is_deleted, 0) = 0
            AND COALESCE(src.is_deleted, 0) = 0`,
        [toItemId, fromItemId]
      );
      await client.query(
        `UPDATE ims.store_items
            SET is_deleted = 1, deleted_at = NOW(), quantity = 0, updated_at = NOW()
          WHERE product_id = $1
            AND COALESCE(is_deleted, 0) = 0
            AND EXISTS (
              SELECT 1 FROM ims.store_items t2
               WHERE t2.product_id = $2
                 AND t2.store_id = ims.store_items.store_id
                 AND COALESCE(t2.is_deleted, 0) = 0
            )`,
        [fromItemId, toItemId]
      );
      await client.query(
        `UPDATE ims.store_items
            SET product_id = $1, updated_at = NOW()
          WHERE product_id = $2
            AND COALESCE(is_deleted, 0) = 0`,
        [toItemId, fromItemId]
      );

      // 3. warehouse_stock: PK (wh_id, item_id). Same sum-then-archive /
      // repoint pattern as store_items, per warehouse instead of per store.
      await client.query(
        `UPDATE ims.warehouse_stock tgt
            SET quantity = tgt.quantity + src.quantity
           FROM ims.warehouse_stock src
          WHERE tgt.item_id = $1
            AND src.item_id = $2
            AND tgt.wh_id = src.wh_id
            AND COALESCE(tgt.is_deleted, 0) = 0
            AND COALESCE(src.is_deleted, 0) = 0`,
        [toItemId, fromItemId]
      );
      await client.query(
        `UPDATE ims.warehouse_stock
            SET is_deleted = 1, deleted_at = NOW(), quantity = 0
          WHERE item_id = $1
            AND COALESCE(is_deleted, 0) = 0
            AND EXISTS (
              SELECT 1 FROM ims.warehouse_stock t2
               WHERE t2.item_id = $2
                 AND t2.wh_id = ims.warehouse_stock.wh_id
                 AND COALESCE(t2.is_deleted, 0) = 0
            )`,
        [fromItemId, toItemId]
      );
      await client.query(
        `UPDATE ims.warehouse_stock
            SET item_id = $1
          WHERE item_id = $2
            AND COALESCE(is_deleted, 0) = 0`,
        [toItemId, fromItemId]
      );

      // 4. item_suppliers: PK (branch_id, item_id, supplier_id) - no
      // quantity to sum, just dedupe: keep the target's existing supplier
      // link where one exists, otherwise repoint the source's.
      await client.query(
        `UPDATE ims.item_suppliers
            SET is_deleted = 1, deleted_at = NOW()
          WHERE item_id = $1
            AND branch_id = $2
            AND COALESCE(is_deleted, 0) = 0
            AND EXISTS (
              SELECT 1 FROM ims.item_suppliers t2
               WHERE t2.item_id = $3
                 AND t2.branch_id = ims.item_suppliers.branch_id
                 AND t2.supplier_id = ims.item_suppliers.supplier_id
                 AND COALESCE(t2.is_deleted, 0) = 0
            )`,
        [fromItemId, fromItem.branch_id, toItemId]
      );
      await client.query(
        `UPDATE ims.item_suppliers
            SET item_id = $1
          WHERE item_id = $2
            AND branch_id = $3
            AND COALESCE(is_deleted, 0) = 0`,
        [toItemId, fromItemId, fromItem.branch_id]
      );

      // The source item's stock is now provably zero everywhere (folded
      // into the target or repointed away) - archive it exactly like a
      // normal delete, on this same connection/transaction.
      const stockOnHand = await getProductStockOnHand(client, fromItemId);
      if (stockOnHand > 0) {
        throw ApiError.internal('Merge did not fully consolidate stock - aborting');
      }
      await softDeleteById('items', fromItemId, { runner: client });
    });
  },

  async setProductImageUrl(id: number, imageUrl: string | null, scope: BranchScope): Promise<Product | null> {
    const current = scope.isAdmin
      ? await queryOne<{ item_id: number }>(`SELECT item_id FROM ims.items WHERE item_id = $1`, [id])
      : await queryOne<{ item_id: number }>(
          `SELECT item_id FROM ims.items WHERE item_id = $1 AND branch_id = ANY($2::bigint[])`,
          [id, scope.branchIds]
        );
    if (!current) return null;

    if (scope.isAdmin) {
      await queryOne(`UPDATE ims.items SET image_url = $2 WHERE item_id = $1`, [id, imageUrl]);
    } else {
      await queryOne(
        `UPDATE ims.items SET image_url = $2 WHERE item_id = $1 AND branch_id = ANY($3::bigint[])`,
        [id, imageUrl, scope.branchIds]
      );
    }
    return this.getProduct(id, scope);
  },
};
