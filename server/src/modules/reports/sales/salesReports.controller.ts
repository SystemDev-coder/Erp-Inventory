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
import { salesReportsService } from './salesReports.service';

export const getSalesReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await salesReportsService.getSalesReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
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
