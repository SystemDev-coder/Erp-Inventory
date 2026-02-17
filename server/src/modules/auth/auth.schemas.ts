import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(80)
    .optional(),
  phone: z
    .string()
    .min(1)
    .optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  branch_id: z.coerce.number().int().positive().optional(),
  role_id: z.coerce.number().int().positive().optional(),
}).refine((data) => data.username || data.phone, {
  message: 'Either username or phone must be provided',
  path: ['username'],
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Username or phone is required'),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().min(1, 'Username or phone is required'),
  code: z.string().length(6, 'Reset code must be 6 digits').regex(/^\d+$/, 'Reset code must be numeric'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
