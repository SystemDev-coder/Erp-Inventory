import { z } from 'zod';

export const saleItemSchema = z
  .object({
    itemId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })
  .transform((value) => ({
    itemId: Number(value.itemId),
    quantity: value.quantity,
    unitPrice: value.unitPrice,
  }));

export const saleSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  whId: z.coerce.number().int().positive().nullable().optional(),
  taxId: z.coerce.number().int().positive().nullable().optional(),
  taxRate: z.coerce.number().nonnegative().optional(),
  saleDate: z.string().optional(),
  subtotal: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  saleType: z.enum(['cash', 'credit']).default('cash'),
  docType: z.enum(['sale', 'invoice', 'quotation']).default('sale'),
  quoteValidUntil: z.string().optional(),
  status: z.enum(['paid', 'partial', 'unpaid', 'void']).default('paid'),
  note: z.string().optional().or(z.literal('')),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
  // Optional inline payment details (used to update accounts and customer balance)
  payFromAccId: z.coerce.number().int().positive().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
});

export const saleUpdateSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  whId: z.coerce.number().int().positive().nullable().optional(),
  taxId: z.coerce.number().int().positive().nullable().optional(),
  taxRate: z.coerce.number().nonnegative().optional(),
  saleDate: z.string().optional(),
  saleType: z.enum(['cash', 'credit']).optional(),
  docType: z.enum(['sale', 'invoice', 'quotation']).optional(),
  quoteValidUntil: z.string().nullable().optional(),
  status: z.enum(['paid', 'partial', 'unpaid', 'void']).optional(),
  subtotal: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().optional(),
  total: z.coerce.number().nonnegative().optional(),
  note: z.string().optional(),
  items: z.array(saleItemSchema).min(1, 'At least one item is required').optional(),
  payFromAccId: z.coerce.number().int().positive().nullable().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
});

export const saleVoidSchema = z.object({
  reason: z.string().max(240).optional(),
});

export const quotationConvertSchema = z.object({
  saleDate: z.string().optional(),
  status: z.enum(['paid', 'partial', 'unpaid', 'void']).default('unpaid'),
  payFromAccId: z.coerce.number().int().positive().optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  note: z.string().optional(),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type SaleItemInput = z.infer<typeof saleItemSchema>;
export type SaleUpdateInput = z.infer<typeof saleUpdateSchema>;
export type SaleVoidInput = z.infer<typeof saleVoidSchema>;
export type QuotationConvertInput = z.infer<typeof quotationConvertSchema>;

