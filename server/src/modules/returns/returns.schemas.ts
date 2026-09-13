import { z } from 'zod';
import { deleteReasonSchema } from '../../utils/deleteReason';

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

export const deleteReturnSchema = deleteReasonSchema;

export type CreateSalesReturnBody = z.infer<typeof createSalesReturnSchema>;
export type CreatePurchaseReturnBody = z.infer<typeof createPurchaseReturnSchema>;
