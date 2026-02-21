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
  expId: z.coerce.number().int().positive(),
  periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  fixedAmount: z.coerce.number().positive(),
  note: z.string().optional().or(z.literal('')),
});

export const expenseChargeSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  expId: z.coerce.number().int().positive(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  expDate: z.string().optional(),
  note: z.string().optional().or(z.literal('')),
  expBudgetId: z.coerce.number().int().positive().optional(),
});

export const expenseBudgetChargeSchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  accId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().optional(),
  payDate: z.string().optional(),
  note: z.string().optional().or(z.literal('')),
});

export type AccountTransferInput = z.infer<typeof accountTransferSchema>;
export type AccountTransferUpdateInput = z.infer<typeof accountTransferUpdateSchema>;
export type CustomerReceiptInput = z.infer<typeof customerReceiptSchema>;
export type SupplierReceiptInput = z.infer<typeof supplierReceiptSchema>;
export type ExpenseChargeInput = z.infer<typeof expenseChargeSchema>;
export type ExpenseBudgetInput = z.infer<typeof expenseBudgetSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseBudgetChargeInput = z.infer<typeof expenseBudgetChargeSchema>;
