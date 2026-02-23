import { z } from 'zod';

export const accountTransferSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  fromAccId: z.coerce.number().int().positive(),
  toAccId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  transferDate: z.string().optional(),
  referenceNo: z.string().optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
  postNow: z.boolean().optional().default(true),
});

export const accountTransferUpdateSchema = accountTransferSchema.partial().extend({
  status: z.enum(['draft', 'posted', 'void']).optional(),
});

export const customerReceiptSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  saleId: z.coerce.number().int().positive().optional(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  receiptDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNo: z.string().optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
});

export const supplierReceiptSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  purchaseId: z.coerce.number().int().positive().optional(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  receiptDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNo: z.string().optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
});

export const expenseSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
});

export const expenseBudgetSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  expId: z.coerce.number().int().positive().optional(),
  expTypeId: z.coerce.number().int().positive().optional(), // backward compat
  periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  fixedAmount: z.coerce.number().positive().optional(),
  amountLimit: z.coerce.number().positive().optional(), // backward compat
  note: z.string().optional().or(z.literal('')),
});
export const expenseBudgetUpdateSchema = expenseBudgetSchema.partial();

export const expenseChargeSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  expId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  expDate: z.string().optional(),
  regDate: z.string().optional(),
  note: z.string().optional().or(z.literal('')),
  expBudgetId: z.coerce.number().int().positive().optional(),
});

export const expenseChargeUpdateSchema = expenseChargeSchema.partial();

export const expenseBudgetChargeSchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().optional(),
  payDate: z.string().optional(),
  note: z.string().optional().or(z.literal('')),
});

export const expenseBudgetAutoChargeSchema = z.object({
  regDate: z.string(),
  oper: z.enum(['INSERT', 'UPDATE', 'DELETE', 'SYNC']).optional().default('SYNC'),
  branchId: z.coerce.number().int().positive().optional(),
});

export const expensePaymentSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  expChargeId: z.coerce.number().int().positive(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().optional(),
  payDate: z.string().optional(),
  referenceNo: z.string().optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
});

export const payrollChargeSchema = z.object({
  periodDate: z.string(), // YYYY-MM or full date
});

export const payrollPaySchema = z.object({
  payrollLineId: z.coerce.number().int().positive(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().optional(),
  payDate: z.string().optional(),
  note: z.string().optional().or(z.literal('')),
});

export const payrollDeleteSchema = z.object({
  mode: z.enum(['line', 'period']),
  payrollLineId: z.coerce.number().int().positive().optional(),
  period: z.string().optional(), // YYYY-MM
});

export const expensePaymentQuerySchema = z.object({
  chargeId: z.coerce.number().int().positive().optional(),
  expenseId: z.coerce.number().int().positive().optional(),
});

export type AccountTransferInput = z.infer<typeof accountTransferSchema>;
export type AccountTransferUpdateInput = z.infer<typeof accountTransferUpdateSchema>;
export type CustomerReceiptInput = z.infer<typeof customerReceiptSchema>;
export type SupplierReceiptInput = z.infer<typeof supplierReceiptSchema>;
export type ExpenseChargeInput = z.infer<typeof expenseChargeSchema>;
export type ExpenseBudgetInput = z.infer<typeof expenseBudgetSchema>;
export type ExpenseBudgetUpdateInput = z.infer<typeof expenseBudgetUpdateSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseBudgetChargeInput = z.infer<typeof expenseBudgetChargeSchema>;
export type ExpensePaymentInput = z.infer<typeof expensePaymentSchema>;
export type PayrollChargeInput = z.infer<typeof payrollChargeSchema>;
export type PayrollPayInput = z.infer<typeof payrollPaySchema>;
export type PayrollDeleteInput = z.infer<typeof payrollDeleteSchema>;
