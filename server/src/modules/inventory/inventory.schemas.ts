import { z } from 'zod';

const optionalPositiveInt = z.preprocess(
  (value) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'undefined' ||
      value === 'null'
    ) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.number().int().positive().optional()
);

const requiredPositiveInt = z.coerce.number().int().positive();

const resolveTransferType = (
  explicitType: 'warehouse' | 'branch' | undefined,
  warehouseId?: number,
  branchId?: number
) => {
  if (explicitType) return explicitType;
  if (warehouseId) return 'warehouse' as const;
  if (branchId) return 'branch' as const;
  return 'warehouse' as const;
};

export const stockQuerySchema = z.object({
  branchId: optionalPositiveInt,
  whId: optionalPositiveInt,
  productId: optionalPositiveInt,
  itemId: optionalPositiveInt,
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
  branchId: optionalPositiveInt,
  includeInactive: z.coerce.boolean().optional().default(false),
});

export const adjustmentSchema = z.object({
  branchId: requiredPositiveInt,
  whId: optionalPositiveInt,
  productId: optionalPositiveInt,
  itemId: optionalPositiveInt,
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

export const transferSchema = z
  .object({
    fromType: z.enum(['warehouse', 'branch']).optional(),
    toType: z.enum(['warehouse', 'branch']).optional(),
    fromWhId: optionalPositiveInt,
    toWhId: optionalPositiveInt,
    fromBranchId: optionalPositiveInt,
    toBranchId: optionalPositiveInt,
    productId: optionalPositiveInt,
    itemId: optionalPositiveInt,
    qty: z.coerce.number().positive(),
    unitCost: z.coerce.number().nonnegative().default(0),
    note: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const fromType = resolveTransferType(value.fromType, value.fromWhId, value.fromBranchId);
    const toType = resolveTransferType(value.toType, value.toWhId, value.toBranchId);

    if (fromType === 'warehouse' && !value.fromWhId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source warehouse is required',
        path: ['fromWhId'],
      });
    }
    if (fromType === 'branch' && !value.fromBranchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source branch is required',
        path: ['fromBranchId'],
      });
    }

    if (toType === 'warehouse' && !value.toWhId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination warehouse is required',
        path: ['toWhId'],
      });
    }
    if (toType === 'branch' && !value.toBranchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination branch is required',
        path: ['toBranchId'],
      });
    }

    if (fromType === 'warehouse' && toType === 'warehouse' && value.fromWhId && value.toWhId && value.fromWhId === value.toWhId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source and destination warehouse must differ',
        path: ['toWhId'],
      });
    }

    if (fromType === 'branch' && toType === 'branch' && value.fromBranchId && value.toBranchId && value.fromBranchId === value.toBranchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source and destination branch must differ',
        path: ['toBranchId'],
      });
    }

    if (!(value.productId || value.itemId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Item is required',
        path: ['itemId'],
      });
    }
  })
  .transform((value) => ({
    ...value,
    fromType: resolveTransferType(value.fromType, value.fromWhId, value.fromBranchId),
    toType: resolveTransferType(value.toType, value.toWhId, value.toBranchId),
    productId: value.productId ?? value.itemId!,
  }));

export const recountSchema = z.object({
  branchId: requiredPositiveInt,
  whId: optionalPositiveInt,
  productId: optionalPositiveInt,
  itemId: optionalPositiveInt,
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
  branchId: requiredPositiveInt,
  whName: z.string().trim().min(1, 'Warehouse name is required'),
  location: z.string().trim().max(255).optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const warehouseUpdateSchema = warehouseCreateSchema.partial();
