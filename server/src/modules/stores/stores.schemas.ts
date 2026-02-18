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

export const storeListQuerySchema = z.object({
  branchId: optionalPositiveInt,
  search: z.string().trim().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const storeCreateSchema = z.object({
  storeName: z.string().min(1, 'Store name is required'),
  storeCode: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional(),
});

export const storeUpdateSchema = storeCreateSchema.partial();

export const storeItemListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export const storeItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().nonnegative(),
});

export type StoreListQueryInput = z.infer<typeof storeListQuerySchema>;
export type StoreItemListQueryInput = z.infer<typeof storeItemListQuerySchema>;
export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
export type StoreItemInput = z.infer<typeof storeItemSchema>;
