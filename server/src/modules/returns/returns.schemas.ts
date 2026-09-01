import { z } from 'zod';

const returnItemSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  unitCost: z.coerce.number().nonnegative().optional(),
});

export const createSalesReturnSchema = z.object({
  saleId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive(),
  returnDate: z.string().optional(),
  note: z.string().optional(),
  refundAccId: z.coerce.number().int().positive().optional(),
  refundAmount: z.coerce.number().nonnegative().optional(),
  refundViaAccount: z.boolean().optional(),
  items: z.array(returnItemSchema).min(1),
});

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive(),
  returnDate: z.string().optional(),
  note: z.string().optional(),
  refundAccId: z.coerce.number().int().positive().optional(),
  refundAmount: z.coerce.number().nonnegative().optional(),
  refundViaAccount: z.boolean().optional(),
  items: z.array(returnItemSchema).min(1),
});

export const deleteReturnSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});

export type CreateSalesReturnBody = z.infer<typeof createSalesReturnSchema>;
export type CreatePurchaseReturnBody = z.infer<typeof createPurchaseReturnSchema>;
