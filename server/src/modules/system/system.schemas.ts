import { z } from 'zod';

export const createRoleSchema = z.object({
  roleName: z.string().trim().min(2).max(60),
  roleCode: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(255).optional(),
});

export const updateRoleSchema = z.object({
  roleName: z.string().trim().min(2).max(60).optional(),
  roleCode: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(255).optional(),
}).refine(
  (value) => value.roleName !== undefined || value.roleCode !== undefined || value.description !== undefined,
  { message: 'Provide at least one field to update' }
);

export const updateRolePermissionsSchema = z.object({
  permIds: z.array(z.coerce.number().int().positive()),
});

export const createPermissionSchema = z.object({
  permKey: z.string().trim().min(3).max(100).regex(/^[a-z0-9._:-]+$/i, 'Invalid permission key'),
  permName: z.string().trim().min(2).max(150),
  module: z.string().trim().min(2).max(50),
  subModule: z.string().trim().max(50).optional(),
  actionType: z.string().trim().max(50).optional(),
  description: z.string().trim().max(255).optional(),
});

export const updatePermissionSchema = z.object({
  permKey: z.string().trim().min(3).max(100).regex(/^[a-z0-9._:-]+$/i, 'Invalid permission key').optional(),
  permName: z.string().trim().min(2).max(150).optional(),
  module: z.string().trim().min(2).max(50).optional(),
  subModule: z.string().trim().max(50).optional(),
  actionType: z.string().trim().max(50).optional(),
  description: z.string().trim().max(255).optional(),
}).refine(
  (value) =>
    value.permKey !== undefined ||
    value.permName !== undefined ||
    value.module !== undefined ||
    value.subModule !== undefined ||
    value.actionType !== undefined ||
    value.description !== undefined,
  { message: 'Provide at least one field to update' }
);

export const createUserSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(3).max(80),
  password: z.string().min(6).max(120),
  isActive: z.boolean().optional().default(true),
});

export const updateUserSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  roleId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  username: z.string().trim().min(3).max(80).optional(),
  password: z.string().min(6).max(120).optional(),
  isActive: z.boolean().optional(),
}).refine(
  (value) =>
    value.branchId !== undefined ||
    value.roleId !== undefined ||
    value.name !== undefined ||
    value.username !== undefined ||
    value.password !== undefined ||
    value.isActive !== undefined,
  { message: 'Provide at least one field to update' }
);

export const listLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
