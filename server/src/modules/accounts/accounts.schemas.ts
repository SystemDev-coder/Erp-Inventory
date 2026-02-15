import { z } from 'zod';

export const accountSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  institution: z.string().optional().or(z.literal('')),
  currencyCode: z.string().length(3).default('USD'),
  balance: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export const accountUpdateSchema = accountSchema.partial();

export type AccountInput = z.infer<typeof accountSchema>;
