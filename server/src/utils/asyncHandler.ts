import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrapper to catch async errors in route handlers
 * Eliminates need for try-catch blocks
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
