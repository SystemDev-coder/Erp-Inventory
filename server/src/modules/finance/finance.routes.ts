import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import {
  listAccountTransfers,
  createAccountTransfer,
  updateAccountTransfer,
  listCustomerReceipts,
  createCustomerReceipt,
  updateCustomerReceipt,
  deleteCustomerReceipt,
  listSupplierReceipts,
  createSupplierReceipt,
  updateSupplierReceipt,
  deleteSupplierReceipt,
  listExpenseCharges,
  createExpenseCharge,
  updateExpenseCharge,
  deleteExpenseCharge,
  listExpenseBudgets,
  createExpenseBudget,
  updateExpenseBudget,
  deleteExpenseBudget,
  createExpense,
  chargeExpenseBudget,
  manageExpenseBudgetCharges,
  createExpensePayment,
  listExpensePayments,
  deleteExpensePayment,
  chargeSalaries,
  listPayroll,
  paySalary,
  deletePayroll,
  listExpenses,
  updateExpense,
  deleteExpense,
  listCustomerUnpaid,
  getCustomerCombinedBalance,
  listSupplierUnpaid,
  getSupplierCombinedBalance,
  listSupplierOutstandingPurchases,
} from './finance.controller';
import {
  listClosingPeriods,
  createClosingPeriod,
  updateClosingPeriod,
  previewClosingPeriod,
  closeClosingPeriod,
  reopenClosingPeriod,
  getClosingSummary,
  postProfitDistribution,
  listProfitShareRules,
  saveProfitShareRule,
  runScheduledClosings,
} from './financeClosing.controller';

const router = Router();

router.use(requireAuth);

// Account transfers
router.get('/transfers', listAccountTransfers);
router.post('/transfers', createAccountTransfer);
router.put('/transfers/:id', updateAccountTransfer);

// Receipts - customers
router.get('/receipts/customers/unpaid', listCustomerUnpaid);
router.get('/receipts/customers/:customerId/balance', getCustomerCombinedBalance);
router.get('/receipts/customers', listCustomerReceipts);
router.post('/receipts/customers', createCustomerReceipt);
router.put('/receipts/customers/:id', updateCustomerReceipt);
router.delete('/receipts/customers/:id', deleteCustomerReceipt);

// Receipts - suppliers
router.get('/receipts/suppliers/unpaid', listSupplierUnpaid);
router.get('/receipts/suppliers/:supplierId/balance', getSupplierCombinedBalance);
router.get('/receipts/suppliers/outstanding', listSupplierOutstandingPurchases);
router.get('/receipts/suppliers', listSupplierReceipts);
router.post('/receipts/suppliers', createSupplierReceipt);
router.put('/receipts/suppliers/:id', updateSupplierReceipt);
router.delete('/receipts/suppliers/:id', deleteSupplierReceipt);

// Expenses
router.get('/expenses', listExpenses);
router.post('/expenses', createExpense);
router.put('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);
router.get('/expenses/charges', listExpenseCharges);
router.post('/expenses/charges', createExpenseCharge);
router.put('/expenses/charges/:id', updateExpenseCharge);
router.delete('/expenses/charges/:id', deleteExpenseCharge);
router.get('/expenses/payments', listExpensePayments);
router.post('/expenses/payments', createExpensePayment);
router.delete('/expenses/payments/:id', deleteExpensePayment);

// Expense budgets
router.get('/expenses/budgets', listExpenseBudgets);
router.post('/expenses/budgets', createExpenseBudget);
router.put('/expenses/budgets/:id', updateExpenseBudget);
router.delete('/expenses/budgets/:id', deleteExpenseBudget);
router.post('/expenses/budgets/charge', chargeExpenseBudget);
router.post('/expenses/budgets/manage', manageExpenseBudgetCharges);

// Payroll
router.get('/payroll', listPayroll);
router.post('/payroll/charge', chargeSalaries);
router.post('/payroll/pay', paySalary);
router.post('/payroll/delete', deletePayroll);

// Closing finance & profit sharing
router.get('/closing/periods', requireAnyPerm(['finance.reports', 'accounts.view']), listClosingPeriods);
router.post('/closing/periods', requireAnyPerm(['finance.reports', 'accounts.view']), createClosingPeriod);
router.put('/closing/periods/:id', requireAnyPerm(['finance.reports', 'accounts.view']), updateClosingPeriod);
router.post('/closing/periods/:id/preview', requireAnyPerm(['finance.reports', 'accounts.view']), previewClosingPeriod);
router.post('/closing/periods/:id/close', requireAnyPerm(['finance.reports', 'accounts.view']), closeClosingPeriod);
router.post('/closing/periods/:id/reopen', requireAnyPerm(['system.settings']), reopenClosingPeriod);
router.get('/closing/periods/:id/summary', requireAnyPerm(['finance.reports', 'accounts.view']), getClosingSummary);
router.post('/closing/periods/:id/transfer', requireAnyPerm(['finance.reports', 'accounts.view']), postProfitDistribution);
router.get('/closing/rules', requireAnyPerm(['finance.reports', 'accounts.view']), listProfitShareRules);
router.post('/closing/rules', requireAnyPerm(['finance.reports', 'accounts.view']), saveProfitShareRule);
router.post('/closing/run-scheduled', requireAnyPerm(['system.settings', 'finance.reports']), runScheduledClosings);

export default router;
