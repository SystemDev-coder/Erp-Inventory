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
