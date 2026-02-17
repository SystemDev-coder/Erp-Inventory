import { z } from 'zod';

export const shiftStatusSchema = z.enum(['open', 'closed', 'void']);

export const listShiftsQuerySchema = z.object({
  status: shiftStatusSchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(300).optional().default(100),
});

export const openShiftSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  openingCash: z.coerce.number().min(0).optional().default(0),
  note: z.string().max(600).optional().nullable(),
});

export const closeShiftSchema = z.object({
  closingCash: z.coerce.number().min(0),
  note: z.string().max(600).optional().nullable(),
});

export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

