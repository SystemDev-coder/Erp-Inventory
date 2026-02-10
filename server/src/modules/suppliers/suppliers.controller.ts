import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { suppliersService } from './suppliers.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { deleteCloudinaryImage } from '../../config/cloudinary';
import { z } from 'zod';

const supplierSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
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
  
  // Get supplier to delete logo from Cloudinary
  const supplier = await suppliersService.getSupplier(id);
  if (supplier?.logo_url) {
    await deleteCloudinaryImage(supplier.logo_url);
  }
  
  await suppliersService.deleteSupplier(id);
  return ApiResponse.success(res, null, 'Supplier deleted');
});

// Upload supplier logo
export const uploadSupplierLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }
  
  const logoUrl = req.file.path;
  
  // Delete old logo if exists
  const existing = await suppliersService.getSupplier(id);
  if (existing?.logo_url) {
    await deleteCloudinaryImage(existing.logo_url);
  }
  
  const supplier = await suppliersService.updateSupplier(id, { logoUrl });
  
  return ApiResponse.success(res, { supplier, logoUrl }, 'Logo uploaded successfully');
});

// Delete supplier logo
export const deleteSupplierLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  
  const supplier = await suppliersService.getSupplier(id);
  if (supplier?.logo_url) {
    await deleteCloudinaryImage(supplier.logo_url);
    await suppliersService.updateSupplier(id, { logoUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Logo deleted successfully');
});
