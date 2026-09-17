import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm, requirePerm } from '../../middlewares/requirePerm';
import {
  listAccountTransfers,
  createAccountTransfer,
  updateAccountTransfer,
  listLiabilityAccounts,
  createLiabilityAccount,
  listLiabilityPayments,
  createLiabilityPayment,
  deleteLiabilityPayment,
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
  listOtherIncomes,
  createOtherIncome,
  updateOtherIncome,
  deleteOtherIncome,
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
router.get('/transfers', requirePerm('account_transfers.view'), listAccountTransfers);
router.post('/transfers', requirePerm('account_transfers.create'), createAccountTransfer);
router.put('/transfers/:id', requirePerm('account_transfers.update'), updateAccountTransfer);

// Liability payments
// NOTE: no dedicated `liability_payments.*` permission exists in ims.permissions yet
// (confirmed - the catalog has none). Liability accounts live in ims.accounts, so reads
// are gated on accounts.view; liability_payments writes are gated on accounts.update as
// the closest existing equivalent until a dedicated permission is added.
router.get('/liability-accounts', requirePerm('accounts.view'), listLiabilityAccounts);
router.post('/liability-accounts', requirePerm('accounts.create'), createLiabilityAccount);
router.get('/liability-payments', requirePerm('accounts.view'), listLiabilityPayments);
router.post('/liability-payments', requirePerm('accounts.update'), createLiabilityPayment);
router.delete('/liability-payments/:id', requirePerm('accounts.update'), deleteLiabilityPayment);

// Receipts - customers
router.get('/receipts/customers/unpaid', requirePerm('customer_receipts.view'), listCustomerUnpaid);
router.get('/receipts/customers/:customerId/balance', requirePerm('customer_receipts.view'), getCustomerCombinedBalance);
router.get('/receipts/customers', requirePerm('customer_receipts.view'), listCustomerReceipts);
router.post('/receipts/customers', requirePerm('customer_receipts.create'), createCustomerReceipt);
router.put('/receipts/customers/:id', requirePerm('customer_receipts.update'), updateCustomerReceipt);
router.delete('/receipts/customers/:id', requirePerm('customer_receipts.delete'), deleteCustomerReceipt);

// Receipts - suppliers
router.get('/receipts/suppliers/unpaid', requirePerm('supplier_receipts.view'), listSupplierUnpaid);
router.get('/receipts/suppliers/:supplierId/balance', requirePerm('supplier_receipts.view'), getSupplierCombinedBalance);
router.get('/receipts/suppliers/outstanding', requirePerm('supplier_receipts.view'), listSupplierOutstandingPurchases);
router.get('/receipts/suppliers', requirePerm('supplier_receipts.view'), listSupplierReceipts);
router.post('/receipts/suppliers', requirePerm('supplier_receipts.create'), createSupplierReceipt);
router.put('/receipts/suppliers/:id', requirePerm('supplier_receipts.update'), updateSupplierReceipt);
router.delete('/receipts/suppliers/:id', requirePerm('supplier_receipts.delete'), deleteSupplierReceipt);

// Other income
router.get('/other-income', requirePerm('other_incomes.view'), listOtherIncomes);
router.post('/other-income', requirePerm('other_incomes.create'), createOtherIncome);
router.put('/other-income/:id', requirePerm('other_incomes.update'), updateOtherIncome);
router.delete('/other-income/:id', requirePerm('other_incomes.delete'), deleteOtherIncome);

// Expenses
router.get('/expenses', requirePerm('expenses.view'), listExpenses);
router.post('/expenses', requirePerm('expenses.create'), createExpense);
router.put('/expenses/:id', requirePerm('expenses.update'), updateExpense);
router.delete('/expenses/:id', requirePerm('expenses.delete'), deleteExpense);
router.get('/expenses/charges', requirePerm('expense_charges.view'), listExpenseCharges);
router.post('/expenses/charges', requirePerm('expense_charges.create'), createExpenseCharge);
router.put('/expenses/charges/:id', requirePerm('expense_charges.update'), updateExpenseCharge);
router.delete('/expenses/charges/:id', requirePerm('expense_charges.delete'), deleteExpenseCharge);
router.get('/expenses/payments', requirePerm('expense_payments.view'), listExpensePayments);
router.post('/expenses/payments', requirePerm('expense_payments.create'), createExpensePayment);
router.delete('/expenses/payments/:id', requirePerm('expense_payments.delete'), deleteExpensePayment);

// Expense budgets
router.get('/expenses/budgets', requirePerm('expense_budgets.view'), listExpenseBudgets);
router.post('/expenses/budgets', requirePerm('expense_budgets.create'), createExpenseBudget);
router.put('/expenses/budgets/:id', requirePerm('expense_budgets.update'), updateExpenseBudget);
router.delete('/expenses/budgets/:id', requirePerm('expense_budgets.delete'), deleteExpenseBudget);
// Both routes below create/sync ims.expense_charges rows from a budget; no dedicated
// "charge a budget" permission exists, so they're gated on expense_charges write perms.
router.post('/expenses/budgets/charge', requirePerm('expense_charges.create'), chargeExpenseBudget);
router.post('/expenses/budgets/manage', requirePerm('expense_charges.update'), manageExpenseBudgetCharges);

// Payroll
router.get('/payroll', requirePerm('payroll_runs.view'), listPayroll);
router.post('/payroll/charge', requirePerm('payroll.process'), chargeSalaries);
router.post('/payroll/pay', requirePerm('payroll.pay'), paySalary);
router.post('/payroll/delete', requirePerm('payroll_runs.delete'), deletePayroll);

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
