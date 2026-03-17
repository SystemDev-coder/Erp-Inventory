import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const closingPeriodCreateSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    closeMode: z.enum(['monthly', 'quarterly', 'yearly', 'custom']),
    periodFrom: isoDate,
    periodTo: isoDate,
    operationalFrom: isoDate.optional(),
    operationalTo: isoDate.optional(),
    scheduledAt: z.string().datetime().optional(),
    note: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.periodFrom > value.periodTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodTo'],
        message: 'Period end date must be after start date',
      });
    }
    if ((value.operationalFrom && !value.operationalTo) || (!value.operationalFrom && value.operationalTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationalFrom'],
        message: 'Operational period requires both start and end dates',
      });
    }
    if (value.operationalFrom && value.operationalTo && value.operationalFrom > value.operationalTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationalTo'],
        message: 'Operational end date must be after start date',
      });
    }
  });

export const closingPeriodUpdateSchema = z
  .object({
    closeMode: z.enum(['monthly', 'quarterly', 'yearly', 'custom']).optional(),
    periodFrom: isoDate.optional(),
    periodTo: isoDate.optional(),
    operationalFrom: isoDate.optional().or(z.literal('')),
    operationalTo: isoDate.optional().or(z.literal('')),
    scheduledAt: z.string().datetime().optional().or(z.literal('')),
    note: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if ((value.periodFrom && !value.periodTo) || (!value.periodFrom && value.periodTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodFrom'],
        message: 'Both period start and end dates are required',
      });
    }
    if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodTo'],
        message: 'Period end date must be after start date',
      });
    }
    if ((value.operationalFrom && !value.operationalTo) || (!value.operationalFrom && value.operationalTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationalFrom'],
        message: 'Operational period requires both start and end dates',
      });
    }
    if (value.operationalFrom && value.operationalTo && value.operationalFrom > value.operationalTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operationalTo'],
        message: 'Operational end date must be after start date',
      });
    }
  });

export const closingPeriodsQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'closed', 'reopened']).optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
});

export const profitSharePartnerSchema = z.object({
  partnerName: z.string().trim().min(1).max(120),
  sharePct: z.coerce.number().min(0).max(100),
  accId: z.coerce.number().int().positive().optional(),
});

const profitShareRuleBaseSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  ruleName: z.string().trim().min(1).max(120),
  sourceAccId: z.coerce.number().int().positive().optional(),
  retainedPct: z.coerce.number().min(0).max(100).default(0),
  retainedAccId: z.coerce.number().int().positive().optional(),
  reinvestmentPct: z.coerce.number().min(0).max(100).default(0),
  reinvestmentAccId: z.coerce.number().int().positive().optional(),
  reservePct: z.coerce.number().min(0).max(100).default(0),
  reserveAccId: z.coerce.number().int().positive().optional(),
  partners: z.array(profitSharePartnerSchema).default([]),
  isDefault: z.boolean().optional().default(false),
});

const validateProfitRule = (
  value: z.infer<typeof profitShareRuleBaseSchema>,
  ctx: z.RefinementCtx
) => {
    const partnerPct = value.partners.reduce(
      (sum: number, partner: z.infer<typeof profitSharePartnerSchema>) => sum + Number(partner.sharePct || 0),
      0
    );
    const reserved =
      Number(value.retainedPct || 0) + Number(value.reinvestmentPct || 0) + Number(value.reservePct || 0);

    if (reserved > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retainedPct'],
        message: 'Retained, reinvestment and reserve percentages cannot exceed 100%',
      });
    }

    if (partnerPct > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partners'],
        message: 'Partner share percentages cannot exceed 100%',
      });
    }
  };

export const profitShareRuleSchema = profitShareRuleBaseSchema.superRefine(validateProfitRule);
export const profitShareRuleUpsertSchema = profitShareRuleBaseSchema
  .extend({
    ruleId: z.coerce.number().int().positive().optional(),
  })
  .superRefine(validateProfitRule);

export const closingActionSchema = z.object({
  ruleId: z.coerce.number().int().positive().optional(),
  rule: profitShareRuleSchema.optional(),
  autoTransfer: z.boolean().optional().default(true),
  saveRuleAsDefault: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const closingReopenSchema = z.object({
  reason: z.string().trim().max(250).optional().or(z.literal('')),
  reverseClosingEntries: z.boolean().optional().default(false),
});

export const profitDistributionSchema = z.object({});

export type ClosingPeriodCreateInput = z.infer<typeof closingPeriodCreateSchema>;
export type ClosingPeriodUpdateInput = z.infer<typeof closingPeriodUpdateSchema>;
export type ClosingPeriodsQueryInput = z.infer<typeof closingPeriodsQuerySchema>;
export type ProfitShareRuleInput = z.infer<typeof profitShareRuleSchema>;
export type ProfitShareRuleUpsertInput = z.infer<typeof profitShareRuleUpsertSchema>;
export type ClosingActionInput = z.infer<typeof closingActionSchema>;
export type ClosingReopenInput = z.infer<typeof closingReopenSchema>;
export type ProfitDistributionInput = z.infer<typeof profitDistributionSchema>;
