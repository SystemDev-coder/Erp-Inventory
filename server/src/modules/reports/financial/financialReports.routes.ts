import { Router } from 'express';
import {
  getAccountStatementReport,
  getAccountBalancesReport,
  getAccountTransactionsReport,
  getBalanceSheetReport,
  getCashFlowReport,
  getCustomerReceiptsReport,
  getExpenseSummaryReport,
  getFinancialReportOptions,
  getIncomeStatementReport,
  getSupplierPaymentsReport,
  getTrialBalanceReport,
} from './financialReports.controller';

const router = Router();

router.get('/options', getFinancialReportOptions);
router.get('/income-statement', getIncomeStatementReport);
router.get('/balance-sheet', getBalanceSheetReport);
router.get('/cash-flow', getCashFlowReport);
router.get('/account-balances', getAccountBalancesReport);
router.get('/expense-summary', getExpenseSummaryReport);
router.get('/customer-receipts', getCustomerReceiptsReport);
router.get('/supplier-payments', getSupplierPaymentsReport);
router.get('/account-transactions', getAccountTransactionsReport);
router.get('/account-statement', getAccountStatementReport);
router.get('/trial-balance', getTrialBalanceReport);

export default router;
