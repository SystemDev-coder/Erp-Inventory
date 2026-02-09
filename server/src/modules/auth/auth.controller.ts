import { Response } from 'express';
import { authService } from './auth.service';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import { getCookieOptions, getClearCookieOptions } from '../../config/cookie';
import { config } from '../../config/env';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schemas';

export class AuthController {
  register = asyncHandler(async (req: AuthRequest, res: Response) => {
    const input = registerSchema.parse(req.body);
    const { tokens, user } = await authService.register(input);

    // Set refresh token cookie
    res.cookie(config.cookie.name, tokens.refreshToken, getCookieOptions());

    return ApiResponse.created(res, {
      accessToken: tokens.accessToken,
      user,
    }, 'Registration successful');
  });

  login = asyncHandler(async (req: AuthRequest, res: Response) => {
    const input = loginSchema.parse(req.body);
    const { tokens, user } = await authService.login(input);

    // Set refresh token cookie
    res.cookie(config.cookie.name, tokens.refreshToken, getCookieOptions());

    return ApiResponse.success(res, {
      accessToken: tokens.accessToken,
      user,
    }, 'Login successful');
  });

  refresh = asyncHandler(async (req: AuthRequest, res: Response) => {
    const refreshToken = req.cookies[config.cookie.name];

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    const accessToken = await authService.refresh(refreshToken);

    return ApiResponse.success(res, { accessToken }, 'Token refreshed');
  });

  me = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const data = await authService.getUserWithPermissions(req.user.userId);

    return ApiResponse.success(res, data);
  });

  logout = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user) {
      await authService.logout(req.user.userId);
    }

    // Clear refresh token cookie (no maxAge to avoid Express 5 deprecation)
    res.clearCookie(config.cookie.name, getClearCookieOptions());

    return ApiResponse.success(res, null, 'Logged out successfully');
  });

  forgotPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const input = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(input);

    if (config.resetPassword.devReturnCode && result.resetCode) {
      return ApiResponse.success(res, {
        message: 'Password reset code generated',
        resetCode: result.resetCode,
      });
    }

    return ApiResponse.success(res, null, 'If the account exists, a reset code has been sent');
  });

  resetPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input);

    return ApiResponse.success(res, null, 'Password reset successfully');
  });
}

export const authController = new AuthController();
