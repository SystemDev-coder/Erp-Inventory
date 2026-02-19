import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { customersService } from './customers.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { logAudit } from '../../utils/audit';

const genderSchema = z.enum(['male', 'female']);

const customerBaseSchema = z.object({
  fullName: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional().nullable(),
  customerType: z.enum(['regular', 'one-time']).optional(),
  address: z.string().optional().nullable(),
  sex: genderSchema.optional().nullable(),
  gender: genderSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  remainingBalance: z.coerce.number().nonnegative().optional(),
});

const customerCreateSchema = customerBaseSchema
  .refine((value) => Boolean(value.gender ?? value.sex), {
    path: ['gender'],
    message: 'Gender is required',
  })
  .transform((value) => ({
    ...value,
    gender: value.gender ?? value.sex,
  }));

const customerUpdateSchema = customerBaseSchema
  .partial()
  .transform((value) => ({
    ...value,
    gender: value.gender ?? value.sex,
  }));

export const listCustomers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = req.query.search as string | undefined;
  const customers = await customersService.listCustomers(scope, search);
  return ApiResponse.success(res, { customers });
});

export const getCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const customer = await customersService.getCustomer(id, scope);
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }
  return ApiResponse.success(res, { customer });
});

export const createCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = customerCreateSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, undefined);
  const customer = await customersService.createCustomer(input, { branchId });
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'customers',
    entityId: customer.customer_id,
    branchId,
    newValue: customer,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { customer }, 'Customer created');
});

export const updateCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const before = await customersService.getCustomer(id, scope);
  const input = customerUpdateSchema.parse(req.body);
  const customer = await customersService.updateCustomer(id, input, scope);
  if (!customer) {
    throw ApiError.notFound('Customer not found');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'customers',
    entityId: customer.customer_id,
    oldValue: before,
    newValue: customer,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { customer }, 'Customer updated');
});

export const deleteCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const before = await customersService.getCustomer(id, scope);
  await customersService.deleteCustomer(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'customers',
    entityId: id,
    oldValue: before,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Customer deleted');
});
