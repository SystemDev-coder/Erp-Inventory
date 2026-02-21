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
  listExpenseBudgets,
  createExpenseBudget,
  createExpense,
  chargeExpenseBudget,
  listExpenses,
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
router.get('/expenses/charges', listExpenseCharges);
router.post('/expenses/charges', createExpenseCharge);

// Expense budgets
router.get('/expenses/budgets', listExpenseBudgets);
router.post('/expenses/budgets', createExpenseBudget);
router.post('/expenses/budgets/charge', chargeExpenseBudget);

export default router;
