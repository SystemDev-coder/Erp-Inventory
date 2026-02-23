import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import {
  accountTransferSchema,
  customerReceiptSchema,
  supplierReceiptSchema,
  expenseChargeSchema,
  expenseChargeUpdateSchema,
  expenseBudgetSchema,
  expenseBudgetUpdateSchema,
  expenseSchema,
  expenseBudgetChargeSchema,
  expenseBudgetAutoChargeSchema,
  expensePaymentSchema,
  expensePaymentQuerySchema,
  payrollChargeSchema,
  payrollPaySchema,
  payrollDeleteSchema,
} from './finance.schemas';
import { financeService } from './finance.service';
import { asyncHandler as ah } from '../../utils/asyncHandler';

export const listExpenses = ah(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const expenses = await financeService.listExpenses(scope, branchId);
  return ApiResponse.success(res, { expenses });
});

export const createExpense = ah(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expenseSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const expense = await financeService.createExpense(input, scope, userId);
  return ApiResponse.created(res, { expense }, 'Expense created');
});

export const updateExpense = ah(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid expense id');
  const input = expenseSchema.partial().parse(req.body);
  const expense = await financeService.updateExpense(id, input, scope);
  return ApiResponse.success(res, { expense }, 'Expense updated');
});

export const deleteExpense = ah(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid expense id');
  await financeService.deleteExpense(id, scope);
  return ApiResponse.success(res, null, 'Expense deleted');
});

export const listAccountTransfers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const transfers = await financeService.listTransfers(scope, branchId);
  return ApiResponse.success(res, { transfers });
});

export const createAccountTransfer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = accountTransferSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const transfer = await financeService.createTransfer(input, scope, userId);
  return ApiResponse.created(res, { transfer }, 'Transfer created');
});

export const updateAccountTransfer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid transfer id');
  const transfer = await financeService.updateTransfer(id, req.body, scope);
  return ApiResponse.success(res, { transfer }, 'Transfer updated');
});

// ─── Customer Receipts ───────────────────────────────────────────────────────

export const listCustomerReceipts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const receipts = await financeService.listCustomerReceipts(scope, branchId);
  return ApiResponse.success(res, { receipts });
});

export const createCustomerReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = customerReceiptSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const receipt = await financeService.createCustomerReceipt(input, scope, userId);
  return ApiResponse.created(res, { receipt }, 'Customer receipt recorded');
});

export const updateCustomerReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid receipt id');
  const input = customerReceiptSchema.partial().parse(req.body);
  const receipt = await financeService.updateCustomerReceipt(id, input, scope);
  return ApiResponse.success(res, { receipt }, 'Customer receipt updated');
});

export const deleteCustomerReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid receipt id');
  await financeService.deleteCustomerReceipt(id, scope);
  return ApiResponse.success(res, null, 'Customer receipt deleted');
});

// ─── Supplier Receipts ───────────────────────────────────────────────────────

export const listSupplierReceipts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const receipts = await financeService.listSupplierReceipts(scope, branchId);
  return ApiResponse.success(res, { receipts });
});

export const createSupplierReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = supplierReceiptSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const receipt = await financeService.createSupplierReceipt(input, scope, userId);
  return ApiResponse.created(res, { receipt }, 'Supplier receipt recorded');
});

export const updateSupplierReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid receipt id');
  const input = supplierReceiptSchema.partial().parse(req.body);
  const receipt = await financeService.updateSupplierReceipt(id, input, scope);
  return ApiResponse.success(res, { receipt }, 'Supplier receipt updated');
});

export const deleteSupplierReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid receipt id');
  await financeService.deleteSupplierReceipt(id, scope);
  return ApiResponse.success(res, null, 'Supplier receipt deleted');
});

// ─── Outstanding / Unpaid ────────────────────────────────────────────────────

export const listCustomerUnpaid = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const unpaid = await financeService.listCustomerUnpaid(scope, month, branchId);
  return ApiResponse.success(res, { unpaid });
});

export const listSupplierUnpaid = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const unpaid = await financeService.listSupplierUnpaid(scope, month, branchId);
  return ApiResponse.success(res, { unpaid });
});

export const listSupplierOutstandingPurchases = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
  const purchases = await financeService.listSupplierOutstandingPurchases(scope, supplierId);
  return ApiResponse.success(res, { purchases });
});

// ─── Expense Charges ─────────────────────────────────────────────────────────

export const listExpenseCharges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const charges = await financeService.listExpenseCharges(scope, branchId);
  return ApiResponse.success(res, { charges });
});

export const createExpenseCharge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expenseChargeSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const charge = await financeService.createExpenseCharge(input, scope, userId);
  return ApiResponse.created(res, { charge }, 'Expense charge recorded');
});

export const updateExpenseCharge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid charge id');
  const input = expenseChargeUpdateSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const charge = await financeService.updateExpenseCharge(id, input, scope, userId);
  return ApiResponse.success(res, { charge }, 'Expense charge updated');
});

export const deleteExpenseCharge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid charge id');
  await financeService.deleteExpenseCharge(id, scope);
  return ApiResponse.success(res, null, 'Expense charge deleted');
});

// ─── Expense Budgets ──────────────────────────────────────────────────────────

export const listExpenseBudgets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const budgets = await financeService.listExpenseBudgets(scope, branchId);
  return ApiResponse.success(res, { budgets });
});

export const createExpenseBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expenseBudgetSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const budget = await financeService.createExpenseBudget(input, scope, userId);
  return ApiResponse.created(res, { budget }, 'Expense budget created');
});

export const updateExpenseBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid budget id');
  const input = expenseBudgetUpdateSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const budget = await financeService.updateExpenseBudget(id, input, scope, userId);
  return ApiResponse.success(res, { budget }, 'Expense budget updated');
});

export const deleteExpenseBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw ApiError.badRequest('Invalid budget id');
  await financeService.deleteExpenseBudget(id, scope);
  return ApiResponse.success(res, null, 'Expense budget deleted');
});

export const chargeExpenseBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expenseBudgetChargeSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const result = await financeService.chargeExpenseBudget(input, scope, userId);
  return ApiResponse.created(res, { result }, 'Expense budget charged');
});

export const manageExpenseBudgetCharges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expenseBudgetAutoChargeSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const result = await financeService.manageExpenseBudgetCharges(input, scope, userId);
  return ApiResponse.success(res, { result }, 'Expense budgets processed');
});

export const createExpensePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = expensePaymentSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const payment = await financeService.createExpensePayment(input, scope, userId);
  return ApiResponse.created(res, { payment }, 'Expense payment recorded');
});

export const listExpensePayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = expensePaymentQuerySchema.parse(req.query);
  const payments = await financeService.listExpensePayments(scope, query.chargeId, query.expenseId);
  return ApiResponse.success(res, { payments });
});

export const deleteExpensePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.badRequest('Invalid payment id');
  await financeService.deleteExpensePayment(id, scope);
  return ApiResponse.success(res, null, 'Expense payment deleted');
});

// Payroll
export const chargeSalaries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = payrollChargeSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const result = await financeService.chargeSalaries(input, scope, userId);
  return ApiResponse.success(res, { result }, 'Salaries charged');
});

export const listPayroll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const period = req.query.period ? String(req.query.period) : undefined;
  const data = await financeService.listPayroll(scope, period);
  return ApiResponse.success(res, { payroll: data });
});

export const paySalary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = payrollPaySchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const payment = await financeService.paySalary(input, scope, userId);
  return ApiResponse.created(res, { payment }, 'Salary paid');
});

export const deletePayroll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = payrollDeleteSchema.parse(req.body);
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('User required');
  const result = await financeService.deletePayroll(input, scope, userId);
  return ApiResponse.success(res, { result }, 'Salary charge(s) deleted');
});
