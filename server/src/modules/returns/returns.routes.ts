import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import {
    listReturnItems,
    listSalesItemsByCustomer,
    listPurchaseItemsBySupplier,
    listSalesReturns,
    getSalesReturn,
    listSalesReturnItems,
    createSalesReturn,
    updateSalesReturn,
    deleteSalesReturn,
    listPurchaseReturns,
    getPurchaseReturn,
    listPurchaseReturnItems,
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
    '/sales/customer-items',
    requireAnyPerm(['returns.view', 'sales_returns.view']),
    asyncHandler(listSalesItemsByCustomer)
);
router.get(
    '/purchases/supplier-items',
    requireAnyPerm(['returns.view', 'purchase_returns.view']),
    asyncHandler(listPurchaseItemsBySupplier)
);

router.get(
    '/sales',
    requireAnyPerm(['returns.view', 'sales_returns.view']),
    asyncHandler(listSalesReturns)
);
router.get(
    '/sales/:id',
    requireAnyPerm(['returns.view', 'sales_returns.view']),
    asyncHandler(getSalesReturn)
);
router.get(
    '/sales/:id/items',
    requireAnyPerm(['returns.view', 'sales_returns.view']),
    asyncHandler(listSalesReturnItems)
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
router.get(
    '/purchases/:id',
    requireAnyPerm(['returns.view', 'purchase_returns.view']),
    asyncHandler(getPurchaseReturn)
);
router.get(
    '/purchases/:id/items',
    requireAnyPerm(['returns.view', 'purchase_returns.view']),
    asyncHandler(listPurchaseReturnItems)
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
