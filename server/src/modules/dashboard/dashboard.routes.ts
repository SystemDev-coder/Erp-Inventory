import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';

const router = Router();

router.use(requireAuth);

router.get('/dashboard', requireAnyPerm(['dashboard.view', 'home.view']), dashboardController.getDashboard);

export default router;
