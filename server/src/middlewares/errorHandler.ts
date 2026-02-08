import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { ZodError } from 'zod';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | ApiError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // PostgreSQL errors
  if ('code' in err) {
    const pgError = err as any;
    
    // Unique violation
    if (pgError.code === '23505') {
      const field = pgError.detail?.match(/Key \((\w+)\)/)?.[1] || 'field';
      return res.status(409).json({
        success: false,
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
      });
    }
    
    // Foreign key violation
    if (pgError.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Referenced record does not exist',
      });
    }
  }

  // Default error
  return res.status(500).json({
    success: false,
    message: config.isDev ? err.message : 'Internal server error',
  });
};
