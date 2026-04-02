import { Router } from 'express';
import {
  getCurrentStockLevelsReport,
  getExpiryTrackingReport,
  getInventoryReportOptions,
  getInventoryValuationReport,
  getLowStockAlertReport,
  getInventoryLossReport,
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

export default router;
