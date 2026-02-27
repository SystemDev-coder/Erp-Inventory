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
  const asOfDate = parseIsoDate(req.query.asOfDate as string | undefined, 'asOfDate');
  const rows = await financialReportsService.getBalanceSheet(branchId, asOfDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'balance-sheet',
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
