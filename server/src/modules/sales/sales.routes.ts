import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { listSales, getSale, listSaleItems, createSale } from './sales.controller';

const router = Router();

router.use(requireAuth);

// List sales
router.get('/', requirePerm('sales.view'), listSales);

// Get single sale with items
router.get('/:id', requirePerm('sales.view'), getSale);

// List items for a sale (explicit endpoint if needed)
router.get('/:id/items', requirePerm('sales.view'), listSaleItems);

// Create sale
router.post('/', requirePerm('sales.create'), createSale);

export default router;

