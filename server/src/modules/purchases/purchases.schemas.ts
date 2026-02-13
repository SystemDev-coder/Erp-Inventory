import { z } from 'zod';

export const purchaseItemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0).optional(),
  description: z.string().optional().or(z.literal('')),
  batchNo: z.string().optional().or(z.literal('')),
  expiryDate: z.string().optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  whId: z.coerce.number().int().positive().nullable().optional(),
  purchaseDate: z.string().optional(),
  subtotal: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  status: z.enum(['received', 'partial', 'unpaid', 'void']).default('received'),
  currencyCode: z.string().length(3).optional().default('USD'),
  fxRate: z.coerce.number().positive().default(1),
  note: z.string().optional().or(z.literal('')),
  items: z.array(purchaseItemSchema).optional(),
  // Optional inline payment details (used to update accounts and supplier balance)
  payFromAccId: z.coerce.number().int().positive().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
