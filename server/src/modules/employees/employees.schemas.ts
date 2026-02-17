import { z } from 'zod';

export const employeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  role_id: z.coerce.number().optional().nullable(),
  salary: z.coerce.number().min(0, 'Salary must be positive').optional(),
  hire_date: z.string().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  user_id: z.coerce.number().optional().nullable(),
});

export const employeeUpdateSchema = employeeSchema.partial();

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
