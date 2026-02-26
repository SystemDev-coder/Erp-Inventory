import { Router } from 'express';
import {
  getCurrentStockLevelsReport,
  getExpiryTrackingReport,
  getInventoryReportOptions,
  getInventoryValuationReport,
  getLowStockAlertReport,
  getStockAdjustmentLogReport,
  getStockMovementHistoryReport,
  getStoreStockReport,
  getStoreWiseStockReport,
} from './inventoryReports.controller';

const router = Router();

router.get('/options', getInventoryReportOptions);
router.get('/current-stock', getCurrentStockLevelsReport);
router.get('/low-stock', getLowStockAlertReport);
router.get('/movement-history', getStockMovementHistoryReport);
router.get('/valuation', getInventoryValuationReport);
router.get('/expiry-tracking', getExpiryTrackingReport);
router.get('/adjustment-log', getStockAdjustmentLogReport);
router.get('/store-stock', getStoreStockReport);
router.get('/store-wise', getStoreWiseStockReport);

export default router;
