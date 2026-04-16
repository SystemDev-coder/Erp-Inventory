import { Router } from 'express';
import {
  getCurrentStockLevelsReport,
  getExpiryTrackingReport,
  getInventoryReportOptions,
  getInventoryValuationReport,
  getLowStockAlertReport,
  getStoreMovementDetailReport,
  getInventoryLossReport,
  getInventoryFoundReport,
  getStoreMovementSummaryReport,
  getStockAdjustmentLogReport,
  getStoreStockReport,
  getStoreWiseStockReport,
} from './inventoryReports.controller';

const router = Router();

router.get('/options', getInventoryReportOptions);
router.get('/current-stock', getCurrentStockLevelsReport);
router.get('/low-stock', getLowStockAlertReport);
router.get('/valuation', getInventoryValuationReport);
router.get('/expiry-tracking', getExpiryTrackingReport);
router.get('/adjustment-log', getStockAdjustmentLogReport);
router.get('/loss', getInventoryLossReport);
router.get('/store-stock', getStoreStockReport);
router.get('/store-wise', getStoreWiseStockReport);
router.get('/store-movement-summary', getStoreMovementSummaryReport);
router.get('/store-movement-detail', getStoreMovementDetailReport);
router.get('/found', getInventoryFoundReport);

export default router;
