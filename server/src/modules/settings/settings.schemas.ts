import { z } from 'zod';

const imageInputSchema = z
  .string()
  .max(2048, 'Image path is too long')
  .optional()
  .or(z.literal(''))
  .refine(
    (value) =>
      !value ||
      /^https?:\/\//i.test(value) ||
      value.startsWith('/') ||
      value.startsWith('data:image/') ||
      !/\s/.test(value),
    'Image must be a valid URL or image path'
  );

export const companyInfoSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(150, 'Company name is too long'),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  managerName: z.string().trim().max(100).optional().or(z.literal('')),
  logoImg: imageInputSchema,
  bannerImg: imageInputSchema,
  capitalAmount: z.coerce.number().min(0, 'Capital must be zero or greater').optional(),
});

export const branchCreateSchema = z.object({
  branchName: z.string().min(1, 'Branch name is required'),
  location: z.string().max(255).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

export const branchUpdateSchema = branchCreateSchema.partial();

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (value) => (value.startDate && value.endDate) || (!value.startDate && !value.endDate),
  { message: 'Both startDate and endDate are required together', path: ['startDate'] }
).refine(
  (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  { message: 'startDate must be before or equal to endDate', path: ['endDate'] }
);

export const capitalCreateSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  ownerName: z.string().trim().min(1, 'Owner name is required').max(150, 'Owner name is too long'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  sharePct: z.coerce.number().min(0, 'Share must be 0 or greater').max(100, 'Share cannot exceed 100%').optional().default(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  accountId: z.coerce.number().int().positive('Account is required').optional(),
  note: z.string().max(500).optional().or(z.literal('')),
});

export const capitalUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(1, 'Owner name is required').max(150, 'Owner name is too long').optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    sharePct: z.coerce.number().min(0, 'Share must be 0 or greater').max(100, 'Share cannot exceed 100%').optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    note: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const capitalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  owner: z.string().trim().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (value) => (value.fromDate && value.toDate) || (!value.fromDate && !value.toDate),
  { message: 'Both fromDate and toDate are required together', path: ['fromDate'] }
).refine(
  (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
  { message: 'fromDate must be before or equal to toDate', path: ['toDate'] }
);

export const capitalReportQuerySchema = z.object({
  owner: z.string().trim().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (value) => (value.fromDate && value.toDate) || (!value.fromDate && !value.toDate),
  { message: 'Both fromDate and toDate are required together', path: ['fromDate'] }
).refine(
  (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
  { message: 'fromDate must be before or equal to toDate', path: ['toDate'] }
);

export const capitalOwnerQuerySchema = z.object({
  search: z.string().trim().optional(),
  owner: z.string().trim().optional(),
});

export const capitalDrawingCreateSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  ownerName: z.string().trim().min(1, 'Owner name is required').max(150, 'Owner name is too long'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  accountId: z.coerce.number().int().positive('Account is required').optional(),
  note: z.string().max(500).optional().or(z.literal('')),
});

export const capitalDrawingUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(1, 'Owner name is required').max(150, 'Owner name is too long').optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    accountId: z.coerce.number().int().positive('Account is required').optional(),
    note: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const capitalDrawingListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
    search: z.string().trim().optional(),
    owner: z.string().trim().optional(),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (value) => (value.fromDate && value.toDate) || (!value.fromDate && !value.toDate),
    { message: 'Both fromDate and toDate are required together', path: ['fromDate'] }
  )
  .refine(
    (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
    { message: 'fromDate must be before or equal to toDate', path: ['toDate'] }
  );

export const settingsClosingCreateSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  closeMode: z.enum(['monthly', 'quarterly', 'yearly', 'custom']).optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional().or(z.literal('')),
}).refine(
  (value) => value.periodFrom <= value.periodTo,
  { message: 'periodFrom must be before or equal to periodTo', path: ['periodTo'] }
);

export const settingsClosingUpdateSchema = z
  .object({
    closeMode: z.enum(['monthly', 'quarterly', 'yearly', 'custom']).optional(),
    periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((value) => value.periodFrom <= value.periodTo, {
    message: 'periodFrom must be before or equal to periodTo',
    path: ['periodTo'],
  });

export const settingsClosingListQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'closed', 'reopened']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (value) => (value.fromDate && value.toDate) || (!value.fromDate && !value.toDate),
  { message: 'Both fromDate and toDate are required together', path: ['fromDate'] }
).refine(
  (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
  { message: 'fromDate must be before or equal to toDate', path: ['toDate'] }
);

export const settingsOwnerProfitPreviewSchema = z.object({
  closingId: z.coerce.number().int().positive(),
  ownerName: z.string().trim().min(1, 'Owner is required').max(150),
  sharePct: z.coerce.number().min(0).max(100).optional(),
});

export const settingsProfitOwnerUpsertSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  ownerName: z.string().trim().min(1, 'Owner is required').max(150),
  sharePct: z.coerce.number().min(0, 'Share must be 0 or greater').max(100, 'Share cannot exceed 100%'),
});

export const settingsAssetPrepareSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
});
