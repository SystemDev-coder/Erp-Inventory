import { Router } from 'express';
import {
  getEmployeeAttendanceReport,
  getEmployeeCountByDepartmentReport,
  getEmployeeLedgerReport,
  getEmployeeListReport,
  getHrReportOptions,
  getLoanBalancesReport,
  getPayrollByMonthReport,
  getPayrollSummaryReport,
  getSalaryPaymentsReport,
} from './hrReports.controller';

const router = Router();

router.get('/options', getHrReportOptions);
router.get('/employee-list', getEmployeeListReport);
router.get('/payroll-summary', getPayrollSummaryReport);
router.get('/salary-payments', getSalaryPaymentsReport);
router.get('/employee-attendance', getEmployeeAttendanceReport);
router.get('/loan-balances', getLoanBalancesReport);
router.get('/employee-ledger', getEmployeeLedgerReport);
router.get('/payroll-by-month', getPayrollByMonthReport);
router.get('/employee-count-by-department', getEmployeeCountByDepartmentReport);

export default router;
