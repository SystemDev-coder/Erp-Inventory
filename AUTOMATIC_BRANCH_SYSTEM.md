# Automatic Branch Context System

## 🎯 Overview

The ERP system now **automatically handles branch_id** for all CRUD operations. Users simply select their branch once, and all subsequent database operations automatically include the correct branch_id without manual specification.

---

## ✨ How It Works

### 1. **Session Context Management**

When a user authenticates and selects a branch, the system:
1. Sets session variables in PostgreSQL
2. Database triggers automatically use these variables
3. All INSERT operations auto-populate `branch_id`
4. All UPDATE operations auto-populate `updated_by` and `updated_at`

### 2. **Database Functions**

```sql
-- Set context at start of request
SELECT ims.set_current_context(user_id, branch_id);

-- Get current context (used by triggers)
SELECT ims.get_current_branch();  -- Returns branch_id
SELECT ims.get_current_user();    -- Returns user_id
```

### 3. **Automatic Triggers**

Applied to all branch-specific tables:
- **ON INSERT**: Auto-populates `branch_id`, `created_by`, `created_at`
- **ON UPDATE**: Auto-populates `updated_by`, `updated_at`

---

## 🚀 Backend Implementation

### Step 1: Middleware Setup (Already Done!)

The `loadUserBranches` middleware automatically sets the database context:

```typescript
import { loadUserBranches } from './middleware/branchAccess.middleware';

// Apply to all protected routes
app.use('/api', authenticate, loadUserBranches);
```

**What happens:**
1. User authentication verified
2. User's accessible branches loaded
3. Current branch determined (from header/query or default to primary)
4. Database context set: `ims.set_current_context(userId, branchId)`
5. All subsequent queries in this request use this context

### Step 2: Simplified CRUD Operations

#### ❌ OLD WAY (Manual branch_id):
```typescript
// Before: Had to manually include branch_id
async createProduct(input: ProductInput, req: Request) {
  const branchId = req.currentBranch; // Get from request
  
  return await pool.query(
    `INSERT INTO ims.products (branch_id, name, barcode, price)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [branchId, input.name, input.barcode, input.price]
    //  ^^^^^^^^ Manual branch_id!
  );
}
```

#### ✅ NEW WAY (Automatic):
```typescript
// Now: branch_id is automatic!
async createProduct(input: ProductInput, req: Request) {
  // No need to get branch_id - it's automatic!
  
  return await pool.query(
    `INSERT INTO ims.products (name, barcode, price)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.barcode, input.price]
    // branch_id, created_by, created_at added automatically by trigger!
  );
}
```

### Step 3: Update Operations

#### ❌ OLD WAY:
```typescript
async updateProduct(id: number, input: ProductInput, req: Request) {
  const userId = req.user.userId;
  
  return await pool.query(
    `UPDATE ims.products 
     SET name = $1, price = $2, updated_by = $3, updated_at = NOW()
     WHERE product_id = $4
     RETURNING *`,
    [input.name, input.price, userId, id]
    //                         ^^^^^^ Manual audit fields!
  );
}
```

#### ✅ NEW WAY:
```typescript
async updateProduct(id: number, input: ProductInput, req: Request) {
  // No need for updated_by or updated_at!
  
  return await pool.query(
    `UPDATE ims.products 
     SET name = $1, price = $2
     WHERE product_id = $3
     RETURNING *`,
    [input.name, input.price, id]
    // updated_by and updated_at added automatically!
  );
}
```

---

## 📋 Complete Examples

### Example 1: Products Service

```typescript
// server/src/modules/products/products.service.ts

export const productsService = {
  // CREATE - branch_id automatic
  async createProduct(input: ProductInput) {
    return await pool.query(
      `INSERT INTO ims.products (name, barcode, price, cost, category_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.name, input.barcode, input.price, input.cost, input.categoryId]
      // branch_id, created_by, created_at → AUTOMATIC!
    );
  },

  // READ - filter by user's accessible branches
  async listProducts(req: Request) {
    const branchIds = req.userBranches; // All accessible branches
    
    return await pool.query(
      `SELECT * FROM ims.products
       WHERE branch_id = ANY($1) AND is_active = TRUE
       ORDER BY name`,
      [branchIds]
    );
  },

  // UPDATE - updated_by and updated_at automatic
  async updateProduct(id: number, input: ProductInput) {
    return await pool.query(
      `UPDATE ims.products
       SET name = $1, barcode = $2, price = $3, cost = $4
       WHERE product_id = $5
       RETURNING *`,
      [input.name, input.barcode, input.price, input.cost, id]
      // updated_by, updated_at → AUTOMATIC!
    );
  },

  // DELETE - soft delete
  async deleteProduct(id: number) {
    return await pool.query(
      `UPDATE ims.products
       SET is_active = FALSE
       WHERE product_id = $1
       RETURNING *`,
      [id]
      // updated_by, updated_at → AUTOMATIC!
    );
  }
};
```

### Example 2: Accounts Service

```typescript
// server/src/modules/accounts/accounts.service.ts

export const accountsService = {
  // CREATE - branch_id automatic
  async createAccount(input: AccountInput) {
    return await pool.query(
      `INSERT INTO ims.accounts (name, institution, currency_code, balance)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.institution, input.currencyCode, input.balance]
      // branch_id, created_by, created_at → AUTOMATIC!
    );
  },

  // READ - use helper function
  async listAccounts(req: Request) {
    const branchId = req.currentBranch;
    
    return await pool.query(
      `SELECT * FROM ims.fn_branch_accounts($1, TRUE)`,
      [branchId]
    );
  },

  // UPDATE - automatic audit trail
  async updateAccount(id: number, input: AccountInput) {
    return await pool.query(
      `UPDATE ims.accounts
       SET name = $1, institution = $2, balance = $3
       WHERE acc_id = $4
       RETURNING *`,
      [input.name, input.institution, input.balance, id]
      // updated_by, updated_at → AUTOMATIC!
    );
  }
};
```

### Example 3: Sales Service

```typescript
// server/src/modules/sales/sales.service.ts

export const salesService = {
  // CREATE - branch_id and user_id automatic
  async createSale(input: SaleInput) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create sale - branch_id and user_id automatic
      const saleResult = await client.query(
        `INSERT INTO ims.sales (customer_id, total, discount, subtotal)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.customerId, input.total, input.discount, input.subtotal]
        // branch_id, user_id, created_by, created_at → AUTOMATIC!
      );
      
      const sale = saleResult.rows[0];
      
      // Add sale items
      for (const item of input.items) {
        await client.query(
          `INSERT INTO ims.sale_items (sale_id, product_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [sale.sale_id, item.productId, item.quantity, item.unitPrice, item.lineTotal]
        );
      }
      
      await client.query('COMMIT');
      return sale;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
```

---

## 🎨 Frontend Implementation

### No Changes Needed!

The frontend works the same way - users select their branch once, and all API calls automatically use it:

```typescript
// User selects branch
const { currentBranch, setCurrentBranch } = useBranch();

// All API calls include branch in header
api.defaults.headers.common['X-Branch-Id'] = currentBranch;

// CREATE - no need to send branch_id
const createProduct = async (data) => {
  await api.post('/products', {
    name: data.name,
    barcode: data.barcode,
    price: data.price
    // NO branch_id needed! Backend handles it automatically
  });
};

// UPDATE - no need to send updated_by
const updateProduct = async (id, data) => {
  await api.put(`/products/${id}`, {
    name: data.name,
    price: data.price
    // NO updated_by or updated_at needed! Automatic!
  });
};
```

---

## 🔧 Tables with Automatic Branch Management

All these tables now have automatic `branch_id` population:

- ✅ `categories`
- ✅ `suppliers`
- ✅ `customers`
- ✅ `products`
- ✅ `accounts`
- ✅ `sales`
- ✅ `purchases`
- ✅ `charges`
- ✅ `receipts`
- ✅ `supplier_charges`
- ✅ `supplier_payments`
- ✅ `expenses`
- ✅ `inventory_movements`
- ✅ `employees`
- ✅ `employee_payments`
- ✅ `employee_loans`
- ✅ `audit_logs`
- ✅ `warehouses`

---

## 📊 What Gets Automatically Populated

### On INSERT:
```sql
INSERT INTO ims.products (name, price)
VALUES ('Product A', 100);

-- Trigger automatically adds:
-- branch_id = <current_branch_from_session>
-- created_by = <current_user_from_session>
-- created_at = NOW()
```

### On UPDATE:
```sql
UPDATE ims.products
SET name = 'Product B', price = 150
WHERE product_id = 1;

-- Trigger automatically adds:
-- updated_by = <current_user_from_session>
-- updated_at = NOW()
```

---

## 🔍 Testing the Automatic System

### Test 1: Verify Session Context

```sql
-- Set context (middleware does this automatically)
SELECT ims.set_current_context(1, 2);  -- user_id=1, branch_id=2

-- Verify context is set
SELECT ims.get_current_user();    -- Returns: 1
SELECT ims.get_current_branch();  -- Returns: 2
```

### Test 2: Test Automatic INSERT

```sql
-- Set context
SELECT ims.set_current_context(1, 2);

-- Insert WITHOUT branch_id
INSERT INTO ims.products (name, barcode, price)
VALUES ('Test Product', 'TEST001', 99.99)
RETURNING *;

-- Result will show:
-- branch_id = 2 (automatic!)
-- created_by = 1 (automatic!)
-- created_at = <now> (automatic!)
```

### Test 3: Test Automatic UPDATE

```sql
-- Set context
SELECT ims.set_current_context(5, 3);

-- Update WITHOUT audit fields
UPDATE ims.products
SET price = 120.00
WHERE product_id = 1
RETURNING *;

-- Result will show:
-- updated_by = 5 (automatic!)
-- updated_at = <now> (automatic!)
```

---

## ⚙️ Advanced: Custom Branch Override

If you need to explicitly set a different branch_id (rare cases):

```typescript
// Explicitly set branch_id (overrides automatic)
async createProductForAnotherBranch(input: ProductInput, targetBranchId: number) {
  // Verify user has access to target branch
  if (!req.userBranches.includes(targetBranchId)) {
    throw new Error('No access to target branch');
  }
  
  return await pool.query(
    `INSERT INTO ims.products (branch_id, name, barcode, price)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [targetBranchId, input.name, input.barcode, input.price]
    // Explicit branch_id overrides automatic trigger
  );
}
```

---

## 🛡️ Security Benefits

1. **Prevents Human Error**: Developers can't forget to add branch_id
2. **Consistent Audit Trail**: All records automatically tracked
3. **Branch Isolation**: Data automatically stays within correct branch
4. **Simplified Code**: Less boilerplate, fewer bugs
5. **Centralized Control**: Branch logic in database, not scattered in code

---

## 📝 Migration Notes

### For Existing Code:

**Option 1: Leave as-is** (Still works!)
- Explicit branch_id will override automatic
- Existing code continues to work

**Option 2: Simplify** (Recommended)
- Remove manual branch_id from INSERT statements
- Remove manual updated_by/updated_at from UPDATE statements
- Let triggers handle it automatically

**Example Refactoring:**

```typescript
// BEFORE
await pool.query(
  `INSERT INTO ims.products (branch_id, name, price, created_by, created_at)
   VALUES ($1, $2, $3, $4, NOW())`,
  [req.currentBranch, input.name, input.price, req.user.userId]
);

// AFTER (Simpler!)
await pool.query(
  `INSERT INTO ims.products (name, price)
   VALUES ($1, $2)`,
  [input.name, input.price]
);
```

---

## 🎉 Benefits Summary

### For Developers:
- ✅ Less code to write
- ✅ Fewer bugs (no forgotten branch_id)
- ✅ Automatic audit trail
- ✅ Cleaner, more maintainable code

### For Users:
- ✅ Select branch once
- ✅ All operations use correct branch automatically
- ✅ Complete data isolation
- ✅ Full audit trail (who did what, when)

### For Business:
- ✅ Strong data security
- ✅ Complete audit compliance
- ✅ Branch-level data isolation
- ✅ Scalable multi-branch architecture

---

## 📁 Updated Files

1. ✅ `server/sql/complete_inventory_erp_schema.sql`
   - Added session context functions
   - Added automatic trigger function
   - Applied triggers to all branch tables

2. ✅ `server/src/middleware/branchAccess.middleware.ts`
   - Added `setDatabaseContext()` function
   - Modified `loadUserBranches` to call it automatically
   - Added `clearDatabaseContext()` for cleanup

3. ✅ `AUTOMATIC_BRANCH_SYSTEM.md` (this file)
   - Complete documentation
   - Examples and testing

---

## 🚀 Quick Start

### 1. Rebuild Containers (to apply database changes)
```bash
docker-compose -f docker-compose.nomount.yml up -d --build
```

### 2. Update Your Services (Optional - makes code simpler)
```typescript
// Remove manual branch_id from INSERT
// Remove manual updated_by/updated_at from UPDATE
// Everything is automatic now!
```

### 3. Test It
```typescript
// Just call your APIs normally
// branch_id is handled automatically based on user's selected branch
```

---

**Last Updated:** 2026-02-14  
**Status:** ✅ Fully Implemented and Running  
**Breaking Changes:** None (backwards compatible)
