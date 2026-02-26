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
import { inventoryReportsService } from './inventoryReports.service';

export const getInventoryReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await inventoryReportsService.getInventoryReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getCurrentStockLevelsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await inventoryReportsService.getCurrentStockLevels(branchId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'current-stock-levels',
    rows,
  });
});

export const getLowStockAlertReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await inventoryReportsService.getLowStockAlert(branchId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'low-stock-alert',
    rows,
  });
});

export const getStockMovementHistoryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getStockMovementHistory(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'stock-movement-history',
    fromDate,
    toDate,
    rows,
  });
});

export const getInventoryValuationReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await inventoryReportsService.getInventoryValuation(branchId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'inventory-valuation',
    rows,
  });
});

export const getExpiryTrackingReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getExpiryTracking(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'expiry-tracking',
    fromDate,
    toDate,
    rows,
  });
});

export const getStockAdjustmentLogReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await inventoryReportsService.getStockAdjustmentLog(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'stock-adjustment-log',
    fromDate,
    toDate,
    rows,
  });
});

export const getStoreStockReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;

  const rows = await inventoryReportsService.getStoreStockReport(branchId, storeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'store-stock-report',
    mode,
    storeId: storeId ?? null,
    rows,
  });
});

export const getStoreWiseStockReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const storeId = mode === 'show' ? parseNumericId(req.query.storeId, 'storeId') : undefined;

  const rows = await inventoryReportsService.getStoreWiseStock(branchId, storeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'store-wise-stock',
    mode,
    storeId: storeId ?? null,
    rows,
  });
});
