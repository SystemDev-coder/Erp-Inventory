import { z } from 'zod';

export const updateUserPermissionOverridesSchema = z.object({
  overrides: z.array(
    z.object({
      permId: z.coerce.number().int().positive(),
      effect: z.enum(['allow', 'deny']),
    })
  ),
});

export type UpdateUserPermissionOverridesInput = z.infer<typeof updateUserPermissionOverridesSchema>;

