import { Router } from 'express';
import {
  getBestSuppliersReport,
  getPurchaseByDateRangeReport,
  getPurchaseOrdersSummaryReport,
  getPurchasePaymentStatusReport,
  getPurchasePriceVarianceReport,
  getPurchaseReportOptions,
  getPurchaseReturnsReport,
  getSupplierLedgerReport,
  getSupplierWisePurchasesReport,
} from './purchaseReports.controller';

const router = Router();

router.get('/options', getPurchaseReportOptions);
router.get('/orders-summary', getPurchaseOrdersSummaryReport);
router.get('/supplier-wise', getSupplierWisePurchasesReport);
router.get('/returns', getPurchaseReturnsReport);
router.get('/payment-status', getPurchasePaymentStatusReport);
router.get('/supplier-ledger', getSupplierLedgerReport);
router.get('/by-date-range', getPurchaseByDateRangeReport);
router.get('/best-suppliers', getBestSuppliersReport);
router.get('/price-variance', getPurchasePriceVarianceReport);

export default router;
