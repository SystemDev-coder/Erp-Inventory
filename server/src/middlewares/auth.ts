import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from './error';

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    username: string;
    roleId: number;
    branchId: number;
  };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Access token required');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    
    req.user = {
      userId: payload.userId,
      username: payload.username,
      roleId: payload.roleId,
      branchId: payload.branchId,
    };
    
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      next(new AppError(401, 'Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new AppError(401, 'Token expired'));
    } else {
      next(error);
    }
  }
};
