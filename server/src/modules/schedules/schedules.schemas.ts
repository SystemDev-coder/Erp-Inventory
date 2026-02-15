import { z } from 'zod';

export const scheduleSchema = z.object({
  emp_id: z.coerce.number().int().positive(),
  schedule_type: z.enum(['sick_leave', 'vacation', 'personal', 'unpaid', 'other']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const scheduleUpdateSchema = scheduleSchema.partial().omit({ emp_id: true });

export const scheduleStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
});

export type ScheduleSchemaType = z.infer<typeof scheduleSchema>;
export type ScheduleUpdateSchemaType = z.infer<typeof scheduleUpdateSchema>;
export type ScheduleStatusSchemaType = z.infer<typeof scheduleStatusSchema>;
