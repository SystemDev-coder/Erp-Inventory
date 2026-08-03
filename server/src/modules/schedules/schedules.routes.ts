import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import {
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  updateScheduleStatus,
  deleteSchedule,
  getUpcomingSchedules,
} from './schedules.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Schedule routes
router.get('/', listSchedules);
router.get('/upcoming', getUpcomingSchedules);
router.get('/:id', getSchedule);
router.post('/', createSchedule);
router.put('/:id', updateSchedule);
router.patch('/:id/status', updateScheduleStatus);
router.delete('/:id', deleteSchedule);

export default router;
