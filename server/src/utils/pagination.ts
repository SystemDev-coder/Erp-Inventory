import { z } from 'zod';

export type Paged<T> = { rows: T[]; total: number; page: number; limit: number };

export const offsetOf = (page: number, limit: number) => (page - 1) * limit;

export const listPaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const paginationMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});
