import { z } from 'zod';

export const trashListQuerySchema = z.object({
  table: z.string().trim().min(1),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const trashRestoreSchema = z.object({
  table: z.string().trim().min(1),
  id: z.coerce.number().int().positive(),
});

export type TrashListQuery = z.infer<typeof trashListQuerySchema>;
export type TrashRestoreInput = z.infer<typeof trashRestoreSchema>;
