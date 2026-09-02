import { Response } from 'express';
import { ApiResponse } from '../../../utils/ApiResponse';
import { asyncHandler } from '../../../utils/asyncHandler';
import { AuthRequest } from '../../../middlewares/requireAuth';
import { reportRows, REPORT_ROW_LIMITS } from '../../../utils/reportMeta';
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
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'employee-list', mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getPayrollSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await hrReportsService.getPayrollSummary(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'payroll-summary', fromDate, toDate, rows }, rows));
});

export const getSalaryPaymentsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getSalaryPayments(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'salary-payments', fromDate, toDate, mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getEmployeeAttendanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getEmployeeAttendance(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'employee-attendance', fromDate, toDate, mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getLoanBalancesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getLoanBalances(branchId, employeeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'loan-balances', mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getEmployeeLedgerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getEmployeeLedger(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'employee-ledger', fromDate, toDate, mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.employeeLedger));
});

export const getPayrollByMonthReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const rows = await hrReportsService.getPayrollByMonth(branchId, fromDate, toDate);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'payroll-by-month', fromDate, toDate, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getPayrollEmployeeDetailReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const { fromDate, toDate } = parseDateRange(req);
  const mode = parseSelectionMode(req.query.mode);
  const employeeId = mode === 'show' ? parseNumericId(req.query.employeeId, 'employeeId') : undefined;
  const rows = await hrReportsService.getPayrollEmployeeDetail(branchId, fromDate, toDate, employeeId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'payroll-employee-detail', fromDate, toDate, mode, employeeId: employeeId ?? null, rows }, rows, REPORT_ROW_LIMITS.detail));
});

export const getEmployeeCountByDepartmentReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchId = await resolveBranchIdForReports(req);
  const rows = await hrReportsService.getEmployeeCountByDepartment(branchId);
  return ApiResponse.success(res, reportRows(branchId, { reportKey: 'employee-count-by-department', rows }, rows));
});
