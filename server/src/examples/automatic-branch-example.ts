/**
 * EXAMPLE: Automatic Branch Context System
 * 
 * This file demonstrates how the automatic branch_id system works
 * No need to manually specify branch_id - it's handled automatically!
 */

import { pool } from '../db/pool';
import { Request, Response } from 'express';

/**
 * Example 1: Simple Product CRUD (No manual branch_id needed!)
 */
export const productExamples = {
  
  /**
   * CREATE - branch_id automatically added by trigger
   */
  async createProduct(req: Request, res: Response) {
    try {
      // The middleware already set: ims.set_current_context(userId, branchId)
      // So we can just insert without branch_id!
      
      const { name, barcode, price, cost } = req.body;
      
      const result = await pool.query(
        `INSERT INTO ims.products (name, barcode, price, cost)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, barcode, price, cost]
        // ✅ NO branch_id needed!
        // ✅ NO created_by needed!
        // ✅ NO created_at needed!
        // Database trigger adds them automatically!
      );
      
      const product = result.rows[0];
      
      console.log('Created product:', {
        product_id: product.product_id,
        name: product.name,
        branch_id: product.branch_id,      // ← Automatic!
        created_by: product.created_by,    // ← Automatic!
        created_at: product.created_at     // ← Automatic!
      });
      
      res.json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  },

  /**
   * UPDATE - updated_by and updated_at automatically added
   */
  async updateProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, price } = req.body;
      
      const result = await pool.query(
        `UPDATE ims.products
         SET name = $1, price = $2
         WHERE product_id = $3
         RETURNING *`,
        [name, price, id]
        // ✅ NO updated_by needed!
        // ✅ NO updated_at needed!
        // Database trigger adds them automatically!
      );
      
      const product = result.rows[0];
      
      console.log('Updated product:', {
        product_id: product.product_id,
        name: product.name,
        updated_by: product.updated_by,    // ← Automatic!
        updated_at: product.updated_at     // ← Automatic!
      });
      
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  },

  /**
   * READ - Filter by user's accessible branches
   */
  async listProducts(req: Request, res: Response) {
    try {
      // User can access multiple branches
      const branchIds = req.userBranches; // From middleware
      
      const result = await pool.query(
        `SELECT * FROM ims.products
         WHERE branch_id = ANY($1) AND is_active = TRUE
         ORDER BY name`,
        [branchIds]
      );
      
      res.json(result.rows);
    } catch (error) {
      console.error('Error listing products:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  }
};

/**
 * Example 2: Account Operations (Automatic branch context)
 */
export const accountExamples = {
  
  /**
   * CREATE - Branch-scoped account creation
   */
  async createAccount(req: Request, res: Response) {
    try {
      const { name, institution, currency_code, balance } = req.body;
      
      const result = await pool.query(
        `INSERT INTO ims.accounts (name, institution, currency_code, balance)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, institution, currency_code, balance]
        // ✅ branch_id automatic!
        // ✅ Account name unique per branch (not globally)
      );
      
      res.json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(400).json({ 
          error: 'Account name already exists in this branch' 
        });
      } else {
        console.error('Error creating account:', error);
        res.status(500).json({ error: 'Failed to create account' });
      }
    }
  },

  /**
   * READ - Using helper function
   */
  async listAccounts(req: Request, res: Response) {
    try {
      const branchId = req.currentBranch; // Current selected branch
      
      // Use helper function for easy querying
      const result = await pool.query(
        `SELECT * FROM ims.fn_branch_accounts($1, TRUE)`,
        [branchId]
      );
      
      res.json(result.rows);
    } catch (error) {
      console.error('Error listing accounts:', error);
      res.status(500).json({ error: 'Failed to list accounts' });
    }
  }
};

/**
 * Example 3: Transaction with Multiple Inserts
 */
export const transactionExample = {
  
  /**
   * CREATE SALE - All records get automatic branch_id
   */
  async createSale(req: Request, res: Response) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { customer_id, items, total, discount } = req.body;
      
      // 1. Create sale header
      // branch_id, user_id, created_by all automatic!
      const saleResult = await client.query(
        `INSERT INTO ims.sales (customer_id, total, discount, subtotal)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [customer_id, total, discount, total - discount]
        // ✅ branch_id automatic!
        // ✅ user_id automatic!
        // ✅ created_by automatic!
      );
      
      const sale = saleResult.rows[0];
      
      // 2. Create sale items
      for (const item of items) {
        await client.query(
          `INSERT INTO ims.sale_items (sale_id, product_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [sale.sale_id, item.product_id, item.quantity, item.unit_price, item.line_total]
        );
      }
      
      // 3. Update product stock (inventory movement)
      // This also gets automatic branch_id!
      for (const item of items) {
        await client.query(
          `INSERT INTO ims.inventory_movements 
           (product_id, move_type, qty_out, ref_table, ref_id)
           VALUES ($1, 'sale', $2, 'sales', $3)`,
          [item.product_id, item.quantity, sale.sale_id]
          // ✅ branch_id automatic!
        );
      }
      
      await client.query('COMMIT');
      
      console.log('Sale created with automatic branch context:', {
        sale_id: sale.sale_id,
        branch_id: sale.branch_id,      // ← Automatic!
        user_id: sale.user_id,          // ← Automatic!
        created_by: sale.created_by,    // ← Automatic!
        items_count: items.length
      });
      
      res.json(sale);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating sale:', error);
      res.status(500).json({ error: 'Failed to create sale' });
    } finally {
      client.release();
    }
  }
};

/**
 * Example 4: Comparing Old vs New Way
 */
export const comparisonExample = {
  
  /**
   * ❌ OLD WAY: Manual branch_id everywhere
   */
  async createProductOldWay(req: Request, res: Response) {
    try {
      const { name, barcode, price } = req.body;
      const branchId = req.currentBranch;  // Get from request
      const userId = req.user?.userId;      // Get from auth
      
      const result = await pool.query(
        `INSERT INTO ims.products 
         (branch_id, name, barcode, price, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [branchId, name, barcode, price, userId]
        // ❌ Manual branch_id
        // ❌ Manual created_by
        // ❌ Manual created_at
        // More parameters, more chances for errors!
      );
      
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  },

  /**
   * ✅ NEW WAY: Automatic branch_id
   */
  async createProductNewWay(req: Request, res: Response) {
    try {
      const { name, barcode, price } = req.body;
      // That's it! No branch_id or user_id needed!
      
      const result = await pool.query(
        `INSERT INTO ims.products (name, barcode, price)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, barcode, price]
        // ✅ Simpler!
        // ✅ Fewer parameters!
        // ✅ Less error-prone!
        // ✅ Automatic branch_id, created_by, created_at!
      );
      
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  }
};

/**
 * Example 5: Testing the Automatic System
 */
export const testingExample = {
  
  /**
   * Test automatic branch_id population
   */
  async testAutomaticBranch() {
    const client = await pool.connect();
    
    try {
      // 1. Set context (middleware does this automatically in real requests)
      await client.query(`SELECT ims.set_current_context(1, 2)`);
      // user_id=1, branch_id=2
      
      // 2. Verify context is set
      const contextResult = await client.query(`
        SELECT 
          ims.get_current_user() as user_id,
          ims.get_current_branch() as branch_id
      `);
      
      console.log('Context:', contextResult.rows[0]);
      // Expected: { user_id: 1, branch_id: 2 }
      
      // 3. Insert without branch_id
      const insertResult = await client.query(`
        INSERT INTO ims.products (name, barcode, price)
        VALUES ('Test Product', 'TEST001', 99.99)
        RETURNING product_id, name, branch_id, created_by, created_at
      `);
      
      const product = insertResult.rows[0];
      console.log('Created product:', product);
      // Expected:
      // {
      //   product_id: <generated>,
      //   name: 'Test Product',
      //   branch_id: 2,        ← Automatic!
      //   created_by: 1,       ← Automatic!
      //   created_at: <now>    ← Automatic!
      // }
      
      // 4. Update without audit fields
      const updateResult = await client.query(`
        UPDATE ims.products
        SET price = 120.00
        WHERE product_id = $1
        RETURNING product_id, price, updated_by, updated_at
      `, [product.product_id]);
      
      const updatedProduct = updateResult.rows[0];
      console.log('Updated product:', updatedProduct);
      // Expected:
      // {
      //   product_id: <id>,
      //   price: 120.00,
      //   updated_by: 1,       ← Automatic!
      //   updated_at: <now>    ← Automatic!
      // }
      
      console.log('✅ Automatic branch system working perfectly!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      client.release();
    }
  }
};

/**
 * Usage in Express Routes:
 * 
 * import { productExamples } from './examples/automatic-branch-example';
 * import { authenticate } from './middleware/auth';
 * import { loadUserBranches } from './middleware/branchAccess.middleware';
 * 
 * // Apply middleware
 * app.use('/api', authenticate, loadUserBranches);
 * 
 * // Use examples
 * app.post('/api/products', productExamples.createProduct);
 * app.put('/api/products/:id', productExamples.updateProduct);
 * app.get('/api/products', productExamples.listProducts);
 */
