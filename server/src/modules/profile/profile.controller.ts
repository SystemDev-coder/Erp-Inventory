import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { profileService } from './profile.service';
import { profileUpdateSchema, passwordChangeSchema } from './profile.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { changePassword } from './profile.password';

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Not authenticated');
  const profile = await profileService.getProfile(userId);
  if (!profile) throw ApiError.notFound('Profile not found');
  return ApiResponse.success(res, { profile });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Not authenticated');
  const input = profileUpdateSchema.parse(req.body);
  const profile = await profileService.updateProfile(userId, input);
  if (!profile) throw ApiError.notFound('Profile not found');
  return ApiResponse.success(res, { profile }, 'Profile updated');
});

export const updatePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Not authenticated');
  const input = passwordChangeSchema.parse(req.body);
  await changePassword(userId, input.currentPassword, input.newPassword);
  return ApiResponse.success(res, null, 'Password updated');
});
