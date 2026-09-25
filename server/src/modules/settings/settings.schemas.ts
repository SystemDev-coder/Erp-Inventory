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
    accountId: z.coerce.number().int().positive('Account is required').optional(),
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
  (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
  { message: 'fromDate must be before or equal to toDate', path: ['toDate'] }
);

export const capitalReportQuerySchema = z.object({
  owner: z.string().trim().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
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

export const openingBalanceCleanupSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  target: z.enum(['retained', 'capital']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

const optionalAccId = z.coerce.number().int().positive().nullable().optional();

export const businessProfileSchema = z.object({
  businessType: z.enum(['general', 'supermarket', 'clothing', 'pharmacy', 'perfume', 'cosmetics', 'electronics', 'other']).optional(),
  email: z.string().trim().max(150).email('Invalid email').optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
  currency: z.string().trim().max(10).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  timezone: z.string().trim().max(60).optional().or(z.literal('')),
  productConfig: z
    .object({
      barcode: z.boolean().optional(),
      variants: z.boolean().optional(),
      size: z.boolean().optional(),
      color: z.boolean().optional(),
      brand: z.boolean().optional(),
      batchTracking: z.boolean().optional(),
      expiryTracking: z.boolean().optional(),
      serialNumber: z.boolean().optional(),
      multipleUnits: z.boolean().optional(),
      genericName: z.boolean().optional(),
      strength: z.boolean().optional(),
    })
    .partial()
    .optional(),
  salesConfig: z
    .object({
      retail: z.boolean().optional(),
      wholesale: z.boolean().optional(),
      credit: z.boolean().optional(),
      creditDays: z.coerce.number().int().nonnegative().optional(),
      discount: z.boolean().optional(),
      tax: z.boolean().optional(),
      pos: z.boolean().optional(),
      customerDisplay: z.boolean().optional(),
    })
    .partial()
    .optional(),
  purchaseConfig: z
    .object({
      supplierManagement: z.boolean().optional(),
      purchaseOrders: z.boolean().optional(),
      purchasePayments: z.boolean().optional(),
      creditPurchases: z.boolean().optional(),
      supplierCreditDays: z.coerce.number().int().nonnegative().optional(),
    })
    .partial()
    .optional(),
  accountingConfig: z
    .object({
      defaultCashAccId: optionalAccId,
      defaultBankAccId: optionalAccId,
      arAccId: optionalAccId,
      apAccId: optionalAccId,
      salesRevenueAccId: optionalAccId,
      inventoryAccId: optionalAccId,
      cogsAccId: optionalAccId,
      openingBalanceEquityAccId: optionalAccId,
    })
    .partial()
    .optional(),
  branchConfig: z
    .object({
      multiBranch: z.boolean().optional(),
      defaultBranchId: z.coerce.number().int().positive().nullable().optional(),
    })
    .partial()
    .optional(),
  receiptConfig: z
    .object({
      logo: z.boolean().optional(),
      header: z.string().trim().max(500).optional().or(z.literal('')),
      footer: z.string().trim().max(500).optional().or(z.literal('')),
      showCustomer: z.boolean().optional(),
      showBarcode: z.boolean().optional(),
      showTax: z.boolean().optional(),
      showDiscount: z.boolean().optional(),
      paperSize: z.enum(['a4', 'thermal']).optional(),
    })
    .partial()
    .optional(),
  notificationConfig: z
    .object({
      lowStock: z.boolean().optional(),
      expiry: z.boolean().optional(),
      creditDue: z.boolean().optional(),
      purchasePayment: z.boolean().optional(),
    })
    .partial()
    .optional(),
});
