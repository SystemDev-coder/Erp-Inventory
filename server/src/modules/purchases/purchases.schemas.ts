import { z } from 'zod';

export const purchaseItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  batchNo: z.string().optional().or(z.literal('')),
  expiryDate: z.string().optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  whId: z.coerce.number().int().positive().nullable().optional(),
  purchaseDate: z.string().optional(),
  purchaseType: z.enum(['cash', 'credit']).default('cash'),
  subtotal: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  status: z.enum(['received', 'partial', 'unpaid', 'void']).default('received'),
  currencyCode: z.string().length(3).optional().default('USD'),
  fxRate: z.coerce.number().positive().default(1),
  note: z.string().optional().or(z.literal('')),
  items: z.array(purchaseItemSchema).optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
