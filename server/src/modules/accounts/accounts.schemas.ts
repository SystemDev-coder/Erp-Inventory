import { z } from 'zod';

export const accountSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  institution: z.string().optional().or(z.literal('')),
  currencyCode: z.string().length(3).default('USD'),
  balance: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
  accountType: z.enum(['asset', 'equity']).optional(),
});

export const accountUpdateSchema = accountSchema.partial();

export type AccountInput = z.infer<typeof accountSchema>;
