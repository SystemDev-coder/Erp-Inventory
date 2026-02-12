import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { suppliersService } from './suppliers.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { z } from 'zod';

const supplierSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required'),
  companyName: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  remainingBalance: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

// List all suppliers
export const listSuppliers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const search = req.query.search as string;
  const suppliers = await suppliersService.listSuppliers(search);
  return ApiResponse.success(res, { suppliers });
});

// Get single supplier
export const getSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const supplier = await suppliersService.getSupplier(id);
  
  if (!supplier) {
    throw ApiError.notFound('Supplier not found');
  }
  
  return ApiResponse.success(res, { supplier });
});

// Create supplier
export const createSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = supplierSchema.parse(req.body);
  const supplier = await suppliersService.createSupplier(input);
  return ApiResponse.created(res, { supplier }, 'Supplier created');
});

// Update supplier
export const updateSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = supplierSchema.partial().parse(req.body);
  const supplier = await suppliersService.updateSupplier(id, input);
  
  if (!supplier) {
    throw ApiError.notFound('Supplier not found');
  }
  
  return ApiResponse.success(res, { supplier }, 'Supplier updated');
});

// Delete supplier
export const deleteSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await suppliersService.deleteSupplier(id);
  return ApiResponse.success(res, null, 'Supplier deleted');
});
