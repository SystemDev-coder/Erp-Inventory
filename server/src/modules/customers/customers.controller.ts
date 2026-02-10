import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { customersService } from './customers.service';
import { AuthRequest } from '../../middlewares/requireAuth';

const customerSchema = z.object({
  fullName: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional().nullable(),
  customerType: z.enum(['regular', 'one-time']).optional(),
  address: z.string().optional().nullable(),
  sex: z.enum(['male', 'female']).optional(),
  isActive: z.boolean().optional(),
});

export const listCustomers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const search = req.query.search as string | undefined;
  const customers = await customersService.listCustomers(search);
  return ApiResponse.success(res, { customers });
});

export const getCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const customer = await customersService.getCustomer(id);
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }
  return ApiResponse.success(res, { customer });
});

export const createCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = customerSchema.parse(req.body);
  const customer = await customersService.createCustomer(input);
  return ApiResponse.created(res, { customer }, 'Customer created');
});

export const updateCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = customerSchema.partial().parse(req.body);
  const customer = await customersService.updateCustomer(id, input);
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }
  return ApiResponse.success(res, { customer }, 'Customer updated');
});

export const deleteCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await customersService.deleteCustomer(id);
  return ApiResponse.success(res, null, 'Customer deleted');
});
