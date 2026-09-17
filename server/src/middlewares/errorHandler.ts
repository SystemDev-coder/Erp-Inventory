import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { ZodError } from 'zod';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | ApiError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err?.message, err?.stack);

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
      // Phase 12 blocker fix: uq_items_branch_barcode is a composite
      // (branch_id, barcode) key, so the generic "Key (word)" regex below
      // never matches it (the detail text is "Key (branch_id, barcode)=...",
      // which isn't a single \w+ token) and falls through to the unhelpful
      // "Field already exists". Naming the constraint explicitly gives POS/
      // barcode entry a real, actionable message without touching how any
      // other unique constraint in the app is reported.
      if (pgError.constraint === 'uq_items_branch_barcode') {
        return res.status(409).json({
          success: false,
          message: 'A product with this barcode already exists',
        });
      }
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

    // Custom business rule exceptions (RAISE EXCEPTION)
    if (pgError.code === 'P0001') {
      return res.status(400).json({
        success: false,
        message: pgError.message || 'Operation blocked by business rule',
      });
    }
  }

  // Default error
  return res.status(500).json({
    success: false,
    message: config.isDev ? err.message : 'Internal server error',
  });
};
