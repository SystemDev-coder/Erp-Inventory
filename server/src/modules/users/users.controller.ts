import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { usersService } from './users.service';
import { userCreateSchema, userUpdateSchema } from './users.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { logAudit } from '../../utils/audit';

export const listUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users = await usersService.list();
  return ApiResponse.success(res, { users });
});

export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const roles = await usersService.listRoles();
  return ApiResponse.success(res, { roles });
});

export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = userCreateSchema.parse(req.body);
  const user = await usersService.create(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'users',
    entityId: user.user_id,
    newValue: { username: user.username, role_id: user.role_id, branch_id: user.branch_id },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { user }, 'User created');
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = userUpdateSchema.parse(req.body);
  const before = await usersService.get(id);
  const user = await usersService.update(id, input);
  if (!user) throw ApiError.notFound('User not found');
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'users',
    entityId: id,
    oldValue: before,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { user }, 'User updated');
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const before = await usersService.get(id);
  await usersService.remove(id);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'users',
    entityId: id,
    oldValue: before,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'User deleted');
});
