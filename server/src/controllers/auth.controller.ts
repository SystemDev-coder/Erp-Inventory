import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import authService from '../services/auth.service';
import { signupSchema, loginSchema } from '../validators/auth.schema';
import { env } from '../utils/env';

export class AuthController {
  /**
   * POST /api/auth/signup
   */
  async signup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const validatedData = signupSchema.parse(req.body);
      const result = await authService.signup(validatedData);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData);

      // Set refresh token as HttpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   */
  async refresh(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token required',
        });
      }

      const result = await authService.refresh(refreshToken);

      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * GET /api/auth/me
   */
  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const profile = await authService.getProfile(req.user.userId);

      return res.json({
        success: true,
        data: profile,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
      });

      return res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new AuthController();
