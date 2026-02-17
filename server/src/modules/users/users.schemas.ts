import { z } from 'zod';

export const userCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  name: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(6),
  isActive: z.boolean().optional().default(true),
});

export const userUpdateSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  roleId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
});

export const userGenerateFromEmployeeSchema = z.object({
  empId: z.coerce
    .number()
    .int('Employee ID must be a valid number')
    .positive('Employee ID must be positive')
    .refine((n) => !Number.isNaN(n), { message: 'Employee ID must be a valid number' }),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserGenerateFromEmployeeInput = z.infer<typeof userGenerateFromEmployeeSchema>;
