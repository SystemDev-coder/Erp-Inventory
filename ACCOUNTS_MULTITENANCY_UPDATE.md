# Accounts Multi-Tenancy Update

## ✅ Changes Applied to Accounts System

### 1. **Enhanced Accounts Table**

#### Added Branch-Scoped Unique Constraint
```sql
CONSTRAINT uq_account_name_per_branch UNIQUE (branch_id, name)
```

**Why This Matters:**
- Account names must be unique within each branch
- Different branches can have accounts with the same name
- Prevents duplicate account names in the same branch
- Maintains data integrity

#### Additional Indexes
```sql
CREATE INDEX idx_accounts_branch ON ims.accounts(branch_id);
CREATE INDEX idx_accounts_active ON ims.accounts(branch_id, is_active) WHERE is_active = TRUE;
```

**Performance Benefits:**
- Fast filtering by branch
- Optimized queries for active accounts only
- Improved query performance for branch-specific account lists

---

### 2. **New Database Views for Accounts**

#### `v_branch_accounts` - All Accounts with Details
```sql
SELECT * FROM ims.v_branch_accounts WHERE branch_id = ?;
```

**Returns:**
- All account fields
- `branch_name` - Name of the branch
- `currency_name` - Full currency name
- `currency_symbol` - Currency symbol ($, S, etc.)

**Use Case:** Display complete account information with branch and currency details

#### `v_active_branch_accounts` - Active Accounts Only
```sql
SELECT * FROM ims.v_active_branch_accounts WHERE branch_id = ?;
```

**Returns:**
- Same as above, but only for `is_active = TRUE` accounts

**Use Case:** List available accounts for transactions (payments, receipts, etc.)

---

### 3. **New Helper Functions**

#### `fn_branch_accounts()` - Get Accounts for Specific Branch
```sql
-- Get all active accounts for branch
SELECT * FROM ims.fn_branch_accounts(branch_id);

-- Get all accounts (including inactive) for branch
SELECT * FROM ims.fn_branch_accounts(branch_id, FALSE);
```

**Parameters:**
- `p_branch_id` (BIGINT) - The branch ID
- `p_active_only` (BOOLEAN) - Default TRUE, set FALSE to include inactive accounts

**Returns:**
- `acc_id` - Account ID
- `branch_id` - Branch ID
- `name` - Account name
- `institution` - Bank/institution name
- `currency_code` - Currency code (USD, SOS, etc.)
- `balance` - Current balance
- `is_active` - Active status
- `branch_name` - Branch name

**Use Case:** Backend API to get accounts for dropdowns, lists, etc.

#### `fn_branch_total_balance()` - Get Total Balance for Branch
```sql
-- Total balance across all currencies
SELECT ims.fn_branch_total_balance(branch_id);

-- Total balance for specific currency
SELECT ims.fn_branch_total_balance(branch_id, 'USD');
```

**Parameters:**
- `p_branch_id` (BIGINT) - The branch ID
- `p_currency_code` (CHAR(3)) - Optional, filter by currency

**Returns:**
- `NUMERIC` - Total balance of all active accounts

**Use Case:** Dashboard, reports, financial summaries

---

### 4. **Updated Tables Confirmed**

All these tables already have `branch_id` and are properly configured:

| Table | Branch Column | Description |
|-------|--------------|-------------|
| `accounts` | `branch_id` | Bank/cash accounts per branch |
| `charges` | `branch_id` | Customer charges |
| `receipts` | `branch_id` | Payment receipts |
| `supplier_charges` | `branch_id` | Supplier charges |
| `supplier_payments` | `branch_id` | Supplier payments |
| `expenses` | `branch_id` | Expense records |
| `expense_payment` | (via expenses) | Expense payments |
| `employee_payments` | `branch_id` | Employee salary payments |
| `employee_loans` | `branch_id` | Employee loans |
| `loan_payments` | (via loans) | Loan repayments |

---

## 🚀 Backend Implementation Guide

### 1. **List Accounts for Current Branch**

```typescript
// In your accounts service/controller
import { Request } from 'express';

async getAccountsForBranch(req: Request) {
  const branchId = req.currentBranch; // From middleware
  
  return await pool.query(
    `SELECT * FROM ims.fn_branch_accounts($1, TRUE)`,
    [branchId]
  );
}
```

### 2. **Create Account with Branch**

```typescript
async createAccount(input: AccountInput, req: Request) {
  const branchId = req.currentBranch;
  
  // Unique constraint will prevent duplicate names in same branch
  return await pool.query(
    `INSERT INTO ims.accounts (branch_id, name, institution, currency_code, balance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [branchId, input.name, input.institution, input.currencyCode, input.balance]
  );
}
```

### 3. **Get Branch Total Balance**

```typescript
async getBranchTotalBalance(branchId: number, currencyCode?: string) {
  const result = await pool.query(
    `SELECT ims.fn_branch_total_balance($1, $2) as total`,
    [branchId, currencyCode || null]
  );
  return result.rows[0].total;
}
```

### 4. **Filter by Multiple Branches (for managers)**

```typescript
async getAccountsForMultipleBranches(req: Request) {
  const branchIds = req.userBranches; // [1, 2, 3]
  
  return await pool.query(
    `SELECT * FROM ims.v_branch_accounts 
     WHERE branch_id = ANY($1) 
     ORDER BY branch_name, name`,
    [branchIds]
  );
}
```

---

## 🎨 Frontend Implementation Guide

### 1. **Account Selector Component**

```typescript
interface Account {
  acc_id: number;
  branch_id: number;
  name: string;
  institution: string;
  currency_code: string;
  balance: number;
  branch_name: string;
}

const AccountSelector = ({ branchId }: { branchId: number }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.get(`/accounts?branchId=${branchId}`).then(setAccounts);
  }, [branchId]);

  return (
    <select>
      {accounts.map(acc => (
        <option key={acc.acc_id} value={acc.acc_id}>
          {acc.name} ({acc.currency_code}) - Balance: {acc.balance}
        </option>
      ))}
    </select>
  );
};
```

### 2. **Accounts List Page**

```typescript
const AccountsPage = () => {
  const { currentBranch } = useBranch();
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    api.get(`/accounts?branchId=${currentBranch}`).then(setAccounts);
  }, [currentBranch]);

  return (
    <div>
      <h2>Accounts - {currentBranch?.branch_name}</h2>
      <table>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Institution</th>
            <th>Currency</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(acc => (
            <tr key={acc.acc_id}>
              <td>{acc.name}</td>
              <td>{acc.institution}</td>
              <td>{acc.currency_code}</td>
              <td>{acc.balance}</td>
              <td>{acc.is_active ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### 3. **Dashboard - Total Balance Widget**

```typescript
const TotalBalanceWidget = () => {
  const { currentBranch } = useBranch();
  const [totalUSD, setTotalUSD] = useState(0);
  const [totalSOS, setTotalSOS] = useState(0);

  useEffect(() => {
    // Get USD balance
    api.get(`/accounts/total-balance?branchId=${currentBranch}&currency=USD`)
       .then(data => setTotalUSD(data.total));
    
    // Get SOS balance
    api.get(`/accounts/total-balance?branchId=${currentBranch}&currency=SOS`)
       .then(data => setTotalSOS(data.total));
  }, [currentBranch]);

  return (
    <div className="balance-widget">
      <h3>Total Branch Balance</h3>
      <div>USD: ${totalUSD.toFixed(2)}</div>
      <div>SOS: S{totalSOS.toFixed(2)}</div>
    </div>
  );
};
```

---

## ✅ What's Working Now

### Database Level:
- ✅ Accounts are isolated by branch
- ✅ Account names are unique per branch (not globally)
- ✅ All account-related transactions include branch_id
- ✅ Helper functions for easy querying
- ✅ Views for displaying account data with branch info
- ✅ Indexes for fast queries

### Application Level (What You Need to Implement):
1. **Backend API Routes:**
   - `GET /accounts` - List accounts (filtered by user's branch)
   - `POST /accounts` - Create account (include branch_id)
   - `PUT /accounts/:id` - Update account (verify branch access)
   - `DELETE /accounts/:id` - Delete account (verify branch access)
   - `GET /accounts/total-balance` - Get total balance for branch

2. **Frontend Components:**
   - Account selector dropdown
   - Accounts list page
   - Account creation form
   - Dashboard balance widgets

---

## 🔍 Testing the Changes

### 1. Test Unique Constraint
```sql
-- This should work (different branches)
INSERT INTO ims.accounts (branch_id, name, currency_code) VALUES (1, 'Cash Account', 'USD');
INSERT INTO ims.accounts (branch_id, name, currency_code) VALUES (2, 'Cash Account', 'USD');

-- This should fail (same branch, same name)
INSERT INTO ims.accounts (branch_id, name, currency_code) VALUES (1, 'Cash Account', 'USD');
-- ERROR: duplicate key value violates unique constraint "uq_account_name_per_branch"
```

### 2. Test Views
```sql
-- Get all accounts for branch 1 with details
SELECT * FROM ims.v_branch_accounts WHERE branch_id = 1;

-- Get only active accounts
SELECT * FROM ims.v_active_branch_accounts WHERE branch_id = 1;
```

### 3. Test Functions
```sql
-- Get accounts for branch 1 (active only)
SELECT * FROM ims.fn_branch_accounts(1);

-- Get all accounts for branch 1 (including inactive)
SELECT * FROM ims.fn_branch_accounts(1, FALSE);

-- Get total balance for branch 1 (all currencies)
SELECT ims.fn_branch_total_balance(1);

-- Get USD balance for branch 1
SELECT ims.fn_branch_total_balance(1, 'USD');
```

---

## 📁 Files Updated

1. **`server/sql/complete_inventory_erp_schema.sql`**
   - Added unique constraint to accounts table
   - Added additional indexes
   - Added v_branch_accounts view
   - Added v_active_branch_accounts view
   - Added fn_branch_accounts() function
   - Added fn_branch_total_balance() function

2. **`server/sql/20260214_branch_based_multitenancy.sql`**
   - Same changes for existing installations

---

## 🎉 Summary

The accounts system is now **fully configured** for branch-based multi-tenancy:

- ✅ Data isolation between branches
- ✅ Unique account names per branch
- ✅ Helper functions for easy querying
- ✅ Views for rich data display
- ✅ Performance optimized with indexes
- ✅ All related tables (charges, receipts, payments) properly linked

**Your containers are running with these changes!**

Access your application:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Database: localhost:5433

---

**Last Updated:** 2026-02-14  
**Status:** ✅ Complete and Running
