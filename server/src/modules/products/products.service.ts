import { queryMany, queryOne } from '../../db/query';
import { ProductInput, CategoryInput } from './products.schemas';

export interface Category {
  category_id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  product_id: number;
  name: string;
  sku: string | null;
  category_id: number | null;
  category_name?: string | null;
  price: number;
  cost: number;
  stock: number;
  opening_balance?: number;
  is_active: boolean;
  status: string;
  reorder_level: number;
  description?: string | null;
  product_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

let productsHaveOpeningBalanceColumn: boolean | null = null;

const detectProductsOpeningBalanceColumn = async (): Promise<boolean> => {
  if (productsHaveOpeningBalanceColumn !== null) return productsHaveOpeningBalanceColumn;
  const rows = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'items'`
  );
  productsHaveOpeningBalanceColumn = rows.some((row) => row.column_name === 'opening_balance');
  return productsHaveOpeningBalanceColumn;
};

export const productsService = {
  async listCategories(): Promise<Category[]> {
    return queryMany<Category>(
      `SELECT
         c.cat_id AS category_id,
         c.cat_name AS name,
         c.description,
         NULL::BIGINT AS parent_id,
         TRUE AS is_active,
         NOW()::text AS created_at,
         NOW()::text AS updated_at
       FROM ims.categories c
       ORDER BY c.cat_name`
    );
  },

  async createCategory(input: CategoryInput): Promise<Category> {
    const row = await queryOne<{ cat_id: number }>(
      `INSERT INTO ims.categories (branch_id, cat_name, description)
       VALUES ((SELECT branch_id FROM ims.current_context LIMIT 1), $1, $2)
       RETURNING cat_id`,
      [input.name, input.description || null]
    );
    return (await this.getCategory(row!.cat_id)) as Category;
  },

  async updateCategory(id: number, input: CategoryInput): Promise<Category | null> {
    await queryOne(
      `UPDATE ims.categories
       SET cat_name = $2,
           description = $3
       WHERE cat_id = $1`,
      [id, input.name, input.description || null]
    );
    return this.getCategory(id);
  },

  async deleteCategory(id: number): Promise<void> {
    await queryOne(
      `DELETE FROM ims.categories WHERE cat_id = $1`,
      [id]
    );
  },

  async getCategory(id: number): Promise<Category | null> {
    return queryOne<Category>(
      `SELECT
         c.cat_id AS category_id,
         c.cat_name AS name,
         c.description,
         NULL::BIGINT AS parent_id,
         TRUE AS is_active,
         NOW()::text AS created_at,
         NOW()::text AS updated_at
       FROM ims.categories c
       WHERE c.cat_id = $1`,
      [id]
    );
  },

  async listProducts(search?: string, categoryId?: number): Promise<Product[]> {
    const params: any[] = [];
    const filters: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(i.name ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`);
    }
    if (categoryId) {
      params.push(categoryId);
      filters.push(`i.cat_id = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return queryMany<Product>(
      `SELECT
         i.item_id AS product_id,
         i.name,
         i.barcode AS sku,
         i.cat_id AS category_id,
         c.cat_name AS category_name,
         i.sell_price AS price,
         i.cost_price AS cost,
         i.opening_balance AS stock,
         i.opening_balance,
         i.is_active,
         CASE WHEN i.is_active THEN 'active' ELSE 'inactive' END AS status,
         i.reorder_level,
         NULL::text AS description,
         NULL::text AS product_image_url,
         i.created_at::text AS created_at,
         i.created_at::text AS updated_at
       FROM ims.items i
       LEFT JOIN ims.categories c ON c.cat_id = i.cat_id
       ${where}
       ORDER BY i.created_at DESC`,
      params
    );
  },

  async getProduct(id: number): Promise<Product | null> {
    return queryOne<Product>(
      `SELECT
         i.item_id AS product_id,
         i.name,
         i.barcode AS sku,
         i.cat_id AS category_id,
         c.cat_name AS category_name,
         i.sell_price AS price,
         i.cost_price AS cost,
         i.opening_balance AS stock,
         i.opening_balance,
         i.is_active,
         CASE WHEN i.is_active THEN 'active' ELSE 'inactive' END AS status,
         i.reorder_level,
         NULL::text AS description,
         NULL::text AS product_image_url,
         i.created_at::text AS created_at,
         i.created_at::text AS updated_at
       FROM ims.items i
       LEFT JOIN ims.categories c ON c.cat_id = i.cat_id
       WHERE i.item_id = $1`,
      [id]
    );
  },

  async createProduct(input: ProductInput & { productImageUrl?: string }): Promise<Product> {
    const categoryId = input.categoryId ?? null;
    if (!categoryId) {
      throw new Error('Category is required');
    }
    const hasOpeningBalance = await detectProductsOpeningBalanceColumn();
    const openingBalance = input.openingBalance ?? input.stock ?? 0;
    const isActive = input.status !== 'inactive';
    const insert = hasOpeningBalance
      ? await queryOne<{ item_id: number }>(
          `INSERT INTO ims.items (branch_id, cat_id, name, barcode, reorder_level, opening_balance, cost_price, sell_price, is_active)
           VALUES ((SELECT branch_id FROM ims.current_context LIMIT 1), $1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8)
           RETURNING item_id`,
          [
            categoryId,
            input.name,
            input.sku || null,
            input.reorderLevel ?? 0,
            openingBalance,
            input.cost ?? 0,
            input.price ?? 0,
            isActive,
          ]
        )
      : await queryOne<{ item_id: number }>(
          `INSERT INTO ims.items (branch_id, cat_id, name, barcode, reorder_level, cost_price, sell_price, is_active)
           VALUES ((SELECT branch_id FROM ims.current_context LIMIT 1), $1, $2, NULLIF($3, ''), $4, $5, $6, $7)
           RETURNING item_id`,
          [
            categoryId,
            input.name,
            input.sku || null,
            input.reorderLevel ?? 0,
            input.cost ?? 0,
            input.price ?? 0,
            isActive,
          ]
        );
    return (await this.getProduct(insert!.item_id)) as Product;
  },

  async updateProduct(id: number, input: Partial<ProductInput & { productImageUrl?: string; description?: string }>): Promise<Product | null> {
    const hasOpeningBalance = await detectProductsOpeningBalanceColumn();
    const updates: string[] = [];
    const values: any[] = [id];
    let paramCount = 2;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.sku !== undefined) {
      updates.push(`barcode = NULLIF($${paramCount++}, '')`);
      values.push(input.sku);
    }
    if (input.categoryId !== undefined) {
      updates.push(`cat_id = $${paramCount++}`);
      values.push(input.categoryId ?? null);
    }
    if (input.price !== undefined) {
      updates.push(`sell_price = $${paramCount++}`);
      values.push(input.price);
    }
    if (input.cost !== undefined) {
      updates.push(`cost_price = $${paramCount++}`);
      values.push(input.cost);
    }
    if (input.openingBalance !== undefined) {
      if (hasOpeningBalance) {
        updates.push(`opening_balance = $${paramCount++}`);
        values.push(input.openingBalance);
      }
    }
    if (input.status !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(input.status !== 'inactive');
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(input.isActive);
    }
    if (input.reorderLevel !== undefined) {
      updates.push(`reorder_level = $${paramCount++}`);
      values.push(input.reorderLevel);
    }

    if (updates.length === 0) {
      return this.getProduct(id);
    }

    await queryOne(
      `UPDATE ims.items
       SET ${updates.join(', ')}
       WHERE item_id = $1`,
      values
    );
    return this.getProduct(id);
  },

  async deleteProduct(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.items WHERE item_id = $1`, [id]);
  },
};
