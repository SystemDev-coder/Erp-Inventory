import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
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
  listSupplierUnpaid,
  listSupplierOutstandingPurchases,
} from './finance.controller';

const router = Router();

router.use(requireAuth);

// Account transfers
router.get('/transfers', listAccountTransfers);
router.post('/transfers', createAccountTransfer);
router.put('/transfers/:id', updateAccountTransfer);

// Receipts - customers
router.get('/receipts/customers/unpaid', listCustomerUnpaid);
router.get('/receipts/customers', listCustomerReceipts);
router.post('/receipts/customers', createCustomerReceipt);
router.put('/receipts/customers/:id', updateCustomerReceipt);
router.delete('/receipts/customers/:id', deleteCustomerReceipt);

// Receipts - suppliers
router.get('/receipts/suppliers/unpaid', listSupplierUnpaid);
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

export default router;
