import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    
    req.user = payload;
    next();
  } catch (error: any) {
    if (error.message?.includes('expired')) {
      return next(ApiError.unauthorized('Token expired'));
    }
    if (error.message?.includes('invalid')) {
      return next(ApiError.unauthorized('Invalid token'));
    }
    next(error);
  }
};
