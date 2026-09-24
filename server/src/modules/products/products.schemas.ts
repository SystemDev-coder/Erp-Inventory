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

const roundToInt = (value: unknown) => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'undefined' ||
    value === 'null'
  ) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : value;
};

const optionalNonnegativeRoundedInt = z.preprocess(
  roundToInt,
  z.number().int().nonnegative().optional()
);
const nonnegativeRoundedInt = z.preprocess(roundToInt, z.number().int().nonnegative());

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
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
  stockStatus: z.enum(['in_stock', 'low_stock', 'no_stock']).optional(),
}).superRefine((value, ctx) => {
  if (value.fromDate && value.toDate && value.fromDate > value.toDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fromDate must be before or equal to toDate',
      path: ['toDate'],
    });
  }
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(120),
  description: textField,
  isActive: z.coerce.boolean().optional().default(true),
  branchId: optionalPositiveInt,
  // Phase 9: which Dynamic Product Attributes catalog keys apply to items
  // in this category - lets e.g. "Mobile Phones" and "TVs" each show only
  // the fields they need. Validated against the catalog in the service
  // layer (keeps this schema file free of a config import).
  attributeKeys: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
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
  barcode: z
    .string()
    .trim()
    .max(80)
    .or(z.literal(''))
    .nullable()
    .optional(),
  storeId: nullablePositiveInt.optional(),
  categoryId: nullablePositiveInt.optional(),
  unitId: nullablePositiveInt.optional(),
  supplierId: nullablePositiveInt.optional(),
  brand: z.string().trim().max(120).or(z.literal('')).nullable().optional(),
  // Phase 11: business-type-driven product attributes. All optional/nullable,
  // same as barcode above - a business type that doesn't use a given field
  // (e.g. size for a pharmacy) simply never sends it; nothing here requires
  // any of them.
  size: z.string().trim().max(40).or(z.literal('')).nullable().optional(),
  color: z.string().trim().max(40).or(z.literal('')).nullable().optional(),
  genericName: z.string().trim().max(160).or(z.literal('')).nullable().optional(),
  strength: z.string().trim().max(40).or(z.literal('')).nullable().optional(),
  serialNumber: z.string().trim().max(120).or(z.literal('')).nullable().optional(),
  // Phase 9: any catalog key with no dedicated column (model, storage, ram,
  // processor, screen_size, imei, ...) - see server/src/config/productAttributes.ts.
  // Keys with a `column` mapping (brand/color/size/generic_name/strength/
  // serial_number) are ignored here if also sent via their own field above.
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  quantity: optionalNonnegativeRoundedInt,
  stockAlert: nonnegativeRoundedInt.default(5),
  openingBalance: optionalNonnegativeRoundedInt,
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
