import { Response } from 'express';
import { AuthRequest } from '../../middlewares/requireAuth';
import {
    returnsService,
    CreateSalesReturnInput,
    CreatePurchaseReturnInput,
    UpdateSalesReturnInput,
    UpdatePurchaseReturnInput,
} from './returns.service';
import { resolveBranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';

// GET /api/returns/sales
export const listSalesReturns = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const fromDate = (req.query.fromDate as string) || undefined;
    const toDate = (req.query.toDate as string) || undefined;
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
        throw ApiError.badRequest('Both fromDate and toDate are required together');
    }
    if (fromDate && toDate && fromDate > toDate) {
        throw ApiError.badRequest('fromDate cannot be after toDate');
    }
    const rows = await returnsService.listSalesReturns(scope, { fromDate, toDate });
    res.json({ success: true, data: { rows } });
};

export const getSalesReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const row = await returnsService.getSalesReturn(scope, Number(req.params.id));
    if (!row) throw ApiError.notFound('Sales return not found');
    res.json({ success: true, data: { return: row } });
};

export const listSalesReturnItems = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const items = await returnsService.listSalesReturnItems(scope, Number(req.params.id));
    res.json({ success: true, data: { items } });
};

export const listReturnItems = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const items = await returnsService.listReturnItems(scope);
    res.json({ success: true, data: { items } });
};

export const listSalesItemsByCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const customerId = Number(req.query.customerId);
    const items = await returnsService.listSalesItemsByCustomer(scope, customerId);
    res.json({ success: true, data: { items } });
};

export const listPurchaseItemsBySupplier = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const supplierId = Number(req.query.supplierId);
    const items = await returnsService.listPurchaseItemsBySupplier(scope, supplierId);
    res.json({ success: true, data: { items } });
};

// POST /api/returns/sales
export const createSalesReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const branchId = scope.primaryBranchId;
    const userId = Number(req.user!.userId);
    const input = req.body as CreateSalesReturnInput;

    const result = await returnsService.createSalesReturn(input, { branchId, userId });
    res.status(201).json({ success: true, data: { return: result } });
};

export const updateSalesReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const userId = Number(req.user!.userId);
    const input = req.body as UpdateSalesReturnInput;
    const result = await returnsService.updateSalesReturn(Number(req.params.id), input, scope, { userId });
    res.json({ success: true, data: { return: result } });
};

export const deleteSalesReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    await returnsService.deleteSalesReturn(Number(req.params.id), scope);
    res.json({ success: true, message: 'Sales return deleted' });
};

// GET /api/returns/purchases
export const listPurchaseReturns = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const fromDate = (req.query.fromDate as string) || undefined;
    const toDate = (req.query.toDate as string) || undefined;
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
        throw ApiError.badRequest('Both fromDate and toDate are required together');
    }
    if (fromDate && toDate && fromDate > toDate) {
        throw ApiError.badRequest('fromDate cannot be after toDate');
    }
    const rows = await returnsService.listPurchaseReturns(scope, { fromDate, toDate });
    res.json({ success: true, data: { rows } });
};

export const getPurchaseReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const row = await returnsService.getPurchaseReturn(scope, Number(req.params.id));
    if (!row) throw ApiError.notFound('Purchase return not found');
    res.json({ success: true, data: { return: row } });
};

export const listPurchaseReturnItems = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const items = await returnsService.listPurchaseReturnItems(scope, Number(req.params.id));
    res.json({ success: true, data: { items } });
};

// POST /api/returns/purchases
export const createPurchaseReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const branchId = scope.primaryBranchId;
    const userId = Number(req.user!.userId);
    const input = req.body as CreatePurchaseReturnInput;

    const result = await returnsService.createPurchaseReturn(input, { branchId, userId });
    res.status(201).json({ success: true, data: { return: result } });
};

export const updatePurchaseReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    const userId = Number(req.user!.userId);
    const input = req.body as UpdatePurchaseReturnInput;
    const result = await returnsService.updatePurchaseReturn(Number(req.params.id), input, scope, { userId });
    res.json({ success: true, data: { return: result } });
};

export const deletePurchaseReturn = async (req: AuthRequest, res: Response): Promise<void> => {
    const scope = await resolveBranchScope(req);
    await returnsService.deletePurchaseReturn(Number(req.params.id), scope);
    res.json({ success: true, message: 'Purchase return deleted' });
};
