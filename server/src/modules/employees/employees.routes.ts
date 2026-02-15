import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { loadUserBranches } from '../../middleware/branchAccess.middleware';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
} from './employees.controller';

const router = Router();

// Apply authentication and branch context
router.use(requireAuth);
router.use(loadUserBranches); // Automatically sets database context

// Routes
router.get('/stats', getEmployeeStats);
router.get('/', listEmployees);
router.get('/:id', getEmployee);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

export default router;
