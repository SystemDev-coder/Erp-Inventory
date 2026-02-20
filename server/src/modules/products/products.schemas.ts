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

const nullablePositiveInt = z.preprocess(
  (value) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'undefined' ||
      value === 'null'
    ) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.number().int().positive().nullable()
);

const textField = z.string().trim().max(1000).optional().or(z.literal(''));

export const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  categoryId: optionalPositiveInt,
  category_id: optionalPositiveInt,
  unitId: optionalPositiveInt,
  unit_id: optionalPositiveInt,
  taxId: optionalPositiveInt,
  tax_id: optionalPositiveInt,
  storeId: optionalPositiveInt,
  store_id: optionalPositiveInt,
  branchId: optionalPositiveInt,
  branch_id: optionalPositiveInt,
  includeInactive: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(120),
  description: textField,
  isActive: z.coerce.boolean().optional().default(true),
  branchId: optionalPositiveInt,
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const unitCreateSchema = z.object({
  unitName: z.string().trim().min(1, 'Unit name is required').max(60),
  symbol: z.string().trim().max(15).optional().or(z.literal('')),
  isActive: z.coerce.boolean().optional().default(true),
  branchId: optionalPositiveInt,
});

export const unitUpdateSchema = unitCreateSchema.partial();

export const taxCreateSchema = z.object({
  taxName: z.string().trim().min(1, 'Tax name is required').max(80),
  ratePercent: z.coerce.number().min(0).max(1000),
  isInclusive: z.coerce.boolean().optional().default(false),
  isActive: z.coerce.boolean().optional().default(true),
  branchId: optionalPositiveInt,
});

export const taxUpdateSchema = taxCreateSchema.partial();

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  barcode: z.string().trim().max(80).optional().or(z.literal('')),
  storeId: nullablePositiveInt.optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  stockAlert: z.coerce.number().nonnegative().default(5),
  openingBalance: z.coerce.number().nonnegative().optional(),
  costPrice: z.coerce.number().nonnegative().default(0),
  sellPrice: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  branchId: optionalPositiveInt,
});

export const productUpdateSchema = productCreateSchema.partial();

export type ListQueryInput = z.infer<typeof listQuerySchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;
export type TaxCreateInput = z.infer<typeof taxCreateSchema>;
export type TaxUpdateInput = z.infer<typeof taxUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
