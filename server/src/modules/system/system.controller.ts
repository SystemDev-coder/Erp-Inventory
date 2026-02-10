import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { systemService } from './system.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { deleteCloudinaryImage } from '../../config/cloudinary';

// Get system information
export const getSystemInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const systemInfo = await systemService.getSystemInfo();
  
  if (!systemInfo) {
    throw ApiError.notFound('System information not found');
  }
  
  return ApiResponse.success(res, { systemInfo });
});

// Update system information (text fields)
export const updateSystemInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { systemName, address, phone, email, website } = req.body;
  
  const systemInfo = await systemService.updateSystemInfo({
    systemName,
    address,
    phone,
    email,
    website,
  });
  
  return ApiResponse.success(res, { systemInfo }, 'System information updated');
});

// Upload system logo
export const uploadLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }
  
  const logoUrl = req.file.path; // Cloudinary URL
  
  // Get existing system info to delete old logo
  const existing = await systemService.getSystemInfo();
  if (existing?.logo_url) {
    await deleteCloudinaryImage(existing.logo_url);
  }
  
  const systemInfo = await systemService.updateSystemInfo({ logoUrl });
  
  return ApiResponse.success(res, { systemInfo, logoUrl }, 'Logo uploaded successfully');
});

// Upload system banner
export const uploadBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }
  
  const bannerImageUrl = req.file.path; // Cloudinary URL
  
  // Get existing system info to delete old banner
  const existing = await systemService.getSystemInfo();
  if (existing?.banner_image_url) {
    await deleteCloudinaryImage(existing.banner_image_url);
  }
  
  const systemInfo = await systemService.updateSystemInfo({ bannerImageUrl });
  
  return ApiResponse.success(res, { systemInfo, bannerImageUrl }, 'Banner uploaded successfully');
});

// Delete logo
export const deleteLogo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await systemService.getSystemInfo();
  
  if (existing?.logo_url) {
    await deleteCloudinaryImage(existing.logo_url);
    await systemService.updateSystemInfo({ logoUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Logo deleted successfully');
});

// Delete banner
export const deleteBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await systemService.getSystemInfo();
  
  if (existing?.banner_image_url) {
    await deleteCloudinaryImage(existing.banner_image_url);
    await systemService.updateSystemInfo({ bannerImageUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Banner deleted successfully');
});
