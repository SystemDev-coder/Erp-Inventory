import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { schedulesService } from './schedules.service';
import { scheduleSchema, scheduleUpdateSchema, scheduleStatusSchema } from './schedules.schemas';
import { logAudit } from '../../services/audit.service';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listSchedules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { empId, status } = req.query;
  const schedules = await schedulesService.list({
    empId: empId ? Number(empId) : undefined,
    status: status as string,
    branchIds: req.userBranches,
  });
  return ApiResponse.success(res, { schedules });
});

export const getSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const schedule = await schedulesService.getById(Number(req.params.id));
  if (!schedule) {
    return ApiResponse.notFound(res, 'Schedule not found');
  }
  return ApiResponse.success(res, { schedule });
});

export const createSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = scheduleSchema.parse(req.body);
  const schedule = await schedulesService.create(input);
  
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'employee_schedule',
    entityId: schedule.schedule_id,
    newValue: schedule,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.created(res, { schedule }, 'Schedule created successfully');
});

export const updateSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = scheduleUpdateSchema.parse(req.body);
  const schedule = await schedulesService.update(Number(req.params.id), input);
  
  if (!schedule) {
    return ApiResponse.notFound(res, 'Schedule not found');
  }

  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'employee_schedule',
    entityId: schedule.schedule_id,
    newValue: schedule,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, { schedule }, 'Schedule updated successfully');
});

export const updateScheduleStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = scheduleStatusSchema.parse(req.body);
  const schedule = await schedulesService.updateStatus(
    Number(req.params.id),
    status,
    req.user?.userId
  );

  if (!schedule) {
    return ApiResponse.notFound(res, 'Schedule not found');
  }

  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'employee_schedule',
    entityId: schedule.schedule_id,
    newValue: { status, approved_by: req.user?.userId },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, { schedule }, `Schedule ${status} successfully`);
});

export const deleteSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const deleted = await schedulesService.delete(Number(req.params.id));
  
  if (!deleted) {
    return ApiResponse.notFound(res, 'Schedule not found');
  }

  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'employee_schedule',
    entityId: Number(req.params.id),
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, null, 'Schedule deleted successfully');
});

export const getUpcomingSchedules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { empId, days } = req.query;
  const schedules = await schedulesService.getUpcoming(
    empId ? Number(empId) : undefined,
    days ? Number(days) : 30
  );
  return ApiResponse.success(res, { schedules });
});
