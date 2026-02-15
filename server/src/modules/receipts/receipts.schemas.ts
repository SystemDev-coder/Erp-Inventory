import { z } from 'zod';

export const receiptSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  chargeId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  currencyCode: z.string().length(3).default('USD').optional(),
  fxRate: z.coerce.number().positive().default(1).optional(),
  referenceNo: z.string().optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
  receiptDate: z.string().optional(),
});

export type ReceiptInput = z.infer<typeof receiptSchema>;
