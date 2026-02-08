import { Response } from 'express';
import { systemService } from './system.service';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import {
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
  updateUserAccessSchema,
  updateUserPermissionsSchema,
  updateUserOverridesSchema,
} from './system.schemas';

export class SystemController {
  // Permissions
  getPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    const permissions = await systemService.getPermissions();
    return ApiResponse.success(res, permissions);
  });

  // Roles
  getRoles = asyncHandler(async (req: AuthRequest, res: Response) => {
    const roles = await systemService.getRoles();
    return ApiResponse.success(res, roles);
  });

  createRole = asyncHandler(async (req: AuthRequest, res: Response) => {
    const input = createRoleSchema.parse(req.body);
    const role = await systemService.createRole(input, req.user!.userId);
    return ApiResponse.created(res, role, 'Role created successfully');
  });

  updateRole = asyncHandler(async (req: AuthRequest, res: Response) => {
    const roleId = parseInt(req.params.id, 10);
    const input = updateRoleSchema.parse(req.body);
    const role = await systemService.updateRole(roleId, input, req.user!.userId);
    return ApiResponse.success(res, role, 'Role updated successfully');
  });

  getRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    const roleId = parseInt(req.params.id, 10);
    const permissions = await systemService.getRolePermissions(roleId);
    return ApiResponse.success(res, permissions);
  });

  updateRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    const roleId = parseInt(req.params.id, 10);
    const input = updateRolePermissionsSchema.parse(req.body);
    await systemService.updateRolePermissions(roleId, input, req.user!.userId);
    return ApiResponse.success(res, null, 'Role permissions updated successfully');
  });

  // Users
  getUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
    const users = await systemService.getUsers();
    return ApiResponse.success(res, users);
  });

  updateUserAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const input = updateUserAccessSchema.parse(req.body);
    await systemService.updateUserAccess(userId, input, req.user!.userId);
    return ApiResponse.success(res, null, 'User access updated successfully');
  });

  getUserPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const permissions = await systemService.getUserPermissions(userId);
    return ApiResponse.success(res, permissions);
  });

  updateUserPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const input = updateUserPermissionsSchema.parse(req.body);
    await systemService.updateUserPermissions(userId, input, req.user!.userId);
    return ApiResponse.success(res, null, 'User permissions updated successfully');
  });

  getUserOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const overrides = await systemService.getUserOverrides(userId);
    return ApiResponse.success(res, overrides);
  });

  updateUserOverrides = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const input = updateUserOverridesSchema.parse(req.body);
    await systemService.updateUserOverrides(userId, input, req.user!.userId);
    return ApiResponse.success(res, null, 'User overrides updated successfully');
  });

  getUserAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const logs = await systemService.getUserAuditLogs(userId, limit);
    return ApiResponse.success(res, logs);
  });
}

export const systemController = new SystemController();
