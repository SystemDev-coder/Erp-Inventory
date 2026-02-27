import { Router } from 'express';
import {
  getCreditCustomersReport,
  getCustomerActivityReport,
  getCustomerLedgerReport,
  getCustomerListReport,
  getCustomerPaymentHistoryReport,
  getCustomerReportOptions,
  getNewCustomersReport,
  getOutstandingBalancesReport,
  getTopCustomersReport,
} from './customerReports.controller';

const router = Router();

router.get('/options', getCustomerReportOptions);
router.get('/list', getCustomerListReport);
router.get('/ledger', getCustomerLedgerReport);
router.get('/outstanding-balances', getOutstandingBalancesReport);
router.get('/top-customers', getTopCustomersReport);
router.get('/payment-history', getCustomerPaymentHistoryReport);
router.get('/credit-customers', getCreditCustomersReport);
router.get('/new-customers', getNewCustomersReport);
router.get('/activity', getCustomerActivityReport);

export default router;

