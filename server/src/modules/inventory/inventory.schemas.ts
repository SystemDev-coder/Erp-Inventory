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
const adjustmentTypeSchema = z.enum(['INCREASE', 'DECREASE']);
const adjustmentStatusSchema = z.enum(['POSTED', 'CANCELLED']);

export const locationQuerySchema = z.object({
  branchId: optionalPositiveInt,
  includeInactive: z.coerce.boolean().optional().default(false),
});

export const adjustmentSchema = z.object({
  branchId: optionalPositiveInt,
  whId: optionalPositiveInt,
  productId: optionalPositiveInt,
  itemId: optionalPositiveInt,
  adjustmentType: adjustmentTypeSchema.optional(),
  quantity: z.coerce.number().positive().optional(),
  qty: z.coerce.number().optional(),
  unitCost: z.coerce.number().nonnegative().default(0),
  reason: z.string().trim().min(1).max(255).optional(),
  status: adjustmentStatusSchema.optional().default('POSTED'),
  note: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!(value.productId || value.itemId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Item is required',
      path: ['itemId'],
    });
  }

  if (value.qty !== undefined && Number(value.qty) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity difference cannot be zero',
      path: ['qty'],
    });
  }

  if (value.qty === undefined) {
    if (!value.adjustmentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Adjustment type is required',
        path: ['adjustmentType'],
      });
    }
    if (value.quantity === undefined || Number(value.quantity) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be greater than zero',
        path: ['quantity'],
      });
    }
  }
}).transform((value) => {
  const signedQty = value.qty !== undefined
    ? Number(value.qty)
    : (value.adjustmentType === 'DECREASE' ? -Number(value.quantity || 0) : Number(value.quantity || 0));

  return {
    ...value,
    productId: value.productId ?? value.itemId!,
    qty: signedQty,
    reason: value.reason?.trim() || 'Manual Adjustment',
    status: value.status || 'POSTED',
  };
});

export const adjustmentUpdateSchema = z.object({
  productId: optionalPositiveInt,
  itemId: optionalPositiveInt,
  adjustmentType: adjustmentTypeSchema.optional(),
  quantity: z.coerce.number().positive().optional(),
  qty: z.coerce.number().optional(),
  reason: z.string().trim().min(1).max(255).optional(),
  status: adjustmentStatusSchema.optional(),
}).superRefine((value, ctx) => {
  const hasItem = !!(value.productId || value.itemId);
  const hasQty = value.qty !== undefined;
  const hasPair = value.adjustmentType !== undefined || value.quantity !== undefined;
  const hasReason = value.reason !== undefined;
  const hasStatus = value.status !== undefined;
  if (!hasItem && !hasQty && !hasPair && !hasReason && !hasStatus) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required',
      path: ['qty'],
    });
  }

  if (value.qty !== undefined && Number(value.qty) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity difference cannot be zero',
      path: ['qty'],
    });
  }

  if (value.qty === undefined && hasPair) {
    if (!value.adjustmentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Adjustment type is required with quantity',
        path: ['adjustmentType'],
      });
    }
    if (value.quantity === undefined || Number(value.quantity) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be greater than zero',
        path: ['quantity'],
      });
    }
  }
}).transform((value) => {
  const itemId = value.itemId ?? value.productId;
  const qty = value.qty !== undefined
    ? Number(value.qty)
    : value.adjustmentType
      ? (value.adjustmentType === 'DECREASE' ? -Number(value.quantity || 0) : Number(value.quantity || 0))
      : undefined;

  return {
    ...value,
    itemId,
    qty,
  };
});

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

export const inventoryTransactionListSchema = z.object({
  storeId: optionalPositiveInt,
  itemId: optionalPositiveInt,
  transactionType: z.enum(['ADJUSTMENT', 'PAID', 'SALES', 'DAMAGE']).optional(),
  status: z.enum(['POSTED', 'PENDING', 'CANCELLED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export const inventoryTransactionSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
  transactionType: z.enum(['ADJUSTMENT', 'PAID', 'SALES', 'DAMAGE']),
  direction: z.enum(['IN', 'OUT']).optional(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  referenceNo: z.string().trim().max(120).optional().or(z.literal('')),
  transactionDate: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['POSTED', 'PENDING', 'CANCELLED']).optional().default('POSTED'),
});

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
