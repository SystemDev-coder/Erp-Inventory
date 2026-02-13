import { z } from 'zod';

export const saleItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

export const saleSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  whId: z.coerce.number().int().positive().nullable().optional(),
  saleDate: z.string().optional(),
  subtotal: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  saleType: z.enum(['cash', 'credit']).default('cash'),
  status: z.enum(['paid', 'partial', 'unpaid', 'void']).default('paid'),
  currencyCode: z.string().length(3).optional().default('USD'),
  fxRate: z.coerce.number().positive().default(1),
  note: z.string().optional().or(z.literal('')),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
  // Optional inline payment details (used to update accounts and customer balance)
  payFromAccId: z.coerce.number().int().positive().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type SaleItemInput = z.infer<typeof saleItemSchema>;

