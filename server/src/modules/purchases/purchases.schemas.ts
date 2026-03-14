import { z } from 'zod';

const roundToInt = (value: unknown) => {
  if (value === undefined || value === null || value === '') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : value;
};

const roundedPositiveInt = z.preprocess(roundToInt, z.number().int().positive());

export const purchaseItemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  quantity: roundedPositiveInt,
  unitCost: z.coerce.number().nonnegative(),
  salePrice: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().default(0).optional(),
  description: z.string().optional().or(z.literal('')),
  batchNo: z.string().optional().or(z.literal('')),
  expiryDate: z.string().optional(),
});

export const purchaseSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  storeId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  purchaseDate: z.string().optional(),
  purchaseType: z.enum(['cash', 'credit']).default('cash').optional(),
  subtotal: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  status: z.enum(['received', 'partial', 'unpaid', 'void']).default('received'),
  fxRate: z.coerce.number().positive().default(1),
  note: z.string().optional().or(z.literal('')),
  items: z.array(purchaseItemSchema).optional(),
  // Optional inline payment details (used to update accounts and supplier balance)
  payFromAccId: z.coerce.number().int().positive().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
