import { z } from 'zod';

export const stockQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  whId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
}).transform((value) => ({
  ...value,
  productId: value.productId ?? value.itemId,
}));

export const movementQuerySchema = stockQuerySchema;
export const adjustmentListQuerySchema = stockQuerySchema;
export const recountListQuerySchema = stockQuerySchema;

export const locationQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

export const adjustmentSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  whId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  qty: z.coerce.number(),
  unitCost: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
}).refine((value) => !!(value.productId || value.itemId), {
  message: 'Item is required',
  path: ['itemId'],
}).transform((value) => ({
  ...value,
  productId: value.productId ?? value.itemId!,
}));

export const transferSchema = z.object({
  fromWhId: z.coerce.number().int().positive(),
  toWhId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
}).refine((v) => v.fromWhId !== v.toWhId, { message: 'Warehouses must differ', path: ['toWhId'] })
  .refine((value) => !!(value.productId || value.itemId), {
    message: 'Item is required',
    path: ['itemId'],
  })
  .transform((value) => ({
    ...value,
    productId: value.productId ?? value.itemId!,
  }));

export const recountSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  whId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  countedQty: z.coerce.number().nonnegative(),
  unitCost: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
}).refine((value) => !!(value.productId || value.itemId), {
  message: 'Item is required',
  path: ['itemId'],
}).transform((value) => ({
  ...value,
  productId: value.productId ?? value.itemId!,
}));

export const branchCreateSchema = z.object({
  branchName: z.string().trim().min(1, 'Branch name is required'),
  location: z.string().trim().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const branchUpdateSchema = branchCreateSchema.partial();

export const warehouseCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  whName: z.string().trim().min(1, 'Warehouse name is required'),
  location: z.string().trim().max(255).optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const warehouseUpdateSchema = warehouseCreateSchema.partial();
