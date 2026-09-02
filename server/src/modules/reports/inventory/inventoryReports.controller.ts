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
import { inventoryReportsService } from './inventoryReports.service';

export const getInventoryReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await inventoryReportsService.getInventoryReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getCurrentStockLevelsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await inventoryReportsService.getCurrentStockLevels(branchId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'current-stock-levels', rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getLowStockAlertReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await inventoryReportsService.getLowStockAlert(branchId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'low-stock-alert', rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getInventoryValuationReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rawMethod = String(req.query.method || 'average').toLowerCase();
  const method = (['fifo', 'lifo', 'average'].includes(rawMethod) ? rawMethod : 'average') as 'fifo' | 'lifo' | 'average';
  const rows = await inventoryReportsService.getInventoryValuationByMethod(branchId, method);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: `inventory-valuation-${method}`, method, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getExpiryTrackingReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getExpiryTracking(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'expiry-tracking', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getStockAdjustmentLogReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getStockAdjustmentLog(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'stock-adjustment-log', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getInventoryLossReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getInventoryLoss(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'inventory-loss', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getStoreStockReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await inventoryReportsService.getStoreStockReport(branchId, storeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'store-stock-report', mode, storeId: storeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getStoreWiseStockReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await inventoryReportsService.getStoreWiseStock(branchId, storeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'store-wise-stock', mode, storeId: storeId ?? null, rows }, rows, REPORT_ROW_LIMITS.storeWiseStock));
});

export const getStoreMovementSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const { fromDate, toDate } = parseDateRange(req);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const rows = await inventoryReportsService.getStoreMovementSummary(branchId, fromDate, toDate, storeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'store-movement-summary', fromDate, toDate, mode, storeId: storeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getStoreMovementDetailReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const { fromDate, toDate } = parseDateRange(req);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;
  const itemId = req.query.itemId ? parseNumericId(req.query.itemId, 'itemId') : undefined;
  const rows = await inventoryReportsService.getStoreMovementDetails(branchId, fromDate, toDate, storeId, itemId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'store-movement-detail', fromDate, toDate, mode, storeId: storeId ?? null, itemId: itemId ?? null, rows }, rows, REPORT_ROW_LIMITS.storeMovementDetail));
});

export const getInventoryFoundReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getInventoryFound(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'inventory-found', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});
