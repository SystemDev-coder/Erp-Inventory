import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { systemService } from './system.service';
import { AuthRequest } from '../../middlewares/requireAuth';
import { deleteCloudinaryImage } from '../../config/cloudinary';
import {
  createPermissionSchema,
  createRoleSchema,
  createUserSchema,
  listLogsQuerySchema,
  updatePermissionSchema,
  updateRolePermissionsSchema,
  updateRoleSchema,
  updateUserSchema,
} from './system.schemas';
import { logAudit } from '../../utils/audit';

const parseId = (value: string, label: string): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`${label} is invalid`);
  }
  return id;
};

// Get system information
export const getSystemInfo = asyncHandler(async (_req: AuthRequest, res: Response) => {
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
export const deleteLogo = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const existing = await systemService.getSystemInfo();
  
  if (existing?.logo_url) {
    await deleteCloudinaryImage(existing.logo_url);
    await systemService.updateSystemInfo({ logoUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Logo deleted successfully');
});

// Delete banner
export const deleteBanner = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const existing = await systemService.getSystemInfo();
  
  if (existing?.banner_image_url) {
    await deleteCloudinaryImage(existing.banner_image_url);
    await systemService.updateSystemInfo({ bannerImageUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Banner deleted successfully');
});

export const listBranches = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const branches = await systemService.listBranches();
  return ApiResponse.success(res, { branches });
});

export const listUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users = await systemService.listUsers();
  return ApiResponse.success(res, { users });
});

export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = createUserSchema.parse(req.body);
  const user = await systemService.createUser(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'users',
    entityId: user.user_id,
    newValue: {
      username: user.username,
      role_id: user.role_id,
      branch_id: user.branch_id,
      is_active: user.is_active,
    },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { user }, 'User created');
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = parseId(req.params.id, 'User ID');
  const input = updateUserSchema.parse(req.body);
  const before = await systemService.getUser(userId);
  const user = await systemService.updateUser(userId, input);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'users',
    entityId: userId,
    oldValue: before,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { user }, 'User updated');
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = parseId(req.params.id, 'User ID');
  const before = await systemService.getUser(userId);
  await systemService.deleteUser(userId);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'users',
    entityId: userId,
    oldValue: before,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'User deleted');
});

export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const roles = await systemService.listRoles();
  return ApiResponse.success(res, { roles });
});

export const createRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = createRoleSchema.parse(req.body);
  const role = await systemService.createRole(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'roles',
    entityId: role.role_id,
    newValue: role,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { role }, 'Role created');
});

export const updateRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = parseId(req.params.id, 'Role ID');
  const input = updateRoleSchema.parse(req.body);
  const before = (await systemService.listRoles()).find((role) => role.role_id === roleId) || null;
  const role = await systemService.updateRole(roleId, input);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'roles',
    entityId: roleId,
    oldValue: before,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { role }, 'Role updated');
});

export const deleteRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = parseId(req.params.id, 'Role ID');
  const before = (await systemService.listRoles()).find((role) => role.role_id === roleId) || null;
  await systemService.deleteRole(roleId);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'roles',
    entityId: roleId,
    oldValue: before,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Role deleted');
});

export const getRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = parseId(req.params.id, 'Role ID');
  const permissions = await systemService.listRolePermissions(roleId);
  return ApiResponse.success(res, { permissions });
});

export const updateRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = parseId(req.params.id, 'Role ID');
  const input = updateRolePermissionsSchema.parse(req.body);
  await systemService.replaceRolePermissions(roleId, input.permIds);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'role_permissions',
    entityId: roleId,
    newValue: { perm_ids: input.permIds },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Role permissions updated');
});

export const listPermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const permissions = await systemService.listPermissions();
  return ApiResponse.success(res, { permissions });
});

export const createPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = createPermissionSchema.parse(req.body);
  const permission = await systemService.createPermission(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'permissions',
    entityId: permission.perm_id,
    newValue: permission,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { permission }, 'Permission created');
});

export const updatePermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissionId = parseId(req.params.id, 'Permission ID');
  const input = updatePermissionSchema.parse(req.body);
  const before = (await systemService.listPermissions()).find((p) => p.perm_id === permissionId) || null;
  const permission = await systemService.updatePermission(permissionId, input);
  if (!permission) {
    throw ApiError.notFound('Permission not found');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'permissions',
    entityId: permissionId,
    oldValue: before,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { permission }, 'Permission updated');
});

export const deletePermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissionId = parseId(req.params.id, 'Permission ID');
  const before = (await systemService.listPermissions()).find((p) => p.perm_id === permissionId) || null;
  await systemService.deletePermission(permissionId);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'permissions',
    entityId: permissionId,
    oldValue: before,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Permission deleted');
});

export const listLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit } = listLogsQuerySchema.parse(req.query);
  const { rows, total } = await systemService.listLogs(page, limit);
  return ApiResponse.success(res, { logs: rows, total, page, limit });
});

export const deleteLog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const logId = parseId(req.params.id, 'Log ID');
  const deleted = await systemService.deleteLog(logId);
  if (!deleted) {
    throw ApiError.notFound('Log not found');
  }
  return ApiResponse.success(res, null, 'Log deleted');
});

export const clearLogs = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const deleted = await systemService.clearLogs();
  return ApiResponse.success(res, { deleted }, 'Logs cleared');
});
