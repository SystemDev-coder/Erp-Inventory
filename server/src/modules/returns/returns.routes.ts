import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import {
    listReturnItems,
    listSalesReturns,
    createSalesReturn,
    updateSalesReturn,
    deleteSalesReturn,
    listPurchaseReturns,
    createPurchaseReturn,
    updatePurchaseReturn,
    deletePurchaseReturn,
} from './returns.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(requireAuth);

router.get(
    '/items',
    requireAnyPerm(['returns.view', 'sales_returns.view', 'purchase_returns.view']),
    asyncHandler(listReturnItems)
);

router.get(
    '/sales',
    requireAnyPerm(['returns.view', 'sales_returns.view']),
    asyncHandler(listSalesReturns)
);
router.post(
    '/sales',
    requireAnyPerm(['returns.create', 'sales_returns.create']),
    asyncHandler(createSalesReturn)
);
router.put(
    '/sales/:id',
    requireAnyPerm(['returns.update', 'sales_returns.update', 'returns.create']),
    asyncHandler(updateSalesReturn)
);
router.delete(
    '/sales/:id',
    requireAnyPerm(['returns.delete', 'sales_returns.delete', 'returns.create']),
    asyncHandler(deleteSalesReturn)
);
router.get(
    '/purchases',
    requireAnyPerm(['returns.view', 'purchase_returns.view']),
    asyncHandler(listPurchaseReturns)
);
router.post(
    '/purchases',
    requireAnyPerm(['returns.create', 'purchase_returns.create']),
    asyncHandler(createPurchaseReturn)
);
router.put(
    '/purchases/:id',
    requireAnyPerm(['returns.update', 'purchase_returns.update', 'returns.create']),
    asyncHandler(updatePurchaseReturn)
);
router.delete(
    '/purchases/:id',
    requireAnyPerm(['returns.delete', 'purchase_returns.delete', 'returns.create']),
    asyncHandler(deletePurchaseReturn)
);

export default router;
