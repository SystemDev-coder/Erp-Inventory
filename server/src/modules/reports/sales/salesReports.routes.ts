import { Router } from 'express';
import {
  getCashierPerformanceReport,
  getDailySalesReport,
  getSalesByCustomerReport,
  getSalesByProductReport,
  getSalesReportOptions,
  getSalesReturnsReport,
  getTopSellingItemsReport,
} from './salesReports.controller';

const router = Router();

router.get('/options', getSalesReportOptions);
router.get('/daily', getDailySalesReport);
router.get('/by-customer', getSalesByCustomerReport);
router.get('/by-product', getSalesByProductReport);
router.get('/top-items', getTopSellingItemsReport);
router.get('/returns', getSalesReturnsReport);
router.get('/cashier-performance', getCashierPerformanceReport);

export default router;
