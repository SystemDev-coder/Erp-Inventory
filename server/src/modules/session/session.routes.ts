import { Router } from 'express';
import { sessionController } from './session.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// User permissions & sidebar
router.get('/user/permissions', sessionController.getPermissions);
router.get('/user/sidebar', sessionController.getSidebar);
router.get('/check-permission/:permKey', sessionController.checkPermission);

// User preferences
router.get('/user/preferences', sessionController.getPreferences);
router.put('/user/preferences', sessionController.updatePreferences);

// Session management
router.get('/user/sessions', sessionController.getSessions);
router.post('/user/logout-other-sessions', sessionController.logoutOtherSessions);
router.delete('/user/sessions/:sessionId', sessionController.logoutSession);

// Session limit (admin only)
router.put(
  '/user/session-limit/:userId?',
  requirePerm('system.users'),
  sessionController.updateSessionLimit
);

export default router;
