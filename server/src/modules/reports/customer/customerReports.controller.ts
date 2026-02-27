import { Response } from 'express';
import { ApiResponse } from '../../../utils/ApiResponse';
import { asyncHandler } from '../../../utils/asyncHandler';
import { AuthRequest } from '../../../middlewares/requireAuth';
import {
  parseDateRange,
  parseNumericId,
  parseSelectionMode,
  resolveBranchIdForReports,
} from '../reports.helpers';
import { customerReportsService } from './customerReports.service';

export const getCustomerReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await customerReportsService.getCustomerReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getCustomerListReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getCustomerList(branchId, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-list',
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getCustomerLedgerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getCustomerLedger(branchId, fromDate, toDate, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-ledger',
    fromDate,
    toDate,
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getOutstandingBalancesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getOutstandingBalances(branchId, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-outstanding-balances',
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getTopCustomersReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await customerReportsService.getTopCustomers(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'top-customers',
    fromDate,
    toDate,
    rows,
  });
});

export const getCustomerPaymentHistoryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getCustomerPaymentHistory(branchId, fromDate, toDate, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-payment-history',
    fromDate,
    toDate,
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getCreditCustomersReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getCreditCustomers(branchId, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'credit-customers',
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getNewCustomersReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await customerReportsService.getNewCustomers(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'new-customers',
    fromDate,
    toDate,
    rows,
  });
});

export const getCustomerActivityReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;
  const rows = await customerReportsService.getCustomerActivity(branchId, fromDate, toDate, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'customer-activity',
    fromDate,
    toDate,
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

