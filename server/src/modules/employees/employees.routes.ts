import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { loadUserBranches } from '../../middleware/branchAccess.middleware';
import { requireAnyPerm, requirePerm } from '../../middlewares/requirePerm';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
  updateGenericState,
  listShiftAssignments,
  createShiftAssignment,
  updateShiftAssignment,
  deleteShiftAssignment,
  listEmployeeRoles,
} from './employees.controller';

const router = Router();

// Apply authentication and branch context
router.use(requireAuth);
router.use(loadUserBranches); // Automatically sets database context

// Routes
router.get('/stats', requirePerm('employees.view'), getEmployeeStats);
router.get('/roles', requirePerm('employees.view'), listEmployeeRoles);
router.patch('/state', requireAnyPerm(['employees.update', 'customers.update', 'items.update']), updateGenericState);

router.get('/shift-assignments', requirePerm('employees.view'), listShiftAssignments);
router.post('/shift-assignments', requirePerm('employees.update'), createShiftAssignment);
router.put('/shift-assignments/:id', requirePerm('employees.update'), updateShiftAssignment);
router.delete('/shift-assignments/:id', requirePerm('employees.delete'), deleteShiftAssignment);

router.get('/', requirePerm('employees.view'), listEmployees);
router.get('/:id', requirePerm('employees.view'), getEmployee);
router.post('/', requirePerm('employees.create'), createEmployee);
router.put('/:id', requirePerm('employees.update'), updateEmployee);
router.delete('/:id', requirePerm('employees.delete'), deleteEmployee);

export default router;
