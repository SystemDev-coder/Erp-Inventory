import { z } from 'zod';

export const companyInfoSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  phone: z.string().max(50).optional().or(z.literal('')),
  managerName: z.string().max(100).optional().or(z.literal('')),
  logoImg: z.string().url().optional().or(z.literal('')),
  bannerImg: z.string().url().optional().or(z.literal('')),
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
});
