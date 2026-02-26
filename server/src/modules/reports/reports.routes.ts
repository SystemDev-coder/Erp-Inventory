import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import salesReportsRoutes from './sales/salesReports.routes';
import inventoryReportsRoutes from './inventory/inventoryReports.routes';
import purchaseReportsRoutes from './purchase/purchaseReports.routes';

const router = Router();

router.use(requireAuth);

router.use('/sales', requireAnyPerm(['reports.all', 'sales.view', 'sales.reports']), salesReportsRoutes);
router.use(
  '/inventory',
  requireAnyPerm(['reports.all', 'inventory.view', 'stock.view', 'items.view', 'inventory.reports']),
  inventoryReportsRoutes
);
router.use(
  '/purchase',
  requireAnyPerm(['reports.all', 'purchases.view', 'suppliers.view', 'purchases.reports']),
  purchaseReportsRoutes
);

export default router;
