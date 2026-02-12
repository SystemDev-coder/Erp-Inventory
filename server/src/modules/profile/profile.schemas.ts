import { z } from 'zod';

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(1).max(80).optional(),
  phone: z.string().min(4).max(40).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6).max(100),
});

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
