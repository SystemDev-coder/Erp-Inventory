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
  created_at: string;
  updated_at: string;
}

export const productsService = {
  async listCategories(): Promise<Category[]> {
    return queryMany<Category>(
      `SELECT c.*
       FROM ims.categories c
       ORDER BY c.name`
    );
  },

  async createCategory(input: CategoryInput): Promise<Category> {
    const parentId = input.parentId ?? null;
    return queryOne<Category>(
      `INSERT INTO ims.categories (name, description, parent_id, is_active)
       VALUES ($1, $2, $3, COALESCE($4, TRUE))
       RETURNING *`,
      [input.name, input.description || null, parentId, input.isActive]
    ) as Promise<Category>;
  },

  async updateCategory(id: number, input: CategoryInput): Promise<Category | null> {
    const parentId = input.parentId ?? null;
    return queryOne<Category>(
      `UPDATE ims.categories
       SET name = $2,
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
              c.name AS category_name
       FROM ims.products p
       LEFT JOIN ims.categories c ON c.category_id = p.category_id
       ${where}
       ORDER BY p.updated_at DESC`,
      params
    );
  },

  async getProduct(id: number): Promise<Product | null> {
    return queryOne<Product>(
      `SELECT p.*,
              c.name AS category_name
       FROM ims.products p
       LEFT JOIN ims.categories c ON c.category_id = p.category_id
       WHERE p.product_id = $1`,
      [id]
    );
  },

  async createProduct(input: ProductInput): Promise<Product> {
    const categoryId = input.categoryId ?? null;
    return queryOne<Product>(
      `INSERT INTO ims.products (name, sku, category_id, price, cost, stock, status, reorder_level)
       VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8)
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
      ]
    ) as Promise<Product>;
  },

  async updateProduct(id: number, input: ProductInput): Promise<Product | null> {
    const categoryId = input.categoryId ?? null;
    return queryOne<Product>(
      `UPDATE ims.products
       SET name = $2,
           sku = NULLIF($3, ''),
           category_id = $4,
           price = $5,
           cost = $6,
           stock = $7,
           status = $8,
           reorder_level = $9,
           updated_at = NOW()
       WHERE product_id = $1
       RETURNING *`,
      [
        id,
        input.name,
        input.sku || null,
        categoryId,
        input.price ?? 0,
        input.cost ?? 0,
        input.stock ?? 0,
        input.status ?? 'active',
        input.reorderLevel ?? 0,
      ]
    );
  },

  async deleteProduct(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.products WHERE product_id = $1`, [id]);
  },
};
