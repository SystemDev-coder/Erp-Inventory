import { z } from 'zod';

export const employeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  role_id: z.coerce.number().optional().nullable(),
  salary: z.coerce.number().min(0, 'Salary must be positive').optional(),
  salary_type: z.enum(['Hourly', 'Monthly']).optional(),
  shift_type: z.enum(['Morning', 'Night', 'Evening']).optional(),
  hire_date: z.string().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  user_id: z.coerce.number().optional().nullable(),
});

export const employeeUpdateSchema = employeeSchema.partial();

export const stateUpdateSchema = z.object({
  targetType: z.enum(['employee', 'customer', 'item']),
  targetId: z.coerce.number().int().positive(),
  status: z.enum(['active', 'inactive']),
});

export const shiftAssignmentSchema = z.object({
  emp_id: z.coerce.number().int().positive(),
  shift_type: z.enum(['Morning', 'Night', 'Evening']),
  effective_date: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const shiftAssignmentUpdateSchema = shiftAssignmentSchema.partial();

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type StateUpdateInput = z.infer<typeof stateUpdateSchema>;
export type ShiftAssignmentInput = z.infer<typeof shiftAssignmentSchema>;
export type ShiftAssignmentUpdateInput = z.infer<typeof shiftAssignmentUpdateSchema>;
