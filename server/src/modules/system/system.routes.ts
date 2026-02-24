import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { uploadSystemImage } from '../../config/cloudinary';
import {
  clearLogs,
  createPermission,
  createRole,
  createUser,
  deleteLog,
  getSystemInfo,
  getRolePermissions,
  listBranches,
  listLogs,
  listPermissions,
  listRoles,
  listUsers,
  updatePermission,
  updateRole,
  updateRolePermissions,
  updateSystemInfo,
  updateUser,
  uploadLogo,
  uploadBanner,
  deletePermission,
  deleteRole,
  deleteUser,
  deleteLogo,
  deleteBanner,
} from './system.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requireAnyPerm(['system.settings', 'system.company.manage']), getSystemInfo);
router.put('/', requireAnyPerm(['system.settings', 'system.company.manage']), updateSystemInfo);

// Upload logo
router.post(
  '/logo',
  requireAnyPerm(['system.settings', 'system.company.manage']),
  uploadSystemImage.single('logo'),
  uploadLogo
);

// Upload banner
router.post(
  '/banner',
  requireAnyPerm(['system.settings', 'system.company.manage']),
  uploadSystemImage.single('banner'),
  uploadBanner
);

// Delete logo
router.delete('/logo', requireAnyPerm(['system.settings', 'system.company.manage']), deleteLogo);

// Delete banner
router.delete('/banner', requireAnyPerm(['system.settings', 'system.company.manage']), deleteBanner);

router.get('/branches', requireAnyPerm(['system.users.manage', 'system.branches.manage', 'system.settings']), listBranches);

router.get('/users', requireAnyPerm(['system.users.manage', 'users.view']), listUsers);
router.post('/users', requireAnyPerm(['system.users.manage', 'users.create']), createUser);
router.put('/users/:id', requireAnyPerm(['system.users.manage', 'users.update']), updateUser);
router.delete('/users/:id', requireAnyPerm(['system.users.manage', 'users.delete']), deleteUser);

router.get('/roles', requireAnyPerm(['system.roles.manage', 'roles.view']), listRoles);
router.post('/roles', requireAnyPerm(['system.roles.manage', 'roles.create']), createRole);
router.put('/roles/:id', requireAnyPerm(['system.roles.manage', 'roles.update']), updateRole);
router.delete('/roles/:id', requireAnyPerm(['system.roles.manage', 'roles.delete']), deleteRole);
router.get('/roles/:id/permissions', requireAnyPerm(['system.roles.manage', 'roles.view']), getRolePermissions);
router.put('/roles/:id/permissions', requireAnyPerm(['system.roles.manage', 'roles.update']), updateRolePermissions);

router.get('/permissions', requireAnyPerm(['system.permissions.manage', 'permissions.view']), listPermissions);
router.post('/permissions', requireAnyPerm(['system.permissions.manage', 'permissions.create']), createPermission);
router.put('/permissions/:id', requireAnyPerm(['system.permissions.manage', 'permissions.update']), updatePermission);
router.delete('/permissions/:id', requireAnyPerm(['system.permissions.manage', 'permissions.delete']), deletePermission);

router.get('/logs', requireAnyPerm(['system.audit.view', 'audit_logs.view', 'system.settings']), listLogs);
router.delete('/logs/:id', requireAnyPerm(['system.audit.view', 'audit_logs.delete', 'system.settings']), deleteLog);
router.delete('/logs', requireAnyPerm(['system.audit.view', 'audit_logs.delete', 'system.settings']), clearLogs);

export default router;
