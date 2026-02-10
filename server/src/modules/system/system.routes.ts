import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { uploadSystemImage } from '../../config/cloudinary';
import {
  getSystemInfo,
  updateSystemInfo,
  uploadLogo,
  uploadBanner,
  deleteLogo,
  deleteBanner,
} from './system.controller';

const router = Router();

router.use(requireAuth);

// Get system information (public within system)
router.get('/', requirePerm('system.view'), getSystemInfo);

// Update system information
router.put('/', requirePerm('system.update'), updateSystemInfo);

// Upload logo
router.post(
  '/logo',
  requirePerm('system.update'),
  uploadSystemImage.single('logo'),
  uploadLogo
);

// Upload banner
router.post(
  '/banner',
  requirePerm('system.update'),
  uploadSystemImage.single('banner'),
  uploadBanner
);

// Delete logo
router.delete('/logo', requirePerm('system.update'), deleteLogo);

// Delete banner
router.delete('/banner', requirePerm('system.update'), deleteBanner);

export default router;
