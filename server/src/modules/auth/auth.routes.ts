import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { authLimiter, forgotPasswordLimiter } from '../../utils/rateLimit';

const router = Router();

// Public routes
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);
router.post('/lock/set', requireAuth, authController.setLockPassword);
router.post('/lock/verify', requireAuth, authController.verifyLockPassword);
router.post('/lock/clear', requireAuth, authController.clearLockPassword);

export default router;
