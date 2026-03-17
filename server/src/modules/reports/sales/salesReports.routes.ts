import { Router } from 'express';
import {
  getCashierPerformanceReport,
  getDailySalesReport,
  getInvoiceStatusReport,
  getQuotationsReport,
  getSalesByCustomerReport,
  getSalesByProductReport,
  getSalesByStoreReport,
  getSalesReportOptions,
  getSalesSummaryReport,
  getSalesPaymentsByAccountReport,
  getSalesReturnsReport,
  getTopCustomersReport,
  getTopSellingItemsReport,
} from './salesReports.controller';

const router = Router();

router.get('/options', getSalesReportOptions);
router.get('/daily', getDailySalesReport);
router.get('/summary', getSalesSummaryReport);
router.get('/invoice-status', getInvoiceStatusReport);
router.get('/by-customer', getSalesByCustomerReport);
router.get('/by-product', getSalesByProductReport);
router.get('/by-store', getSalesByStoreReport);
router.get('/top-items', getTopSellingItemsReport);
router.get('/top-customers', getTopCustomersReport);
router.get('/returns', getSalesReturnsReport);
router.get('/payments-by-account', getSalesPaymentsByAccountReport);
router.get('/quotations', getQuotationsReport);
router.get('/cashier-performance', getCashierPerformanceReport);

export default router;
