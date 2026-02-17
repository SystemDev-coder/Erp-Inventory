import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import { closeShift, listShifts, openShift, voidShift } from './shifts.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requireAnyPerm(['employees.view', 'sales.view']), listShifts);
router.post('/', requireAnyPerm(['employees.view', 'sales.view']), openShift);
router.patch('/:id/close', requireAnyPerm(['employees.view', 'sales.view']), closeShift);
router.patch('/:id/void', requireAnyPerm(['employees.view', 'sales.view']), voidShift);

export default router;

