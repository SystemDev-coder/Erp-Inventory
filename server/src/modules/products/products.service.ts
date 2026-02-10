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
  is_active: boolean;
  status: string;
  reorder_level: number;
  description?: string | null;
  product_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export const productsService = {
  async listCategories(): Promise<Category[]> {
    return queryMany<Category>(
      `SELECT c.*
       FROM ims.categories c
       ORDER BY COALESCE(c.name, c.cat_name)`
    );
  },

  async createCategory(input: CategoryInput): Promise<Category> {
    const parentId = input.parentId ?? null;
    return queryOne<Category>(
      `INSERT INTO ims.categories (name, cat_name, description, parent_id, is_active)
       VALUES ($1, $1, $2, $3, COALESCE($4, TRUE))
       RETURNING *`,
      [input.name, input.description || null, parentId, input.isActive]
    ) as Promise<Category>;
  },

  async updateCategory(id: number, input: CategoryInput): Promise<Category | null> {
    const parentId = input.parentId ?? null;
    return queryOne<Category>(
      `UPDATE ims.categories
       SET name = $2,
           cat_name = $2,
           description = $3,
           parent_id = $4,
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE category_id = $1
       RETURNING *`,
      [id, input.name, input.description || null, parentId, input.isActive]
    );
  },

  async deleteCategory(id: number): Promise<void> {
    await queryOne(
      `DELETE FROM ims.categories WHERE category_id = $1`,
      [id]
    );
  },

  async listProducts(search?: string): Promise<Product[]> {
    const params: any[] = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length}`;
    }
    return queryMany<Product>(
      `SELECT p.*,
              COALESCE(c.name, c.cat_name) AS category_name
       FROM ims.products p
       LEFT JOIN ims.categories c ON c.category_id = p.category_id OR c.cat_id = p.cat_id
       ${where}
       ORDER BY COALESCE(p.updated_at, p.created_at) DESC`,
      params
    );
  },

  async getProduct(id: number): Promise<Product | null> {
    return queryOne<Product>(
      `SELECT p.*,
              COALESCE(c.name, c.cat_name) AS category_name
       FROM ims.products p
       LEFT JOIN ims.categories c ON c.category_id = p.category_id OR c.cat_id = p.cat_id
       WHERE p.product_id = $1`,
      [id]
    );
  },

  async createProduct(input: ProductInput & { productImageUrl?: string }): Promise<Product> {
    const categoryId = input.categoryId ?? null;
    return queryOne<Product>(
      `INSERT INTO ims.products (name, sku, category_id, cat_id, price, cost, stock, status, reorder_level, description, product_image_url)
       VALUES ($1, NULLIF($2, ''), $3, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.name,
        input.sku || null,
        categoryId,
        input.price ?? 0,
        input.cost ?? 0,
        input.stock ?? 0,
        input.status ?? 'active',
        input.reorderLevel ?? 0,
        input.description || null,
        input.productImageUrl || null,
      ]
    ) as Promise<Product>;
  },

  async updateProduct(id: number, input: Partial<ProductInput & { productImageUrl?: string; description?: string }>): Promise<Product | null> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramCount = 2;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.sku !== undefined) {
      updates.push(`sku = NULLIF($${paramCount++}, '')`);
      values.push(input.sku);
    }
    if (input.categoryId !== undefined) {
      updates.push(`category_id = $${paramCount}, cat_id = $${paramCount++}`);
      values.push(input.categoryId ?? null);
    }
    if (input.price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(input.price);
    }
    if (input.cost !== undefined) {
      updates.push(`cost = $${paramCount++}`);
      values.push(input.cost);
    }
    if (input.stock !== undefined) {
      updates.push(`stock = $${paramCount++}`);
      values.push(input.stock);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.reorderLevel !== undefined) {
      updates.push(`reorder_level = $${paramCount++}`);
      values.push(input.reorderLevel);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(input.description);
    }
    if (input.productImageUrl !== undefined) {
      updates.push(`product_image_url = $${paramCount++}`);
      values.push(input.productImageUrl || null);
    }

    if (updates.length === 0) {
      return this.getProduct(id);
    }

    return queryOne<Product>(
      `UPDATE ims.products
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE product_id = $1
       RETURNING *`,
      values
    );
  },

  async deleteProduct(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.products WHERE product_id = $1`, [id]);
  },
};
