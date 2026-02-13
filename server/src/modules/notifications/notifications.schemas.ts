import { z } from 'zod';

const toOptionalInt = (value: unknown) => {
  if (value === undefined || value === null || value === '' || value === 'undefined') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const toOptionalBoolean = (value: unknown) => {
  if (value === undefined || value === null || value === '' || value === 'undefined') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }

  return value;
};

export const notificationsQuerySchema = z.object({
  limit: z.preprocess(
    toOptionalInt,
    z.number().int().min(1).max(100).optional().default(12)
  ),
  offset: z.preprocess(
    toOptionalInt,
    z.number().int().min(0).optional().default(0)
  ),
  unreadOnly: z.preprocess(
    toOptionalBoolean,
    z.boolean().optional().default(false)
  ),
});

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
