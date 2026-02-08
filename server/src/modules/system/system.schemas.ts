import { z } from 'zod';

export const createRoleSchema = z.object({
  role_name: z.string().min(2).max(50),
});

export const updateRoleSchema = z.object({
  role_name: z.string().min(2).max(50),
});

export const updateRolePermissionsSchema = z.object({
  perm_keys: z.array(z.string()),
});

export const updateUserAccessSchema = z.object({
  role_id: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

export const updateUserPermissionsSchema = z.object({
  perm_keys: z.array(z.string()),
});

export const updateUserOverridesSchema = z.object({
  overrides: z.array(z.object({
    perm_key: z.string(),
    effect: z.enum(['allow', 'deny']),
  })),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type UpdateUserAccessInput = z.infer<typeof updateUserAccessSchema>;
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
export type UpdateUserOverridesInput = z.infer<typeof updateUserOverridesSchema>;
