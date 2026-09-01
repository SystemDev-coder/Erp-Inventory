import { z } from 'zod';
import { ApiError } from './ApiError';

export const deleteReasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to delete this record').max(500),
});

export type DeleteReasonInput = z.infer<typeof deleteReasonSchema>;

export const requireDeleteReason = (reason: string | undefined | null): string => {
  const parsed = deleteReasonSchema.safeParse({ reason: reason ?? '' });
  if (!parsed.success) {
    throw ApiError.badRequest(
      parsed.error.issues[0]?.message || 'A reason is required to delete this record'
    );
  }
  return parsed.data.reason;
};
