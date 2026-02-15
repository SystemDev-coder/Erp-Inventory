import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { loadUserBranches } from '../../middleware/branchAccess.middleware';
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

// All routes require authentication and branch loading
router.use(requireAuth, loadUserBranches);

// Schedule routes
router.get('/', listSchedules);
router.get('/upcoming', getUpcomingSchedules);
router.get('/:id', getSchedule);
router.post('/', createSchedule);
router.put('/:id', updateSchedule);
router.patch('/:id/status', updateScheduleStatus);
router.delete('/:id', deleteSchedule);

export default router;
