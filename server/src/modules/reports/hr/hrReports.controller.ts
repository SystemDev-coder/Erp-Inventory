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
import { hrReportsService } from './hrReports.service';

export const getHrReportOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const options = await hrReportsService.getHrReportOptions(branchId);
  return ApiResponse.success(res, { branchId, ...options });
});

export const getEmployeeListReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getEmployeeList(branchId, employeeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'employee-list',
    mode,
    employeeId: employeeId ?? null,
    rows,
  });
});

export const getPayrollSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await hrReportsService.getPayrollSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'payroll-summary',
    fromDate,
    toDate,
    rows,
  });
});

export const getSalaryPaymentsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getSalaryPayments(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'salary-payments',
    fromDate,
    toDate,
    mode,
    employeeId: employeeId ?? null,
    rows,
  });
});

export const getEmployeeAttendanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getEmployeeAttendance(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'employee-attendance',
    fromDate,
    toDate,
    mode,
    employeeId: employeeId ?? null,
    rows,
  });
});

export const getLoanBalancesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getLoanBalances(branchId, employeeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'loan-balances',
    mode,
    employeeId: employeeId ?? null,
    rows,
  });
});

export const getEmployeeLedgerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getEmployeeLedger(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'employee-ledger',
    fromDate,
    toDate,
    mode,
    employeeId: employeeId ?? null,
    rows,
  });
});

export const getPayrollByMonthReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await hrReportsService.getPayrollByMonth(branchId, fromDate, toDate);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'payroll-by-month',
    fromDate,
    toDate,
    rows,
  });
});

export const getEmployeeCountByDepartmentReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await hrReportsService.getEmployeeCountByDepartment(branchId);
  return ApiResponse.success(res, {
    branchId,
    reportKey: 'employee-count-by-department',
    rows,
  });
});
