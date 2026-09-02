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
import { cogsReportsService } from '../common/cogsReports.service';
import { reportRows, REPORT_ROW_LIMITS } from '../../../utils/reportMeta';

export const getFinancialReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await financialReportsService.getFinancialReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getIncomeStatementReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getIncomeStatement(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'income-statement', fromDate, toDate, rows }, rows));
});

export const getBalanceSheetReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const asOfDate = parseIsoDate(req.query.asOfDate as string | undefined, 'asOfDate');
  const rows = await financialReportsService.getBalanceSheet(branchId, asOfDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'balance-sheet', asOfDate, rows }, rows));
});

export const getCashFlowReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getCashFlowStatement(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'cash-flow-statement', fromDate, toDate, rows }, rows));
});

export const getCogsByInvoiceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await cogsReportsService.getCogsByInvoice(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'cogs-by-invoice', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getAccountBalancesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const accountId = mode === 'show' ? parseNumericId(req.query.accountId, 'accountId') : undefined;
  const asOfDate = req.query.asOfDate
    ? parseIsoDate(req.query.asOfDate as string | undefined, 'asOfDate')
    : undefined;
  const rows = await financialReportsService.getAccountBalances(branchId, accountId, asOfDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'account-balances', mode, accountId: accountId ?? null, asOfDate: asOfDate ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getExpenseSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getExpenseSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'expense-summary', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getProfitByItemReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const storeId = req.query.storeId ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await financialReportsService.getProfitByItem(branchId, fromDate, toDate, itemId, customerId, storeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'profit-by-item', fromDate, toDate, itemId: itemId ?? null, customerId: customerId ?? null, storeId: storeId ?? null, rows }, rows, REPORT_ROW_LIMITS.profitAnalysis));
});

export const getProfitByCustomerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const storeId = req.query.storeId ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await financialReportsService.getProfitByCustomer(branchId, fromDate, toDate, customerId, itemId, storeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'profit-by-customer', fromDate, toDate, customerId: customerId ?? null, itemId: itemId ?? null, storeId: storeId ?? null, rows }, rows, REPORT_ROW_LIMITS.profitAnalysis));
});

export const getProfitByStoreReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const customerId = req.query.customerId ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const rows = await financialReportsService.getProfitByStore(branchId, fromDate, toDate, customerId, itemId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'profit-by-store', fromDate, toDate, customerId: customerId ?? null, itemId: itemId ?? null, rows }, rows, REPORT_ROW_LIMITS.profitAnalysis));
});

export const getCustomerReceiptsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await financialReportsService.getCustomerReceipts(branchId, fromDate, toDate, customerId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'customer-receipts', fromDate, toDate, mode, customerId: customerId ?? null, rows }, rows, REPORT_ROW_LIMITS.receiptsPayments));
});

export const getSupplierPaymentsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const supplierId = mode === 'show' ? parseNumericId(req.query.supplierId, 'supplierId') : undefined;
  const rows = await financialReportsService.getSupplierPayments(branchId, fromDate, toDate, supplierId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'supplier-payments', fromDate, toDate, mode, supplierId: supplierId ?? null, rows }, rows, REPORT_ROW_LIMITS.receiptsPayments));
});

export const getAccountsReceivableReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const asOfDate = parseIsoDate(
    (req.query.asOfDate as string | undefined) || (req.query.toDate as string | undefined),
    'asOfDate'
  );
  const rows = await financialReportsService.getAccountsReceivable(branchId, asOfDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'accounts-receivable', asOfDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getAccountsPayableReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await financialReportsService.getAccountsPayable(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'accounts-payable', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getAccountTransactionsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const accountId = mode === 'show' ? parseNumericId(req.query.accountId, 'accountId') : undefined;
  const rows = await financialReportsService.getAccountTransactions(branchId, fromDate, toDate, accountId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'account-transactions', fromDate, toDate, mode, accountId: accountId ?? null, rows }, rows, REPORT_ROW_LIMITS.generalLedger));
});

export const getAccountStatementReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const accountId = parseNumericId(req.query.accountId, 'accountId');
  const result = await financialReportsService.getAccountStatement(branchId, fromDate, toDate, accountId);
  return ApiResponse.success(res, reportRows(branchId, {
    reportKey: 'account-statement',
    fromDate,
    toDate,
    mode: 'show',
    accountId,
    rows: result.rows,
    truncated: result.truncated,
    totalCount: result.totalCount,
  }, result.rows, REPORT_ROW_LIMITS.detail));
});

export const getTrialBalanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const includeZero = String(req.query.includeZero ?? '').toLowerCase() === 'true';
  const rows = await financialReportsService.getTrialBalance(branchId, fromDate, toDate, includeZero);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'trial-balance', fromDate, toDate, includeZero, rows }, rows, REPORT_ROW_LIMITS.detail));
});
