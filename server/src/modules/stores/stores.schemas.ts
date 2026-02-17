import { z } from 'zod';

export const storeCreateSchema = z.object({
  storeName: z.string().min(1, 'Store name is required'),
  storeCode: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional(),
});

export const storeUpdateSchema = storeCreateSchema.partial();

export const storeItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().nonnegative(),
});

export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
export type StoreItemInput = z.infer<typeof storeItemSchema>;
