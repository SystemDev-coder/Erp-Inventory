import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Authenticated routes
router.get('/me', requireAuth, authController.me);
router.get('/my-branches', requireAuth, authController.myBranches);
router.post('/logout', requireAuth, authController.logout);

// Lock routes
router.post('/lock/set', requireAuth, authController.setLockPassword);
router.post('/lock/verify', requireAuth, authController.verifyLockPassword);
router.post('/lock/clear', requireAuth, authController.clearLockPassword);

// NEW: verify account password during lock-reset flow
router.post('/verify-login-password', requireAuth, authController.verifyLoginPassword);

export default router;