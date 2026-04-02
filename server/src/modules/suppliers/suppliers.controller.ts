import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { suppliersService, type SupplierInput as SupplierServiceInput } from './suppliers.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { z } from 'zod';
import { pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { logAudit } from '../../utils/audit';

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

type SupplierFormInput = z.infer<typeof supplierSchema>;
type SupplierFormUpdateInput = Partial<SupplierFormInput>;

const normalizeSupplierInput = (input: SupplierFormInput): SupplierServiceInput => ({
  supplierName: input.supplierName,
  companyName: input.companyName ?? undefined,
  contactPerson: input.contactPerson ?? undefined,
  contactPhone: input.contactPhone ?? undefined,
  phone: input.phone ?? undefined,
  address: input.address ?? undefined,
  location: input.location ?? undefined,
  remainingBalance: input.remainingBalance,
  isActive: input.isActive,
});

const normalizeSupplierUpdateInput = (
  input: SupplierFormUpdateInput
): Partial<SupplierServiceInput> => ({
  supplierName: input.supplierName,
  companyName: input.companyName ?? undefined,
  contactPerson: input.contactPerson ?? undefined,
  contactPhone: input.contactPhone ?? undefined,
  phone: input.phone ?? undefined,
  address: input.address ?? undefined,
  location: input.location ?? undefined,
  remainingBalance: input.remainingBalance,
  isActive: input.isActive,
});

// List all suppliers
export const listSuppliers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = req.query.search as string;
  const fromDate = (req.query.fromDate as string) || undefined;
  const toDate = (req.query.toDate as string) || undefined;
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw ApiError.badRequest('Both fromDate and toDate are required together');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  const suppliers = await suppliersService.listSuppliers(scope, search, { fromDate, toDate });
  return ApiResponse.success(res, { suppliers });
});

export const lookupSuppliers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const querySchema = z.object({
    search: z.string().trim().optional().default(''),
    limit: z.coerce.number().int().positive().max(200).optional().default(50),
  });
  const input = querySchema.parse(req.query);
  const suppliers = await suppliersService.lookupSuppliers(scope, input.search, input.limit);
  return ApiResponse.success(res, { suppliers });
});

// Get single supplier
export const getSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const supplier = await suppliersService.getSupplier(id, scope);
  
  if (!supplier) {
    throw ApiError.notFound('Supplier not found');
  }
  
  return ApiResponse.success(res, { supplier });
});

// Create supplier
export const createSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = normalizeSupplierInput(supplierSchema.parse(req.body));
  const branchId = pickBranchForWrite(scope, undefined);
  const supplier = await suppliersService.createSupplier(input, { branchId });
  return ApiResponse.created(res, { supplier }, 'Supplier created');
});

// Update supplier
export const updateSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const input = normalizeSupplierUpdateInput(supplierSchema.partial().parse(req.body));
  const supplier = await suppliersService.updateSupplier(id, input, scope);
  
  if (!supplier) {
    throw ApiError.notFound('Supplier not found');
  }
  
  return ApiResponse.success(res, { supplier }, 'Supplier updated');
});

// Delete supplier
export const deleteSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  await suppliersService.deleteSupplier(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'suppliers',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, null, 'Supplier deleted');
});
