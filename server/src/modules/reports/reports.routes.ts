import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import salesReportsRoutes from './sales/salesReports.routes';
import inventoryReportsRoutes from './inventory/inventoryReports.routes';
import purchaseReportsRoutes from './purchase/purchaseReports.routes';
import financialReportsRoutes from './financial/financialReports.routes';
import hrReportsRoutes from './hr/hrReports.routes';
import customerReportsRoutes from './customer/customerReports.routes';

const router = Router();

router.use(requireAuth);

router.use('/sales', requireAnyPerm(['reports.all', 'sales.view', 'sales.reports']), salesReportsRoutes);
router.use(
  '/inventory',
  requireAnyPerm(['reports.all', 'inventory.view', 'stock.view', 'items.view', 'inventory.reports']),
  inventoryReportsRoutes
);
router.use(
  '/purchase',
  requireAnyPerm(['reports.all', 'purchases.view', 'suppliers.view', 'purchases.reports']),
  purchaseReportsRoutes
);
router.use(
  '/financial',
  requireAnyPerm([
    'reports.all',
    'finance.reports',
    'finance.balance',
    'finance.income',
    'finance.cashflow',
    'ledgers.view',
    'accounts.view',
    'account_transactions.view',
    'expenses.view',
    'customer_receipts.view',
    'supplier_payments.view',
  ]),
  financialReportsRoutes
);
router.use(
  '/hr',
  requireAnyPerm([
    'reports.all',
    'hr.reports',
    'employees.view',
    'employee_shift_assignments.view',
    'employee_loans.view',
    'loan_payments.view',
    'payroll_runs.view',
    'payroll_lines.view',
    'employee_payments.view',
  ]),
  hrReportsRoutes
);
router.use(
  '/customer',
  requireAnyPerm([
    'reports.all',
    'customers.view',
    'customer_receipts.view',
    'sales.view',
    'sales_returns.view',
    'customer_ledger.view',
  ]),
  customerReportsRoutes
);

export default router;
