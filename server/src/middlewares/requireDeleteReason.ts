import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireAuth';
import { deleteReasonSchema } from '../utils/deleteReason';
import { ApiError } from '../utils/ApiError';

const EXEMPT_PATH_PATTERNS = [
  /^\/api\/health$/,
  /^\/api\/auth\//,
  /^\/api\/user\/sessions\/[^/]+$/,
];

const isExemptDeletePath = (path: string) =>
  EXEMPT_PATH_PATTERNS.some((pattern) => pattern.test(path));

export const requireDeleteReasonMiddleware = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (req.method !== 'DELETE') return next();
  if (isExemptDeletePath(req.path)) return next();

  try {
    const { reason } = deleteReasonSchema.parse(req.body ?? {});
    req.deleteReason = reason;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(ApiError.badRequest('A reason is required to delete this record'));
  }
};
