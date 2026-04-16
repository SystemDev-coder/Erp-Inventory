import { Response } from 'express';
import { ApiResponse } from '../../../utils/ApiResponse';
import { asyncHandler } from '../../../utils/asyncHandler';
import { AuthRequest } from '../../../middlewares/requireAuth';
import {
  parseDateRange,
  parseIsoDate,
  parseNumericId,
  parseSelectionMode,
  resolveBranchIdForReports,
} from '../reports.helpers';
import { financialReportsService } from './financialReports.service';

export const getFinancialReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await financialReportsService.getFinancialReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getIncomeStatementReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getIncomeStatement(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'income-statement',
    fromDate,
    toDate,
    rows,
  });
});

export const getBalanceSheetReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const fromDate = req.query.fromDate
    ? parseIsoDate(req.query.fromDate as string | undefined, 'fromDate')
    : undefined;
  const asOfDate = parseIsoDate(req.query.asOfDate as string | undefined, 'asOfDate');
  const rows = await financialReportsService.getBalanceSheet(branchId, asOfDate, fromDate || undefined);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'balance-sheet',
    fromDate: fromDate || null,
    asOfDate,
    rows,
  });
});

export const getCashFlowReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getCashFlowStatement(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'cash-flow-statement',
    fromDate,
    toDate,
    rows,
  });
});

export const getAccountBalancesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const accountId = mode === 'show' ? parseNumericId(req.query.accountId, 'accountId') : undefined;
  const rows = await financialReportsService.getAccountBalances(branchId, accountId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'account-balances',
    mode,
    accountId: accountId ?? null,
    rows,
  });
});

export const getExpenseSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getExpenseSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'expense-summary',
    fromDate,
    toDate,
    rows,
  });
});

export const getProfitByItemReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const storeId = req.query.storeId ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await financialReportsService.getProfitByItem(branchId, fromDate, toDate, itemId, customerId, storeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'profit-by-item',
    fromDate,
    toDate,
    itemId: itemId ?? null,
    customerId: customerId ?? null,
    storeId: storeId ?? null,
    rows,
  });
});

export const getProfitByCustomerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const storeId = req.query.storeId ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await financialReportsService.getProfitByCustomer(branchId, fromDate, toDate, customerId, itemId, storeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'profit-by-customer',
    fromDate,
    toDate,
    customerId: customerId ?? null,
    itemId: itemId ?? null,
    storeId: storeId ?? null,
    rows,
  });
});

export const getProfitByStoreReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const rows = await financialReportsService.getProfitByStore(branchId, fromDate, toDate, customerId, itemId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'profit-by-store',
    fromDate,
    toDate,
    customerId: customerId ?? null,
    itemId: itemId ?? null,
    rows,
  });
});

export const getCustomerReceiptsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await financialReportsService.getCustomerReceipts(branchId, fromDate, toDate, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-receipts',
    fromDate,
    toDate,
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getSupplierPaymentsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const supplierId = mode === 'show' ? parseNumericId(req.query.supplierId, 'supplierId') : undefined;
  const rows = await financialReportsService.getSupplierPayments(branchId, fromDate, toDate, supplierId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'supplier-payments',
    fromDate,
    toDate,
    mode,
    supplierId: supplierId ?? null,
    rows,
  });
});

export const getAccountsReceivableReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getAccountsReceivable(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'accounts-receivable',
    fromDate,
    toDate,
    rows,
  });
});

export const getAccountsPayableReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getAccountsPayable(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'accounts-payable',
    fromDate,
    toDate,
    rows,
  });
});

export const getAccountTransactionsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const accountId = mode === 'show' ? parseNumericId(req.query.accountId, 'accountId') : undefined;
  const rows = await financialReportsService.getAccountTransactions(branchId, fromDate, toDate, accountId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'account-transactions',
    fromDate,
    toDate,
    mode,
    accountId: accountId ?? null,
    rows,
  });
});

export const getAccountStatementReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const accountId = mode === 'show' ? parseNumericId(req.query.accountId, 'accountId') : undefined;
  const rows = await financialReportsService.getAccountStatement(branchId, fromDate, toDate, accountId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'account-statement',
    fromDate,
    toDate,
    mode,
    accountId: accountId ?? null,
    rows,
  });
});

export const getTrialBalanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const includeZero = String(req.query.includeZero ?? '').toLowerCase() === 'true';
  const rows = await financialReportsService.getTrialBalance(branchId, fromDate, toDate, includeZero);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'trial-balance',
    fromDate,
    toDate,
    includeZero,
    rows,
  });
});
