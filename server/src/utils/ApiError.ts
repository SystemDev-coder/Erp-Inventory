export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    public stack = '',
    // Delete-protection audit (Phase 10 Batch 1): optional structured payload
    // so a blocked delete can report real dependency counts (e.g. {code:
    // 'RECORD_HAS_TRANSACTIONS', dependencies: {sales: 12, purchases: 5}})
    // instead of only a plain message string. Additive/optional - every
    // existing ApiError.* call site is unaffected.
    public details?: { code?: string; dependencies?: Record<string, number> }
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message: string = 'Bad request') {
    return new ApiError(400, message);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message: string = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message: string = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message: string = 'Conflict', details?: { code?: string; dependencies?: Record<string, number> }) {
    return new ApiError(409, message, true, '', details);
  }

  static internal(message: string = 'Internal server error') {
    return new ApiError(500, message);
  }
}
