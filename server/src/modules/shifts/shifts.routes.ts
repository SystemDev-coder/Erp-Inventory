import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { closeShift, listShifts, openShift, voidShift } from './shifts.controller';

const router = Router();

router.use(requireAuth);

// Also used as the POS Register: opening/closing a shift while checking out sales is
// exactly opening/closing a cash drawer, so sales.pos.access/close are accepted here
// too (widening access, not replacing the existing Employees > Shifts permissions).
router.get('/', requireAnyPerm(['employees.view', 'sales.view', 'sales.pos.access']), listShifts);
router.post('/', requireAnyPerm(['employees.view', 'sales.view', 'sales.pos.access']), openShift);
router.patch('/:id/close', requireAnyPerm(['employees.view', 'sales.view', 'sales.pos.close']), closeShift);
router.patch('/:id/void', requireAnyPerm(['employees.view', 'sales.view', 'sales.pos.close']), voidShift);

export default router;

