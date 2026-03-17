import { Response } from 'express';
import { ApiResponse } from '../../../utils/ApiResponse';
import { asyncHandler } from '../../../utils/asyncHandler';
import { AuthRequest } from '../../../middlewares/requireAuth';
import { ApiError } from '../../../utils/ApiError';
import {
  parseDateRange,
  parseNumericId,
  parseSelectionMode,
  resolveBranchIdForReports,
} from '../reports.helpers';
import { salesReportsService } from './salesReports.service';

export const getSalesReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await salesReportsService.getSalesReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getSalesSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getSalesSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-summary',
    fromDate,
    toDate,
    rows,
  });
});

export const getInvoiceStatusReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const status = String(req.query.status || 'all').toLowerCase();
  const allowed = new Set(['all', 'paid', 'partial', 'unpaid']);
  if (!allowed.has(status)) {
    throw ApiError.badRequest('status must be one of: all, paid, partial, unpaid');
  }
  const rows = await salesReportsService.getInvoiceStatus(branchId, fromDate, toDate, status as any);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'invoice-status',
    fromDate,
    toDate,
    status,
    rows,
  });
});

export const getDailySalesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await salesReportsService.getDailySales(branchId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'daily-sales',
    rows,
  });
});

export const getSalesByStoreReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;

  const rows = await salesReportsService.getSalesByStore(branchId, fromDate, toDate, storeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-by-store',
    fromDate,
    toDate,
    mode,
    storeId: storeId ?? null,
    rows,
  });
});

export const getSalesByCustomerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const customerId = mode === 'show' ? parseNumericId(req.query.customerId, 'customerId') : undefined;

  const rows = await salesReportsService.getSalesByCustomer(branchId, customerId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-by-customer',
    mode,
    customerId: customerId ?? null,
    rows,
  });
});

export const getSalesByProductReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const productId = mode === 'show' ? parseNumericId(req.query.productId, 'productId') : undefined;

  const rows = await salesReportsService.getSalesByProduct(branchId, productId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-by-product',
    mode,
    productId: productId ?? null,
    rows,
  });
});

export const getTopSellingItemsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getTopSellingItems(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'top-selling-items',
    fromDate,
    toDate,
    rows,
  });
});

export const getTopCustomersReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getTopCustomers(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'top-customers',
    fromDate,
    toDate,
    rows,
  });
});

export const getSalesReturnsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getSalesReturns(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-returns',
    fromDate,
    toDate,
    rows,
  });
});

export const getSalesPaymentsByAccountReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getSalesPaymentsByAccount(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'sales-payments-by-account',
    fromDate,
    toDate,
    rows,
  });
});

export const getQuotationsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getQuotations(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'quotations',
    fromDate,
    toDate,
    rows,
  });
});

export const getCashierPerformanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await salesReportsService.getCashierPerformance(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'cashier-performance',
    fromDate,
    toDate,
    rows,
  });
});
