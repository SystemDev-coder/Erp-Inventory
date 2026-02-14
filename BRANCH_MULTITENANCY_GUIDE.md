# Branch-Based Multi-Tenancy Implementation Guide

## Overview

This ERP system now implements **branch-based multi-tenancy**, allowing:
- Each branch to have its own isolated data (products, customers, suppliers, etc.)
- Users to belong to multiple branches
- Users to only see data from their assigned branches
- Complete data isolation between branches

## Database Changes

### 1. New `user_branch` Junction Table

Users can now belong to multiple branches:

```sql
CREATE TABLE ims.user_branch (
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, branch_id)
);
```

**Key Points:**
- **Many-to-Many**: One user can access multiple branches
- **is_primary**: Indicates the user's default/main branch
- **Automatic Migration**: Existing `users.branch_id` entries are automatically migrated to this table

### 2. Branch-Specific Tables

The following tables now include `branch_id` column:

| Table | Description |
|-------|-------------|
| `categories` | Product categories are branch-specific |
| `suppliers` | Each branch manages its own suppliers |
| `customers` | Customer records are branch-specific |
| `products` | Products belong to specific branches |
| `accounts` | Bank/cash accounts are branch-specific |
| `employees` | Employees are assigned to branches |

### 3. Unique Constraints

Unique constraints are now **branch-scoped**:

- **Product Barcodes**: Unique within a branch (different branches can have same barcode)
- **Category Names**: Unique within a branch
- **Other constraints**: Applied per-branch as needed

### 4. Audit Columns

Added to key tables:
- `created_by` - User who created the record
- `updated_by` - User who last updated the record
- `created_at` - Timestamp of creation
- `updated_at` - Timestamp of last update

## Helper Functions

### 1. Get User's Branches

```sql
SELECT * FROM ims.fn_user_branches(user_id);
```

Returns:
- `branch_id` - Branch ID
- `branch_name` - Branch name
- `is_primary` - Whether this is user's primary branch

### 2. Get User's Primary Branch

```sql
SELECT ims.fn_user_primary_branch(user_id);
```

Returns the user's primary branch ID.

### 3. Check Branch Access

```sql
SELECT ims.fn_user_has_branch_access(user_id, branch_id);
```

Returns `TRUE` if user has access to the branch, `FALSE` otherwise.

## Database Views

### 1. Branch Products View

```sql
SELECT * FROM ims.v_branch_products WHERE branch_id = ?;
```

Provides products with all related data (category, unit, supplier, tax, branch name).

### 2. Branch Customers View

```sql
SELECT * FROM ims.v_branch_customers WHERE branch_id = ?;
```

### 3. Branch Suppliers View

```sql
SELECT * FROM ims.v_branch_suppliers WHERE branch_id = ?;
```

## Backend Implementation

### 1. Use Branch Access Middleware

Add to your routes:

```typescript
import { loadUserBranches, validateBranchAccess } from '../middleware/branchAccess.middleware';

// Load user's accessible branches
router.use(loadUserBranches);

// On routes that need branch validation
router.get('/products', async (req, res) => {
  // req.userBranches - array of accessible branch IDs
  // req.primaryBranch - user's primary branch ID
  // req.currentBranch - currently selected branch ID
});
```

### 2. Filter Queries by Branch

**Example: List Products**

```typescript
import { buildBranchFilter } from '../middleware/branchAccess.middleware';

async listProducts(req: Request): Promise<Product[]> {
  const { clause, params } = buildBranchFilter(req, 'p');
  
  return queryMany(
    `SELECT p.* FROM ims.products p 
     WHERE ${clause} AND p.is_active = TRUE
     ORDER BY p.name`,
    params
  );
}
```

### 3. Validate Branch on Create/Update

**Example: Create Product**

```typescript
async createProduct(input: ProductInput, req: Request): Promise<Product> {
  const branchId = input.branchId || req.currentBranch;
  
  // Verify user has access to this branch
  if (!req.userBranches?.includes(branchId)) {
    throw new Error('Access denied to this branch');
  }
  
  return queryOne(
    `INSERT INTO ims.products (branch_id, name, ...)
     VALUES ($1, $2, ...)
     RETURNING *`,
    [branchId, input.name, ...]
  );
}
```

### 4. Branch Context in Transactions

Always include branch_id when creating records:

```typescript
await client.query(
  `INSERT INTO ims.sales (branch_id, user_id, customer_id, total, ...)
   VALUES ($1, $2, $3, $4, ...)`,
  [req.currentBranch, req.user.userId, input.customerId, input.total, ...]
);
```

## Frontend Implementation

### 1. Branch Selector Component

Create a branch selector for users with multiple branches:

```typescript
const BranchSelector = () => {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);

  useEffect(() => {
    // Fetch user's accessible branches
    api.get('/auth/user-branches').then(setBranches);
  }, []);

  const handleBranchChange = (branchId) => {
    setCurrentBranch(branchId);
    // Store in localStorage or context
    localStorage.setItem('currentBranch', branchId);
    // Refresh page data
    window.location.reload();
  };

  // Only show if user has multiple branches
  if (branches.length <= 1) return null;

  return (
    <select value={currentBranch} onChange={(e) => handleBranchChange(e.target.value)}>
      {branches.map(b => (
        <option key={b.branch_id} value={b.branch_id}>
          {b.branch_name}
        </option>
      ))}
    </select>
  );
};
```

### 2. Include Branch in API Calls

**Option A: Query Parameter**

```typescript
api.get(`/products?branchId=${currentBranch}`);
```

**Option B: Header**

```typescript
api.get('/products', {
  headers: { 'X-Branch-Id': currentBranch }
});
```

**Option C: Request Body**

```typescript
api.post('/products', {
  branchId: currentBranch,
  ...productData
});
```

### 3. Context Provider (Recommended)

```typescript
const BranchContext = createContext();

export const BranchProvider = ({ children }) => {
  const [userBranches, setUserBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);

  useEffect(() => {
    // Load from localStorage or API
    const saved = localStorage.getItem('currentBranch');
    if (saved) setCurrentBranch(parseInt(saved));
    
    // Fetch accessible branches
    api.get('/auth/user-branches').then(setUserBranches);
  }, []);

  return (
    <BranchContext.Provider value={{ userBranches, currentBranch, setCurrentBranch }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => useContext(BranchContext);
```

## Migration Guide

### For Existing Deployments

1. **Backup Database First!**
   ```bash
   pg_dump -U username -d dbname > backup.sql
   ```

2. **Apply Migration**
   ```bash
   psql -U username -d dbname -f server/sql/20260214_branch_based_multitenancy.sql
   ```

3. **Verify Migration**
   ```sql
   -- Check user_branch table
   SELECT * FROM ims.user_branch;
   
   -- Check branch_id columns
   SELECT table_name, column_name 
   FROM information_schema.columns 
   WHERE table_schema = 'ims' AND column_name = 'branch_id';
   ```

4. **Assign Users to Branches**
   ```sql
   -- Add user to additional branches
   INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
   VALUES (1, 2, FALSE);
   ```

### For Fresh Installations

The complete schema (`complete_inventory_erp_schema.sql`) already includes all branch-based multi-tenancy features.

## API Endpoints to Update

Update these endpoint patterns:

### Authentication

- `GET /auth/user-branches` - Get user's accessible branches
- `GET /auth/primary-branch` - Get user's primary branch

### CRUD Operations

All list/create/update operations should:

1. **List**: Filter by user's accessible branches
2. **Create**: Require branch_id, validate access
3. **Update**: Verify user has access to record's branch
4. **Delete**: Verify user has access to record's branch

**Example API Routes:**

```
GET    /products              - List (filtered by accessible branches)
POST   /products              - Create (requires branch_id in body)
GET    /products/:id          - Get (verify branch access)
PUT    /products/:id          - Update (verify branch access)
DELETE /products/:id          - Delete (verify branch access)
```

## Testing

### Test User Branch Access

```sql
-- Create test branches
INSERT INTO ims.branches (branch_name) VALUES ('Branch A'), ('Branch B');

-- Assign user to multiple branches
INSERT INTO ims.user_branch (user_id, branch_id, is_primary) VALUES
  (1, 1, TRUE),   -- Primary branch
  (1, 2, FALSE);  -- Secondary branch

-- Test access function
SELECT ims.fn_user_has_branch_access(1, 1); -- Should return TRUE
SELECT ims.fn_user_has_branch_access(1, 3); -- Should return FALSE
```

### Test Data Isolation

```sql
-- Create products in different branches
INSERT INTO ims.products (branch_id, cat_id, name, barcode) VALUES
  (1, 1, 'Product A', 'A001'),
  (2, 2, 'Product B', 'A001'); -- Same barcode, different branch - OK

-- Query with branch filter
SELECT * FROM ims.products WHERE branch_id = 1;
```

## Security Best Practices

1. **Always Validate Branch Access**: Never trust client-provided branch_id without validation
2. **Use Middleware**: Apply `loadUserBranches` to all protected routes
3. **Log Branch Access**: Include branch_id in audit logs
4. **Row-Level Security (Optional)**: Consider PostgreSQL RLS for additional security
5. **API Rate Limiting**: Implement per-branch rate limiting

## Common Patterns

### Pattern 1: Single Branch Operations

```typescript
// User selects one branch, sees only that branch's data
WHERE products.branch_id = $1 -- current branch
```

### Pattern 2: Multi-Branch View

```typescript
// User sees data from all accessible branches
WHERE products.branch_id IN ($1, $2, $3) -- all accessible branches
```

### Pattern 3: Branch Comparison

```typescript
// Compare data across branches (for managers)
SELECT branch_id, COUNT(*) as product_count
FROM products
WHERE branch_id IN (SELECT branch_id FROM user_branch WHERE user_id = $1)
GROUP BY branch_id;
```

## Troubleshooting

### Issue: User has no branch access

```sql
-- Check user_branch entries
SELECT * FROM ims.user_branch WHERE user_id = ?;

-- Add branch access
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
VALUES (?, ?, TRUE);
```

### Issue: Unique constraint violation

If you get unique constraint errors, remember:
- Unique constraints are now branch-scoped
- Check if branch_id is included in your INSERT
- Verify the unique index includes branch_id

### Issue: Foreign key constraint

Some related records (like categories, suppliers) must exist in the same branch:

```sql
-- Wrong: Product in branch 1, category in branch 2
INSERT INTO products (branch_id, cat_id) VALUES (1, 999); -- Error if cat 999 is in branch 2

-- Right: Ensure category exists in same branch
SELECT cat_id FROM categories WHERE branch_id = 1 AND cat_name = 'Electronics';
```

## Performance Considerations

1. **Indexes**: All `branch_id` columns are indexed for performance
2. **Query Planning**: Include branch_id early in WHERE clauses
3. **Connection Pooling**: Consider separate pools per branch for very large systems
4. **Caching**: Implement branch-specific caching strategies

## Next Steps

1. ✅ Database migration applied
2. ✅ Helper functions created
3. ✅ Middleware implemented
4. ⏳ Update all backend services to use branch filtering
5. ⏳ Add branch selector to frontend
6. ⏳ Update all API calls to include branch context
7. ⏳ Test thoroughly with multiple branches
8. ⏳ Update API documentation
9. ⏳ Train users on multi-branch access

## Support

For questions or issues with branch-based multi-tenancy:
1. Check this documentation
2. Review the migration SQL file
3. Test with the provided helper functions
4. Verify middleware is properly applied

---

**Last Updated**: 2026-02-14  
**Migration File**: `server/sql/20260214_branch_based_multitenancy.sql`  
**Schema File**: `server/sql/complete_inventory_erp_schema.sql`
