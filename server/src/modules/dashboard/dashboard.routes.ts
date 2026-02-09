import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';

const router = Router();

router.use(requireAuth);

router.get('/dashboard', requirePerm('home.view'), dashboardController.getDashboard);

export default router;
