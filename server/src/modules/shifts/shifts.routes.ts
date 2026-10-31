import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm, requirePerm } from '../../middlewares/requirePerm';
import { closeShift, listShifts, openShift, voidShift } from './shifts.controller';

const router = Router();

router.use(requireAuth);

// Also used as the POS Register: opening/closing a shift while checking out
// sales is exactly opening/closing a cash drawer. Read-only employee/sales
// access can list shifts, but mutating a drawer requires the matching POS key.
router.get('/', requireAnyPerm(['employees.view', 'sales.view', 'sales.pos.access']), listShifts);
router.post('/', requirePerm('sales.pos.access'), openShift);
router.patch('/:id/close', requirePerm('sales.pos.close'), closeShift);
router.patch('/:id/void', requirePerm('sales.pos.close'), voidShift);

export default router;

