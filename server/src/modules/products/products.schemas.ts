import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().max(1000).optional().or(z.literal('')),
  parentId: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional().default(true),
});

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(120).optional().or(z.literal('')),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  price: z.coerce.number().nonnegative().default(0),
  cost: z.coerce.number().nonnegative().default(0),
  stock: z.coerce.number().nonnegative().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  reorderLevel: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;
