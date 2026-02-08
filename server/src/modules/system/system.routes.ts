import { Router } from 'express';
import { systemController } from './system.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm, requireAnyPerm } from '../../middlewares/requirePerm';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Permissions (view only)
router.get(
  '/permissions',
  requireAnyPerm(['system.permissions', 'system.roles']),
  systemController.getPermissions
);

// Roles
router.get(
  '/roles',
  requirePerm('system.roles'),
  systemController.getRoles
);

router.post(
  '/roles',
  requirePerm('system.roles'),
  systemController.createRole
);

router.put(
  '/roles/:id',
  requirePerm('system.roles'),
  systemController.updateRole
);

router.get(
  '/roles/:id/permissions',
  requirePerm('system.roles'),
  systemController.getRolePermissions
);

router.put(
  '/roles/:id/permissions',
  requirePerm('system.roles'),
  systemController.updateRolePermissions
);

// Users
router.get(
  '/users',
  requirePerm('system.users'),
  systemController.getUsers
);

router.put(
  '/users/:id',
  requirePerm('system.users'),
  systemController.updateUserAccess
);

router.get(
  '/users/:id/permissions',
  requirePerm('system.users'),
  systemController.getUserPermissions
);

router.put(
  '/users/:id/permissions',
  requirePerm('system.users'),
  systemController.updateUserPermissions
);

// New: Allow/Deny overrides
router.get(
  '/users/:id/overrides',
  requirePerm('system.users'),
  systemController.getUserOverrides
);

router.put(
  '/users/:id/overrides',
  requirePerm('system.users'),
  systemController.updateUserOverrides
);

router.get(
  '/users/:id/audit',
  requirePerm('system.users'),
  systemController.getUserAuditLogs
);

export default router;
