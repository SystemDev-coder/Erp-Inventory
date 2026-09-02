import { Response } from 'express';
import { ApiResponse } from '../../../utils/ApiResponse';
import { asyncHandler } from '../../../utils/asyncHandler';
import { AuthRequest } from '../../../middlewares/requireAuth';
import { reportRows, REPORT_ROW_LIMITS } from '../../../utils/reportMeta';
import {
  parseDateRange,
  parseNumericId,
  parseSelectionMode,
  resolveBranchIdForReports,
} from '../reports.helpers';
import { purchaseReportsService } from './purchaseReports.service';

export const getPurchaseReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await purchaseReportsService.getPurchaseReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getPurchaseOrdersSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await purchaseReportsService.getPurchaseOrdersSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'purchase-orders-summary', fromDate, toDate, rows }, rows));
});

export const getSupplierWisePurchasesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const supplierId = mode === 'show' ? parseNumericId(req.query.supplierId, 'supplierId') : undefined;
  const rows = await purchaseReportsService.getSupplierWisePurchases(branchId, supplierId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'supplier-wise-purchases', mode, supplierId: supplierId ?? null, rows }, rows, REPORT_ROW_LIMITS.supplierWise));
});

export const getPurchaseReturnsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await purchaseReportsService.getPurchaseReturns(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'purchase-returns', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getPurchasePaymentStatusReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await purchaseReportsService.getPurchasePaymentStatus(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'purchase-payment-status', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getSupplierLedgerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const supplierId = mode === 'show' ? parseNumericId(req.query.supplierId, 'supplierId') : undefined;
  const rows = await purchaseReportsService.getSupplierLedger(branchId, fromDate, toDate, supplierId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'supplier-ledger', fromDate, toDate, mode, supplierId: supplierId ?? null, rows }, rows, REPORT_ROW_LIMITS.supplierLedger));
});

export const getPurchaseByDateRangeReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await purchaseReportsService.getPurchaseByDateRange(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'purchase-by-date-range', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getBestSuppliersReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await purchaseReportsService.getBestSuppliers(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'best-suppliers', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.bestSuppliers));
});

export const getPurchasePriceVarianceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const productId = mode === 'show' ? parseNumericId(req.query.productId, 'productId') : undefined;
  const rows = await purchaseReportsService.getPurchasePriceVariance(branchId, fromDate, toDate, productId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'purchase-price-variance', fromDate, toDate, mode, productId: productId ?? null, rows }, rows, REPORT_ROW_LIMITS.priceVariance));
});

export const getCreditOverduePurchasesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const supplierId = mode === 'show' ? parseNumericId(req.query.supplierId, 'supplierId') : undefined;
  const rows = await purchaseReportsService.getCreditOverduePurchases(branchId, supplierId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'credit-overdue-purchases', mode, supplierId: supplierId ?? null, rows }, rows, REPORT_ROW_LIMITS.supplierWise));
});
