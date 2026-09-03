import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { employeesService } from './employees.service';
import {
  employeeSchema,
  employeeUpdateSchema,
  shiftAssignmentSchema,
  shiftAssignmentUpdateSchema,
  stateUpdateSchema,
} from './employees.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import {
  assertBranchAccess,
  pickBranchForWrite,
  resolveActiveBranchIds,
  resolveBranchScope,
} from '../../utils/branchScope';

export const listEmployees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, status } = req.query;
  const fromDate = (req.query.fromDate as string) || undefined;
  const toDate = (req.query.toDate as string) || undefined;
  if (fromDate && toDate && fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  
  const branchIds = await resolveActiveBranchIds(req);

  const employees = await employeesService.list({
    search: search as string,
    status: status as string,
    fromDate,
    toDate,
    branchIds,
  });

  return ApiResponse.success(res, { employees });
});

export const listEmployeeRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const roles = await employeesService.listRoles();
  return ApiResponse.success(res, { roles });
});

export const getEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const employee = await employeesService.getById(id);

  if (!employee) {
    throw ApiError.notFound('Employee not found');
  }
  assertBranchAccess(scope, employee.branch_id);

  return ApiResponse.success(res, { employee });
});

export const createEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = employeeSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, undefined);
  const employee = await employeesService.create(input, { branchId });

  return ApiResponse.created(res, { employee }, 'Employee created successfully');
});

export const updateEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const existing = await employeesService.getById(id);
  if (!existing) {
    throw ApiError.notFound('Employee not found');
  }
  assertBranchAccess(scope, existing.branch_id);

  const input = employeeUpdateSchema.parse(req.body);
  const employee = await employeesService.update(id, input);

  if (!employee) {
    throw ApiError.notFound('Employee not found');
  }

  return ApiResponse.success(res, { employee }, 'Employee updated successfully');
});

export const deleteEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const existing = await employeesService.getById(id);
  if (!existing) {
    throw ApiError.notFound('Employee not found');
  }
  assertBranchAccess(scope, existing.branch_id);

  await employeesService.delete(id);

  return ApiResponse.success(res, null, 'Employee deleted successfully');
});

export const getEmployeeStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchIds = await resolveActiveBranchIds(req);
  const stats = await employeesService.getStats(branchIds);

  return ApiResponse.success(res, stats);
});

export const updateGenericState = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = stateUpdateSchema.parse(req.body);
  const branchIds = await resolveActiveBranchIds(req);
  await employeesService.updateState(input, branchIds);
  return ApiResponse.success(res, null, 'State updated');
});

export const listShiftAssignments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const branchIds = await resolveActiveBranchIds(req);
  const assignments = await employeesService.listShiftAssignments(branchIds);
  return ApiResponse.success(res, { assignments });
});

export const createShiftAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = shiftAssignmentSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, undefined);
  const assignment = await employeesService.createShiftAssignment(input, {
    branchId,
    userId: req.user?.userId,
  });
  return ApiResponse.created(res, { assignment }, 'Shift assignment created');
});

export const updateShiftAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = shiftAssignmentUpdateSchema.parse(req.body);
  const branchIds = await resolveActiveBranchIds(req);
  const assignment = await employeesService.updateShiftAssignment(id, input, branchIds);
  if (!assignment) throw ApiError.notFound('Shift assignment not found');
  return ApiResponse.success(res, { assignment }, 'Shift assignment updated');
});

export const deleteShiftAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const branchIds = await resolveActiveBranchIds(req);
  await employeesService.deleteShiftAssignment(id, branchIds);
  return ApiResponse.success(res, null, 'Shift assignment deleted');
});
