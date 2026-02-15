import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { employeesService } from './employees.service';
import { employeeSchema, employeeUpdateSchema } from './employees.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listEmployees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, status } = req.query;
  
  // Get user's accessible branches
  const branchIds = (req as any).userBranches || [];
  
  const employees = await employeesService.list({
    search: search as string,
    status: status as string,
    branchIds,
  });
  
  return ApiResponse.success(res, { employees });
});

export const getEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const employee = await employeesService.getById(id);
  
  if (!employee) {
    throw ApiError.notFound('Employee not found');
  }
  
  return ApiResponse.success(res, { employee });
});

export const createEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = employeeSchema.parse(req.body);
  const employee = await employeesService.create(input);
  
  return ApiResponse.created(res, { employee }, 'Employee created successfully');
});

export const updateEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = employeeUpdateSchema.parse(req.body);
  
  const employee = await employeesService.update(id, input);
  
  if (!employee) {
    throw ApiError.notFound('Employee not found');
  }
  
  return ApiResponse.success(res, { employee }, 'Employee updated successfully');
});

export const deleteEmployee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await employeesService.delete(id);
  
  return ApiResponse.success(res, null, 'Employee deleted successfully');
});

export const getEmployeeStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Get user's accessible branches
  const branchIds = (req as any).userBranches || [];
  
  const stats = await employeesService.getStats(branchIds);
  
  return ApiResponse.success(res, stats);
});
