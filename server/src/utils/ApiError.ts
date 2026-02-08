export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    public stack = ''
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

  static conflict(message: string = 'Conflict') {
    return new ApiError(409, message);
  }

  static internal(message: string = 'Internal server error') {
    return new ApiError(500, message);
  }
}
