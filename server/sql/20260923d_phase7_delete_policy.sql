-- Phase 7: Expenses, Payroll, Employees, Accounts (COA), Categories, Units,
-- Taxes, Branches - the remaining modules under the Central Delete
-- Architecture (Phase 2, 20260922_central_delete_architecture.sql).
--
-- Audit findings and per-relationship decisions (agreed with the user before
-- this migration was written):
--
-- Expenses: deleteExpense already goes through softDeleteById but had zero
-- policy coverage, so any expense with a budget/charge was unconditionally
-- blocked. Both of its real-FK dependents are classified 'preserve' below.
-- deleteExpenseCharge/deleteExpenseBudget (finance.service.ts) were also
-- switched from hard DELETE to softDeleteById in this phase, matching their
-- sibling delete functions fixed in Batch 1.
--
-- Payroll: deliberately UNCHANGED. deletePayroll (finance.service.ts) already
-- reverses GL manually and soft-deletes employee_payments -> payroll_lines ->
-- payroll_runs bottom-up in the correct order. Adding cascade policy rows
-- for payroll_runs/payroll_lines would let a future direct
-- softDeleteById('payroll_runs', ...) call cascade through the generic
-- engine WITHOUT the GL reversal deletePayroll performs by hand - the exact
-- "accounts.balance permanently overstated" bug class already fixed once
-- (Batch 1, Finding F1). Leaving these dependents unclassified (default
-- 'block') is a deliberate safety net, same reasoning as sale_payments/
-- supplier_payments in Phase 5.
--
-- Employees: employees.service.ts#delete() used to hard-DELETE, blocked
-- outright by an all-or-nothing dependency count across 5 tables (so almost
-- no real employee could ever be deleted, only deactivated). Per the user's
-- decision, employees now archive via softDeleteById with all 5 dependents
-- preserved - payroll/salary/loan/shift history stays fully intact, hidden
-- alongside the employee. "Deactivate" (still employed, temporarily
-- inactive) remains a separate, unrelated action.
--
-- Accounts (Chart of Accounts): accounts.service.ts#remove() used to hard
-- DELETE with zero policy coverage (protected only by an asset-type check,
-- a zero-balance check, and whatever real FK RESTRICT constraints happened
-- to exist) - the 6 ON DELETE SET NULL dependents had NO protection at all,
-- same silent-orphan risk already fixed for categories/units/taxes in Batch
-- 1, but here against GL/ledger data. Now archives via softDeleteById.
-- Per the user's decision:
--   - All genuinely historical/ledger dependents -> 'preserve'.
--   - finance_profit_share_rules.{source,retained,reinvestment,reserve}_acc_id
--     and finance_profit_share_partners.acc_id are deliberately LEFT
--     UNCLASSIFIED (default 'block'): these represent ACTIVE, ongoing
--     configuration, not history - archiving an account still wired into a
--     live profit-share rule must be blocked until it's reassigned, not
--     silently allowed to leave the rule pointing at a hidden account.
--   - Core system accounts (Cash, Accounts Receivable, Inventory,
--     Retained Earnings, ... - the COA_SPECS list in coaDefaults.ts) get a
--     separate, name-based guard in accounts.service.ts#remove() itself
--     (not expressible as a delete-dependency policy row), since a
--     freshly-created branch's special accounts can have zero balance and
--     zero history and would otherwise pass every check here.
--
-- Categories / Units / Taxes: audited, NOT changed. Each already has a
-- complete, correct, single-table app-level guard (Batch 1) matching the
-- schema's only real FK dependent 1:1 (items.category_id, items.unit_id,
-- sales.tax_id - all ON DELETE SET NULL). No gap found, no policy rows
-- needed.
--
-- Branches: deleteBranch (inventory.service.ts) already calls
-- softDeleteById, but with zero policy rows every one of ims.branches' ~59
-- FK-dependent columns defaulted to 'block' - in practice a branch could
-- only ever be archived if it had NEVER been used for anything. Per the
-- user's decision, ALL branch dependents below are 'preserve', not
-- 'cascade': archiving a branch hides only the branch record itself (e.g.
-- from "active branches" pickers) while every table under it - master data
-- (accounts, customers, items, ...) AND transactional history alike - stays
-- fully intact and queryable exactly as before. Cascading the archive into
-- the branch's own master data was considered and deliberately rejected:
-- it would require classifying a second level of relationships (e.g.
-- categories -> items, accounts -> account_transactions) that were
-- intentionally left 'block' at their own layer above, multiplying scope
-- and risk for comparatively little benefit.
--
-- Composite-PK dependents in this phase (user_branches, item_suppliers,
-- warehouse_stock) are 'preserve' only, never 'cascade' - consistent with
-- every prior phase (the cascade engine only supports single-column PKs).

INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES
  -- Expenses
  ('expenses', 'expense_budgets', 'exp_id', 'preserve', 'Budget definitions must survive an expense category being archived.'),
  ('expenses', 'expense_charges', 'exp_id', 'preserve', 'Historical charges (with their own GL history) must survive an expense category being archived.'),

  -- Employees
  ('employees', 'payroll_lines', 'emp_id', 'preserve', 'Historical payroll line must survive an employee being archived.'),
  ('employees', 'employee_payments', 'emp_id', 'preserve', 'Historical salary payment must survive an employee being archived.'),
  ('employees', 'employee_loans', 'emp_id', 'preserve', 'Historical loan origination must survive an employee being archived.'),
  ('employees', 'employee_salary', 'emp_id', 'preserve', 'Historical salary-rate record must survive an employee being archived.'),
  ('employees', 'employee_shift_assignments', 'emp_id', 'preserve', 'Shift-assignment history must survive an employee being archived.'),

  -- Accounts (Chart of Accounts) - historical/ledger dependents.
  -- finance_profit_share_rules/finance_profit_share_partners intentionally
  -- excluded (see header comment) - they stay 'block' by default.
  ('accounts', 'sale_payments', 'acc_id', 'preserve', 'Historical sale payment must survive an account being archived.'),
  ('accounts', 'supplier_payments', 'acc_id', 'preserve', 'Historical supplier payment must survive an account being archived.'),
  ('accounts', 'customer_ledger', 'acc_id', 'preserve', 'Historical AR ledger entry must survive an account being archived.'),
  ('accounts', 'supplier_ledger', 'acc_id', 'preserve', 'Historical AP ledger entry must survive an account being archived.'),
  ('accounts', 'account_transactions', 'acc_id', 'preserve', 'The GL itself - historical transaction lines must survive an account being archived.'),
  ('accounts', 'other_incomes', 'acc_id', 'preserve', 'Historical other-income record must survive an account being archived.'),
  ('accounts', 'account_transfers', 'from_acc_id', 'preserve', 'Historical transfer document must survive an account being archived.'),
  ('accounts', 'account_transfers', 'to_acc_id', 'preserve', 'Same reasoning, destination side.'),
  ('accounts', 'journal_lines', 'acc_id', 'preserve', 'Historical double-entry GL line must survive an account being archived.'),
  ('accounts', 'capital_contributions', 'acc_id', 'preserve', 'Historical equity event must survive an account being archived.'),
  ('accounts', 'capital_contributions', 'equity_acc_id', 'preserve', 'Same reasoning, equity-account side.'),
  ('accounts', 'owner_drawings', 'acc_id', 'preserve', 'Historical equity event must survive an account being archived.'),
  ('accounts', 'owner_drawings', 'equity_acc_id', 'preserve', 'Same reasoning, equity-account side.'),
  ('accounts', 'finance_profit_allocations', 'acc_id', 'preserve', 'Historical per-closing-period allocation must survive an account being archived.'),
  ('accounts', 'customer_receipts', 'acc_id', 'preserve', 'Historical receipt must survive an account being archived.'),
  ('accounts', 'supplier_receipts', 'acc_id', 'preserve', 'Historical receipt must survive an account being archived.'),
  ('accounts', 'expense_charges', 'acc_id', 'preserve', 'Historical expense charge must survive an account being archived.'),
  ('accounts', 'expense_payments', 'acc_id', 'preserve', 'Historical expense payment must survive an account being archived.'),
  ('accounts', 'employee_payments', 'acc_id', 'preserve', 'Historical payroll payment must survive an account being archived.'),
  ('accounts', 'loan_payments', 'acc_id', 'preserve', 'Historical loan repayment must survive an account being archived.'),
  ('accounts', 'liability_payments', 'liability_acc_id', 'preserve', 'Historical settlement record must survive an account being archived.'),
  ('accounts', 'liability_payments', 'pay_from_acc_id', 'preserve', 'Same reasoning, paying-account side.'),

  -- Branches - every dependent preserved, none cascaded (see header comment).
  ('branches', 'user_branches', 'branch_id', 'preserve', 'User access grants for this branch stay recorded, just no longer reachable via an active branch.'),
  ('branches', 'audit_logs', 'branch_id', 'preserve', 'Audit log must survive a branch being archived.'),
  ('branches', 'categories', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'units', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'taxes', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'suppliers', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'customers', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'accounts', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'fixed_assets', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'items', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'item_suppliers', 'branch_id', 'preserve', 'Composite PK - cannot cascade. No history value, safe to leave.'),
  ('branches', 'warehouses', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'stores', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'warehouse_stock', 'branch_id', 'preserve', 'Composite PK - cannot cascade. Stock snapshot stays intact.'),
  ('branches', 'inventory_transaction', 'branch_id', 'preserve', 'Historical inventory log must survive a branch being archived.'),
  ('branches', 'inventory_movements', 'branch_id', 'preserve', 'Historical movement log must survive a branch being archived.'),
  ('branches', 'sales', 'branch_id', 'preserve', 'Historical sales must survive a branch being archived.'),
  ('branches', 'sale_items', 'branch_id', 'preserve', 'Historical sale line items must survive a branch being archived.'),
  ('branches', 'sale_payments', 'branch_id', 'preserve', 'Historical sale payments must survive a branch being archived.'),
  ('branches', 'purchases', 'branch_id', 'preserve', 'Historical purchases must survive a branch being archived.'),
  ('branches', 'purchase_items', 'branch_id', 'preserve', 'Historical purchase line items must survive a branch being archived.'),
  ('branches', 'supplier_payments', 'branch_id', 'preserve', 'Historical supplier payments must survive a branch being archived.'),
  ('branches', 'customer_ledger', 'branch_id', 'preserve', 'Historical AR ledger must survive a branch being archived.'),
  ('branches', 'supplier_ledger', 'branch_id', 'preserve', 'Historical AP ledger must survive a branch being archived.'),
  ('branches', 'account_transactions', 'branch_id', 'preserve', 'The GL itself must survive a branch being archived.'),
  ('branches', 'other_incomes', 'branch_id', 'preserve', 'Historical other-income records must survive a branch being archived.'),
  ('branches', 'account_transfers', 'branch_id', 'preserve', 'Historical transfer documents must survive a branch being archived.'),
  ('branches', 'journal_entries', 'branch_id', 'preserve', 'Historical GL headers must survive a branch being archived.'),
  ('branches', 'capital_contributions', 'branch_id', 'preserve', 'Historical equity events must survive a branch being archived.'),
  ('branches', 'owner_drawings', 'branch_id', 'preserve', 'Historical equity events must survive a branch being archived.'),
  ('branches', 'finance_closing_periods', 'branch_id', 'preserve', 'Historical period-close records must survive a branch being archived.'),
  ('branches', 'finance_closing_summaries', 'branch_id', 'preserve', 'Historical closing snapshots must survive a branch being archived.'),
  ('branches', 'finance_profit_share_rules', 'branch_id', 'preserve', 'Configuration stays intact - the branch merely stops being pickable, not deleted.'),
  ('branches', 'finance_profit_share_partners', 'branch_id', 'preserve', 'Configuration stays intact - the branch merely stops being pickable, not deleted.'),
  ('branches', 'finance_profit_allocations', 'branch_id', 'preserve', 'Historical allocations must survive a branch being archived.'),
  ('branches', 'customer_receipts', 'branch_id', 'preserve', 'Historical receipts must survive a branch being archived.'),
  ('branches', 'supplier_receipts', 'branch_id', 'preserve', 'Historical receipts must survive a branch being archived.'),
  ('branches', 'expenses', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'expense_charges', 'branch_id', 'preserve', 'Historical expense charges must survive a branch being archived.'),
  ('branches', 'expense_payments', 'branch_id', 'preserve', 'Historical expense payments must survive a branch being archived.'),
  ('branches', 'sales_returns', 'branch_id', 'preserve', 'Historical returns must survive a branch being archived.'),
  ('branches', 'sales_return_items', 'branch_id', 'preserve', 'Historical return line items must survive a branch being archived.'),
  ('branches', 'purchase_returns', 'branch_id', 'preserve', 'Historical returns must survive a branch being archived.'),
  ('branches', 'purchase_return_items', 'branch_id', 'preserve', 'Historical return line items must survive a branch being archived.'),
  ('branches', 'transfers', 'from_branch_id', 'preserve', 'Historical transfer documents must survive a branch being archived.'),
  ('branches', 'transfers', 'to_branch_id', 'preserve', 'Same reasoning, destination side.'),
  ('branches', 'warehouse_transfers', 'branch_id', 'preserve', 'Historical transfer documents must survive a branch being archived.'),
  ('branches', 'warehouse_transfer_items', 'branch_id', 'preserve', 'Historical transfer line items must survive a branch being archived.'),
  ('branches', 'employees', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'salary_types', 'branch_id', 'preserve', 'Master data stays fully intact when its branch is archived.'),
  ('branches', 'payroll_runs', 'branch_id', 'preserve', 'Historical payroll runs must survive a branch being archived.'),
  ('branches', 'payroll_lines', 'branch_id', 'preserve', 'Historical payroll lines must survive a branch being archived.'),
  ('branches', 'employee_payments', 'branch_id', 'preserve', 'Historical payments must survive a branch being archived.'),
  ('branches', 'employee_loans', 'branch_id', 'preserve', 'Historical loans must survive a branch being archived.'),
  ('branches', 'loan_payments', 'branch_id', 'preserve', 'Historical loan repayments must survive a branch being archived.'),
  ('branches', 'employee_shift_assignments', 'branch_id', 'preserve', 'Shift-assignment history must survive a branch being archived.'),
  ('branches', 'notifications', 'branch_id', 'preserve', 'Notification history stays intact.'),
  ('branches', 'liability_payments', 'branch_id', 'preserve', 'Historical settlement records must survive a branch being archived.'),
  ('branches', 'shifts', 'branch_id', 'preserve', 'Historical POS cash sessions must survive a branch being archived.')
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
