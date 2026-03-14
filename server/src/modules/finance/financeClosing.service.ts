import { PoolClient, QueryResult } from 'pg';
import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { assertBranchAccess, BranchScope, pickBranchForWrite } from '../../utils/branchScope';
import { logAudit } from '../../utils/audit';
import {
  ClosingActionInput,
  ClosingPeriodCreateInput,
  ClosingPeriodUpdateInput,
  ClosingPeriodsQueryInput,
  ClosingReopenInput,
  ProfitShareRuleInput,
  ProfitShareRuleUpsertInput,
} from './financeClosing.schemas';

interface SqlRunner {
  query: (text: string, params?: any[]) => Promise<QueryResult<any>>;
}

interface ClosingSnapshot {
  salesRevenue: number;
  salesReturns: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  expenseCharges: number;
  payrollExpense: number;
  otherIncome: number;
  netIncome: number;
  stockValuation: number;
  cashBalance: number;
  capitalBalance: number;
}

interface RuleRow {
  rule_id: number;
  branch_id: number;
  rule_name: string;
  source_acc_id: number | null;
  retained_pct: string | number;
  retained_acc_id: number | null;
  reinvestment_pct: string | number;
  reinvestment_acc_id: number | null;
  reserve_pct: string | number;
  reserve_acc_id: number | null;
  is_default: boolean;
  is_active: boolean;
}

interface RulePartnerRow {
  partner_id: number;
  rule_id?: number;
  partner_name: string;
  share_pct: string | number;
  acc_id: number | null;
  is_active: boolean;
}

interface ResolvedRule {
  ruleId: number | null;
  branchId: number;
  ruleName: string;
  isDefault?: boolean;
  sourceAccId: number | null;
  retainedPct: number;
  retainedAccId: number | null;
  reinvestmentPct: number;
  reinvestmentAccId: number | null;
  reservePct: number;
  reserveAccId: number | null;
  partners: Array<{
    partnerName: string;
    sharePct: number;
    accId: number | null;
  }>;
}

interface ProfitAllocation {
  allocationType: 'partner' | 'retained' | 'reinvestment' | 'reserve';
  label: string;
  sharePct: number;
  amount: number;
  accId: number | null;
}

interface ClosingPeriodRow {
  closing_id: number;
  branch_id: number;
  close_mode: string;
  period_from: string;
  period_to: string;
  operational_from: string | null;
  operational_to: string | null;
  status: string;
  is_locked: boolean;
  scheduled_at: string | null;
  note: string | null;
  summary_json: any;
  profit_json: any;
  journal_id: number | null;
  closed_at: string | null;
  closed_by: number | null;
  reopened_at: string | null;
  reopened_by: number | null;
  created_at: string;
  updated_at: string;
}

interface CloseResult {
  period: ClosingPeriodRow;
  summary: ClosingSnapshot;
  rule: ResolvedRule;
  allocations: ProfitAllocation[];
  journalId: number | null;
  warnings: string[];
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toMoney = (value: unknown) => roundMoney(Number(value || 0));
const OPENING_EXPENSE_NOTE_PREFIX = '[OPENING BALANCE]';
const openingExpensePredicate = (alias: string) =>
  `COALESCE(NULLIF(to_jsonb(${alias}) ->> 'is_opening_paid', '')::boolean, COALESCE(${alias}.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%')`;

const parseJsonSafe = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const isEmptyObject = (value: unknown) =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;

const queryAmount = async (runner: SqlRunner, sql: string, params: Array<number | string>) => {
  const result = await runner.query(sql, params);
  return toMoney(result.rows[0]?.amount);
};

const nowIso = () => new Date().toISOString();

const toDateOnly = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
};

const ensureRulePercentages = (rule: ResolvedRule) => {
  const fixedPct = rule.retainedPct + rule.reinvestmentPct + rule.reservePct;
  if (fixedPct > 100) {
    throw ApiError.badRequest('Retained, reinvestment and reserve percentages cannot exceed 100%');
  }
};

const buildProfitAllocations = (netIncome: number, rule: ResolvedRule): ProfitAllocation[] => {
  if (netIncome <= 0) return [];

  ensureRulePercentages(rule);

  const retainedAmount = roundMoney((netIncome * rule.retainedPct) / 100);
  const reinvestmentAmount = roundMoney((netIncome * rule.reinvestmentPct) / 100);
  const reserveAmount = roundMoney((netIncome * rule.reservePct) / 100);
  const remainingForPartners = Math.max(roundMoney(netIncome - retainedAmount - reinvestmentAmount - reserveAmount), 0);

  const partnerShareTotal = rule.partners.reduce((sum, partner) => sum + partner.sharePct, 0);
  const partnerAllocations: ProfitAllocation[] = [];
  if (remainingForPartners > 0 && partnerShareTotal > 0) {
    for (const partner of rule.partners) {
      const amount = roundMoney((remainingForPartners * partner.sharePct) / partnerShareTotal);
      partnerAllocations.push({
        allocationType: 'partner',
        label: partner.partnerName,
        sharePct: partner.sharePct,
        amount,
        accId: partner.accId ?? null,
      });
    }
  }

  const allocations = ([
    ...partnerAllocations,
    {
      allocationType: 'retained',
      label: 'Retained Earnings',
      sharePct: rule.retainedPct,
      amount: retainedAmount,
      accId: rule.retainedAccId,
    },
    {
      allocationType: 'reinvestment',
      label: 'Reinvestment',
      sharePct: rule.reinvestmentPct,
      amount: reinvestmentAmount,
      accId: rule.reinvestmentAccId,
    },
    {
      allocationType: 'reserve',
      label: 'Reserve Allocation',
      sharePct: rule.reservePct,
      amount: reserveAmount,
      accId: rule.reserveAccId,
    },
  ] as ProfitAllocation[]).filter((row) => row.amount > 0);

  const totalAllocated = roundMoney(allocations.reduce((sum, row) => sum + row.amount, 0));
  const delta = roundMoney(netIncome - totalAllocated);
  if (delta !== 0) {
    const target = [...allocations].reverse().find((row) => row.amount > 0);
    if (target) {
      target.amount = roundMoney(target.amount + delta);
    }
  }

  return allocations;
};

const normalizeRule = (branchId: number, raw: ProfitShareRuleInput, ruleId: number | null = null): ResolvedRule => {
  const partners = raw.partners.map((partner) => ({
    partnerName: partner.partnerName.trim(),
    sharePct: Number(partner.sharePct || 0),
    accId: partner.accId ?? null,
  }));

  return {
    ruleId,
    branchId,
    ruleName: raw.ruleName.trim(),
    isDefault: Boolean(raw.isDefault),
    sourceAccId: raw.sourceAccId ?? null,
    retainedPct: Number(raw.retainedPct || 0),
    retainedAccId: raw.retainedAccId ?? null,
    reinvestmentPct: Number(raw.reinvestmentPct || 0),
    reinvestmentAccId: raw.reinvestmentAccId ?? null,
    reservePct: Number(raw.reservePct || 0),
    reserveAccId: raw.reserveAccId ?? null,
    partners,
  };
};

const ensureAccountsExist = async (branchId: number, accountIds: number[]) => {
  if (!accountIds.length) return;
  const uniqueIds = Array.from(new Set(accountIds));
  const rows = await queryMany<{ acc_id: number }>(
    `SELECT acc_id
       FROM ims.accounts
      WHERE branch_id = $1
        AND acc_id = ANY($2::bigint[])`,
    [branchId, uniqueIds]
  );
  const existing = new Set(rows.map((row) => Number(row.acc_id)));
  const missing = uniqueIds.filter((id) => !existing.has(id));
  if (missing.length) {
    throw ApiError.badRequest(`Invalid account mapping: ${missing.join(', ')}`);
  }
};

const mapRuleRows = (rule: RuleRow, partners: RulePartnerRow[]): ResolvedRule => ({
  ruleId: Number(rule.rule_id),
  branchId: Number(rule.branch_id),
  ruleName: rule.rule_name,
  isDefault: Boolean(rule.is_default),
  sourceAccId: rule.source_acc_id ? Number(rule.source_acc_id) : null,
  retainedPct: Number(rule.retained_pct || 0),
  retainedAccId: rule.retained_acc_id ? Number(rule.retained_acc_id) : null,
  reinvestmentPct: Number(rule.reinvestment_pct || 0),
  reinvestmentAccId: rule.reinvestment_acc_id ? Number(rule.reinvestment_acc_id) : null,
  reservePct: Number(rule.reserve_pct || 0),
  reserveAccId: rule.reserve_acc_id ? Number(rule.reserve_acc_id) : null,
  partners: partners
    .filter((partner) => partner.is_active)
    .map((partner) => ({
      partnerName: partner.partner_name,
      sharePct: Number(partner.share_pct || 0),
      accId: partner.acc_id ? Number(partner.acc_id) : null,
    })),
});

let schemaBootstrapPromise: Promise<void> | null = null;

export const ensureFinanceClosingSchema = async () => {
  if (!schemaBootstrapPromise) {
    schemaBootstrapPromise = (async () => {
      await queryOne(
        `CREATE TABLE IF NOT EXISTS ims.finance_closing_periods (
           closing_id BIGSERIAL PRIMARY KEY,
           branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
           close_mode VARCHAR(20) NOT NULL CHECK (close_mode IN ('monthly','quarterly','yearly','custom')),
           period_from DATE NOT NULL,
           period_to DATE NOT NULL,
           operational_from DATE,
           operational_to DATE,
           status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','closed','reopened')),
           is_locked BOOLEAN NOT NULL DEFAULT FALSE,
           scheduled_at TIMESTAMPTZ,
           note TEXT,
           summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
           profit_json JSONB NOT NULL DEFAULT '{}'::jsonb,
           journal_id BIGINT REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE SET NULL,
           created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
           closed_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
           reopened_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
           closed_at TIMESTAMPTZ,
           reopened_at TIMESTAMPTZ,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           CONSTRAINT chk_finance_closing_dates CHECK (period_from <= period_to),
           CONSTRAINT uq_finance_closing_period UNIQUE (branch_id, period_from, period_to)
         )`
      );

      await queryOne(
        `CREATE TABLE IF NOT EXISTS ims.finance_profit_share_rules (
           rule_id BIGSERIAL PRIMARY KEY,
           branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
           rule_name VARCHAR(120) NOT NULL,
           source_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           retained_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (retained_pct >= 0 AND retained_pct <= 100),
           retained_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           reinvestment_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (reinvestment_pct >= 0 AND reinvestment_pct <= 100),
           reinvestment_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           reserve_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (reserve_pct >= 0 AND reserve_pct <= 100),
           reserve_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           is_default BOOLEAN NOT NULL DEFAULT FALSE,
           is_active BOOLEAN NOT NULL DEFAULT TRUE,
           created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );

      await queryOne(
        `CREATE TABLE IF NOT EXISTS ims.finance_profit_share_partners (
           partner_id BIGSERIAL PRIMARY KEY,
           rule_id BIGINT NOT NULL REFERENCES ims.finance_profit_share_rules(rule_id) ON UPDATE CASCADE ON DELETE CASCADE,
           branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
           partner_name VARCHAR(120) NOT NULL,
           share_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
           acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           is_active BOOLEAN NOT NULL DEFAULT TRUE,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );

      await queryOne(
        `CREATE TABLE IF NOT EXISTS ims.finance_profit_allocations (
           alloc_id BIGSERIAL PRIMARY KEY,
           closing_id BIGINT NOT NULL REFERENCES ims.finance_closing_periods(closing_id) ON UPDATE CASCADE ON DELETE CASCADE,
           branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
           allocation_type VARCHAR(20) NOT NULL CHECK (allocation_type IN ('partner','retained','reinvestment','reserve')),
           partner_name VARCHAR(120),
           share_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
           amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
           acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );

      await queryOne(
        `CREATE OR REPLACE FUNCTION ims.fn_finance_period_locked(p_branch_id BIGINT, p_txn_date DATE)
         RETURNS BOOLEAN
         LANGUAGE plpgsql
         AS $$
         BEGIN
           RETURN EXISTS (
             SELECT 1
               FROM ims.finance_closing_periods cp
              WHERE cp.branch_id = p_branch_id
                AND cp.status = 'closed'
                AND cp.is_locked = TRUE
                AND p_txn_date BETWEEN cp.period_from AND cp.period_to
           );
         END;
         $$`
      );

      await queryOne(
        `CREATE OR REPLACE FUNCTION ims.trg_check_finance_period_lock()
         RETURNS trigger
         LANGUAGE plpgsql
         AS $$
         DECLARE
           v_branch_id BIGINT;
           v_txn_date DATE;
           v_period RECORD;
         BEGIN
           IF TG_OP = 'DELETE' THEN
             v_branch_id := OLD.branch_id;
             EXECUTE format('SELECT ($1).%I::date', TG_ARGV[0]) USING OLD INTO v_txn_date;
           ELSE
             v_branch_id := NEW.branch_id;
             EXECUTE format('SELECT ($1).%I::date', TG_ARGV[0]) USING NEW INTO v_txn_date;
           END IF;

           IF v_branch_id IS NULL OR v_txn_date IS NULL THEN
             IF TG_OP = 'DELETE' THEN
               RETURN OLD;
             END IF;
             RETURN NEW;
           END IF;

           IF ims.fn_finance_period_locked(v_branch_id, v_txn_date) THEN
             SELECT period_from, period_to
               INTO v_period
               FROM ims.finance_closing_periods cp
              WHERE cp.branch_id = v_branch_id
                AND cp.status = 'closed'
                AND cp.is_locked = TRUE
                AND v_txn_date BETWEEN cp.period_from AND cp.period_to
              ORDER BY cp.period_to DESC
              LIMIT 1;

             RAISE EXCEPTION 'Transaction date % is inside closed finance period (% to %). Reopen period before editing.',
               v_txn_date, v_period.period_from, v_period.period_to
               USING ERRCODE = 'P0001';
           END IF;

           IF TG_OP = 'DELETE' THEN
             RETURN OLD;
           END IF;
           RETURN NEW;
         END;
         $$`
      );

      await queryOne(
        `DO $$
         DECLARE
           rec RECORD;
         BEGIN
           FOR rec IN
             SELECT *
               FROM (VALUES
                 ('sales', 'sale_date'),
                 ('sales_returns', 'return_date'),
                 ('purchases', 'purchase_date'),
                 ('purchase_returns', 'return_date'),
                 ('inventory_movements', 'move_date'),
                 ('account_transactions', 'txn_date'),
                 ('account_transfers', 'transfer_date'),
                 ('customer_receipts', 'receipt_date'),
                 ('supplier_receipts', 'receipt_date'),
                 ('supplier_payments', 'pay_date'),
                 ('expense_charges', 'charge_date'),
                 ('employee_payments', 'pay_date')
               ) AS t(table_name, column_name)
           LOOP
             IF EXISTS (
               SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = 'ims'
                  AND table_name = rec.table_name
                  AND column_name = rec.column_name
             ) THEN
               EXECUTE format('DROP TRIGGER IF EXISTS trg_finance_period_lock ON ims.%I', rec.table_name);
               EXECUTE format(
                 'CREATE TRIGGER trg_finance_period_lock BEFORE INSERT OR UPDATE OR DELETE ON ims.%I FOR EACH ROW EXECUTE FUNCTION ims.trg_check_finance_period_lock(%L)',
                 rec.table_name,
                 rec.column_name
               );
             END IF;
           END LOOP;
         END $$`
      );
    })().catch((error) => {
      schemaBootstrapPromise = null;
      throw error;
    });
  }
  await schemaBootstrapPromise;
};

const getClosingPeriod = async (
  runner: SqlRunner,
  closingId: number
): Promise<ClosingPeriodRow | null> => {
  const result = await runner.query(
    `SELECT *
       FROM ims.finance_closing_periods
      WHERE closing_id = $1`,
    [closingId]
  );
  return (result.rows[0] as ClosingPeriodRow) || null;
};

const computeClosingSnapshot = async (
  runner: SqlRunner,
  branchId: number,
  fromDate: string,
  toDate: string
): Promise<ClosingSnapshot> => {
  const params: Array<number | string> = [branchId, fromDate, toDate];
  const [
    grossSales,
    salesReturns,
    movementCostSales,
    movementCostSalesReturns,
    purchaseTotals,
    purchaseReturns,
    expenseCharges,
    payrollExpense,
    expensePaid,
    payrollPaid,
    otherIncome,
    stockValuation,
    cashBalance,
    capitalBalance,
  ] = await Promise.all([
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(s.total), 0)::double precision AS amount
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(s.status::text, '')) <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(sr.total), 0)::double precision AS amount
         FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.return_date::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(m.qty_out * m.unit_cost), 0)::double precision AS amount
         FROM ims.inventory_movements m
        WHERE m.branch_id = $1
          AND m.move_type = 'sale'
          AND m.move_date::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(m.qty_in * m.unit_cost), 0)::double precision AS amount
         FROM ims.inventory_movements m
        WHERE m.branch_id = $1
          AND m.move_type = 'sales_return'
          AND m.move_date::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(p.total), 0)::double precision AS amount
         FROM ims.purchases p
        WHERE p.branch_id = $1
          AND p.purchase_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(pr.total), 0)::double precision AS amount
         FROM ims.purchase_returns pr
        WHERE pr.branch_id = $1
          AND pr.return_date::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(ec.amount), 0)::double precision AS amount
         FROM ims.expense_charges ec
        WHERE ec.branch_id = $1
          AND ec.charge_date::date BETWEEN $2::date AND $3::date
          AND NOT ${openingExpensePredicate('ec')}`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(pl.net_salary), 0)::double precision AS amount
         FROM ims.payroll_lines pl
         JOIN ims.payroll_runs pr
           ON pr.payroll_id = pl.payroll_id
          AND pr.branch_id = pl.branch_id
        WHERE pl.branch_id = $1
          AND COALESCE(pr.status::text, 'draft') <> 'void'
          AND pr.period_to::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
         FROM ims.expense_payments ep
         JOIN ims.expense_charges ec
           ON ec.charge_id = ep.exp_ch_id
        WHERE ep.branch_id = $1
          AND ep.pay_date::date BETWEEN $2::date AND $3::date
          AND NOT ${openingExpensePredicate('ec')}`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
         FROM ims.employee_payments ep
        WHERE ep.branch_id = $1
          AND ep.pay_date::date BETWEEN $2::date AND $3::date`,
      params
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(GREATEST(at.credit - at.debit, 0)), 0)::double precision AS amount
         FROM ims.account_transactions at
        WHERE at.branch_id = $1
          AND at.txn_date::date BETWEEN $2::date AND $3::date
          AND at.txn_type IN ('other', 'return_refund')`,
      params
    ),
    queryAmount(
      runner,
      `WITH item_stock AS (
         SELECT
           i.item_id,
           CASE
             WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
             ELSE COALESCE(st.total_qty, 0)
           END::numeric(14,3) AS total_qty,
           COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price
         FROM ims.items i
         LEFT JOIN (
           SELECT
             s.branch_id,
             si.product_id AS item_id,
             COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS total_qty,
             COUNT(*)::int AS row_count
           FROM ims.store_items si
           JOIN ims.stores s ON s.store_id = si.store_id
           GROUP BY s.branch_id, si.product_id
         ) st
           ON st.item_id = i.item_id
          AND st.branch_id = i.branch_id
        WHERE i.branch_id = $1
       )
       SELECT COALESCE(SUM(item_stock.total_qty * item_stock.cost_price), 0)::double precision AS amount
         FROM item_stock`,
      [branchId]
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(a.balance), 0)::double precision AS amount
         FROM ims.accounts a
        WHERE a.branch_id = $1
          AND a.is_active = TRUE`,
      [branchId]
    ),
    queryAmount(
      runner,
      `SELECT COALESCE(SUM(a.balance), 0)::double precision AS amount
         FROM ims.accounts a
        WHERE a.branch_id = $1
          AND a.is_active = TRUE
          AND a.account_type = 'equity'`,
      [branchId]
    ),
  ]);

  const netRevenue = roundMoney(grossSales - salesReturns);
  const movementCogs = roundMoney(Math.max(movementCostSales - movementCostSalesReturns, 0));
  const fallbackCogs = roundMoney(Math.max(purchaseTotals - purchaseReturns, 0));
  const cogs = movementCogs > 0 ? movementCogs : fallbackCogs;
  const grossProfit = roundMoney(netRevenue - cogs);
  const effectiveExpense = Math.max(expenseCharges, expensePaid);
  const effectivePayroll = Math.max(payrollExpense, payrollPaid);
  const netIncome = roundMoney(grossProfit - effectiveExpense - effectivePayroll + otherIncome);

  return {
    salesRevenue: grossSales,
    salesReturns,
    netRevenue,
    cogs,
    grossProfit,
    expenseCharges: effectiveExpense,
    payrollExpense: effectivePayroll,
    otherIncome,
    netIncome,
    stockValuation,
    cashBalance,
    capitalBalance,
  };
};

const loadRuleById = async (branchId: number, ruleId: number): Promise<ResolvedRule | null> => {
  const [rule, partners] = await Promise.all([
    queryOne<RuleRow>(
      `SELECT *
         FROM ims.finance_profit_share_rules
        WHERE branch_id = $1
          AND rule_id = $2
          AND is_active = TRUE`,
      [branchId, ruleId]
    ),
    queryMany<RulePartnerRow>(
      `SELECT *
         FROM ims.finance_profit_share_partners
        WHERE rule_id = $1
        ORDER BY partner_id`,
      [ruleId]
    ),
  ]);
  if (!rule) return null;
  return mapRuleRows(rule, partners);
};

const loadDefaultRule = async (branchId: number): Promise<ResolvedRule | null> => {
  const rule = await queryOne<RuleRow>(
    `SELECT *
       FROM ims.finance_profit_share_rules
      WHERE branch_id = $1
        AND is_default = TRUE
        AND is_active = TRUE
      ORDER BY rule_id DESC
      LIMIT 1`,
    [branchId]
  );
  if (!rule) return null;
  const partners = await queryMany<RulePartnerRow>(
    `SELECT *
       FROM ims.finance_profit_share_partners
      WHERE rule_id = $1
      ORDER BY partner_id`,
    [rule.rule_id]
  );
  return mapRuleRows(rule, partners);
};

const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const persistRule = async (
  client: PoolClient,
  rule: ResolvedRule,
  userId: number | null,
  makeDefault: boolean
) => {
  const accountIds = [
    rule.sourceAccId,
    rule.retainedAccId,
    rule.reinvestmentAccId,
    rule.reserveAccId,
    ...rule.partners.map((partner) => partner.accId),
  ].filter((value): value is number => Number.isFinite(value as number) && Number(value) > 0);
  await ensureAccountsExist(rule.branchId, accountIds);

  let resolvedRuleId = rule.ruleId;
  if (!resolvedRuleId) {
    const inserted = await client.query<{ rule_id: number }>(
      `INSERT INTO ims.finance_profit_share_rules
         (branch_id, rule_name, source_acc_id, retained_pct, retained_acc_id, reinvestment_pct, reinvestment_acc_id, reserve_pct, reserve_acc_id, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING rule_id`,
      [
        rule.branchId,
        rule.ruleName,
        rule.sourceAccId,
        rule.retainedPct,
        rule.retainedAccId,
        rule.reinvestmentPct,
        rule.reinvestmentAccId,
        rule.reservePct,
        rule.reserveAccId,
        makeDefault,
        userId,
      ]
    );
    resolvedRuleId = Number(inserted.rows[0]?.rule_id);
  } else {
    await client.query(
      `UPDATE ims.finance_profit_share_rules
          SET rule_name = $2,
              source_acc_id = $3,
              retained_pct = $4,
              retained_acc_id = $5,
              reinvestment_pct = $6,
              reinvestment_acc_id = $7,
              reserve_pct = $8,
              reserve_acc_id = $9,
              is_default = $10,
              updated_at = NOW()
        WHERE rule_id = $1
          AND branch_id = $11`,
      [
        resolvedRuleId,
        rule.ruleName,
        rule.sourceAccId,
        rule.retainedPct,
        rule.retainedAccId,
        rule.reinvestmentPct,
        rule.reinvestmentAccId,
        rule.reservePct,
        rule.reserveAccId,
        makeDefault,
        rule.branchId,
      ]
    );
    await client.query(`DELETE FROM ims.finance_profit_share_partners WHERE rule_id = $1`, [resolvedRuleId]);
  }

  if (!resolvedRuleId) {
    throw ApiError.internal('Failed to save distribution rule');
  }

  if (makeDefault) {
    await client.query(
      `UPDATE ims.finance_profit_share_rules
          SET is_default = FALSE,
              updated_at = NOW()
        WHERE branch_id = $1
          AND rule_id <> $2`,
      [rule.branchId, resolvedRuleId]
    );
  }

  for (const partner of rule.partners) {
    await client.query(
      `INSERT INTO ims.finance_profit_share_partners
         (rule_id, branch_id, partner_name, share_pct, acc_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [resolvedRuleId, rule.branchId, partner.partnerName, partner.sharePct, partner.accId]
    );
  }

  return resolvedRuleId;
};

const resolveRuleForPeriod = async (
  branchId: number,
  action: ClosingActionInput,
  userId: number | null
): Promise<ResolvedRule> => {
  if (action.rule) {
    const normalized = normalizeRule(branchId, action.rule, null);
    ensureRulePercentages(normalized);
    if (action.saveRuleAsDefault) {
      const ruleId = await withTransaction(async (client) =>
        persistRule(client, normalized, userId, true)
      );
      return { ...normalized, ruleId };
    }
    return normalized;
  }

  if (action.ruleId) {
    const rule = await loadRuleById(branchId, action.ruleId);
    if (!rule) throw ApiError.badRequest('Selected distribution rule was not found');
    ensureRulePercentages(rule);
    return rule;
  }

  const defaultRule = await loadDefaultRule(branchId);
  if (defaultRule) {
    ensureRulePercentages(defaultRule);
    return defaultRule;
  }

  return {
    ruleId: null,
    branchId,
    ruleName: 'Auto retained earnings',
    isDefault: true,
    sourceAccId: null,
    retainedPct: 100,
    retainedAccId: null,
    reinvestmentPct: 0,
    reinvestmentAccId: null,
    reservePct: 0,
    reserveAccId: null,
    partners: [],
  };
};

const postProfitShareJournal = async (
  client: PoolClient,
  closingPeriod: ClosingPeriodRow,
  allocations: ProfitAllocation[],
  rule: ResolvedRule,
  userId: number | null,
  force: boolean
): Promise<{ journalId: number | null; warnings: string[] }> => {
  const warnings: string[] = [];
  const payableAllocations = allocations.filter((row) => row.amount > 0);
  const transferTotal = roundMoney(payableAllocations.reduce((sum, row) => sum + row.amount, 0));

  if (transferTotal <= 0) {
    return { journalId: null, warnings };
  }

  if (!rule.sourceAccId) {
    warnings.push('No source capital account configured; journal posting skipped.');
    if (force) return { journalId: null, warnings };
    throw ApiError.badRequest('Source capital account is required for automatic transfer');
  }

  const accountIds = [rule.sourceAccId, ...payableAllocations.map((row) => row.accId).filter(Boolean)] as number[];
  await ensureAccountsExist(closingPeriod.branch_id, accountIds);

  const missingTarget = payableAllocations.filter((row) => !row.accId);
  if (missingTarget.length) {
    const names = missingTarget.map((row) => row.label).join(', ');
    warnings.push(`Missing destination account for: ${names}.`);
    if (!force) {
      throw ApiError.badRequest(`Missing destination account mapping for: ${names}`);
    }
  }

  const sourceBalanceRes = await client.query<{ balance: string | number }>(
    `SELECT balance
       FROM ims.accounts
      WHERE branch_id = $1
        AND acc_id = $2
      LIMIT 1`,
    [closingPeriod.branch_id, rule.sourceAccId]
  );
  const sourceBalance = toMoney(sourceBalanceRes.rows[0]?.balance);
  if (sourceBalance < transferTotal) {
    throw ApiError.badRequest(
      `Source capital account balance is insufficient (${sourceBalance.toFixed(2)} < ${transferTotal.toFixed(2)})`
    );
  }

  const journal = await client.query<{ journal_id: number }>(
    `INSERT INTO ims.journal_entries
       (branch_id, entry_date, memo, source_table, source_id, created_by)
     VALUES ($1, $2::date, $3, 'finance_closing_periods', $4, $5)
     RETURNING journal_id`,
    [
      closingPeriod.branch_id,
      toDateOnly(closingPeriod.period_to),
      `Profit sharing close #${closingPeriod.closing_id} (${toDateOnly(closingPeriod.period_from)} to ${toDateOnly(
        closingPeriod.period_to
      )})`,
      closingPeriod.closing_id,
      userId,
    ]
  );

  const journalId = Number(journal.rows[0]?.journal_id || 0) || null;
  if (!journalId) throw ApiError.internal('Failed to create closing journal entry');

  await client.query(
    `INSERT INTO ims.journal_lines (journal_id, acc_id, debit, credit, note)
     VALUES ($1, $2, $3, 0, $4)`,
    [journalId, rule.sourceAccId, transferTotal, 'Profit sharing source']
  );

  await client.query(
    `UPDATE ims.accounts
        SET balance = balance - $3
      WHERE branch_id = $1
        AND acc_id = $2`,
    [closingPeriod.branch_id, rule.sourceAccId, transferTotal]
  );

  await client.query(
    `INSERT INTO ims.account_transactions
       (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
     VALUES ($1, $2, 'other', 'finance_closing_periods', $3, $4, 0, $5)`,
    [
      closingPeriod.branch_id,
      rule.sourceAccId,
      closingPeriod.closing_id,
      transferTotal,
      `Profit distribution source for closing #${closingPeriod.closing_id}`,
    ]
  );

  for (const allocation of payableAllocations) {
    if (!allocation.accId) continue;
    await client.query(
      `INSERT INTO ims.journal_lines (journal_id, acc_id, debit, credit, note)
       VALUES ($1, $2, 0, $3, $4)`,
      [
        journalId,
        allocation.accId,
        allocation.amount,
        `${allocation.allocationType} allocation: ${allocation.label}`,
      ]
    );

    await client.query(
      `UPDATE ims.accounts
          SET balance = balance + $3
        WHERE branch_id = $1
          AND acc_id = $2`,
      [closingPeriod.branch_id, allocation.accId, allocation.amount]
    );

    await client.query(
      `INSERT INTO ims.account_transactions
         (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
       VALUES ($1, $2, 'other', 'finance_closing_periods', $3, 0, $4, $5)`,
      [
        closingPeriod.branch_id,
        allocation.accId,
        closingPeriod.closing_id,
        allocation.amount,
        `${allocation.allocationType} allocation: ${allocation.label}`,
      ]
    );
  }

  return { journalId, warnings };
};

const closePeriodInternal = async (
  scope: BranchScope,
  closingId: number,
  action: ClosingActionInput,
  userId: number | null,
  source: 'manual' | 'scheduled'
): Promise<CloseResult> => {
  await ensureFinanceClosingSchema();

  return withTransaction(async (client) => {
    const periodResult = await client.query<ClosingPeriodRow>(
      `SELECT *
         FROM ims.finance_closing_periods
        WHERE closing_id = $1
        FOR UPDATE`,
      [closingId]
    );
    const period = periodResult.rows[0];
    if (!period) throw ApiError.notFound('Closing period not found');
    assertBranchAccess(scope, Number(period.branch_id));

    if (period.status === 'closed' && !action.force) {
      throw ApiError.badRequest('This period is already closed');
    }

    const summary = await computeClosingSnapshot(
      client,
      Number(period.branch_id),
      toDateOnly(period.period_from),
      toDateOnly(period.period_to)
    );
    const rule = await resolveRuleForPeriod(Number(period.branch_id), action, userId);
    const allocations = buildProfitAllocations(summary.netIncome, rule);

    const warnings: string[] = [];
    let journalId: number | null = null;
    if (action.autoTransfer && summary.netIncome > 0) {
      const posted = await postProfitShareJournal(client, period, allocations, rule, userId, Boolean(action.force));
      journalId = posted.journalId;
      warnings.push(...posted.warnings);
    } else if (summary.netIncome <= 0) {
      warnings.push('Net income is zero or negative; no profit-sharing transfer was posted.');
    }

    await client.query(`DELETE FROM ims.finance_profit_allocations WHERE closing_id = $1`, [closingId]);
    for (const row of allocations) {
      await client.query(
        `INSERT INTO ims.finance_profit_allocations
           (closing_id, branch_id, allocation_type, partner_name, share_pct, amount, acc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          closingId,
          period.branch_id,
          row.allocationType,
          row.allocationType === 'partner' ? row.label : null,
          row.sharePct,
          row.amount,
          row.accId,
        ]
      );
    }

    await client.query(
      `UPDATE ims.finance_closing_periods
          SET status = 'closed',
              is_locked = TRUE,
              closed_at = NOW(),
              closed_by = $2,
              reopened_at = NULL,
              reopened_by = NULL,
              summary_json = $3::jsonb,
              profit_json = $4::jsonb,
              journal_id = $5,
              updated_at = NOW()
        WHERE closing_id = $1`,
      [
        closingId,
        userId,
        JSON.stringify(summary),
        JSON.stringify({
          rule,
          allocations,
          warnings,
          transferPosted: Boolean(journalId),
          closedByMode: source,
        }),
        journalId,
      ]
    );

    const updated = await getClosingPeriod(client, closingId);
    if (!updated) throw ApiError.internal('Failed to update closing period');

    await logAudit({
      userId,
      action: 'finance.close',
      entity: 'finance_closing_periods',
      entityId: closingId,
      branchId: Number(period.branch_id),
      oldValue: {
        status: period.status,
        is_locked: period.is_locked,
      },
      newValue: {
        status: 'closed',
        is_locked: true,
        summary,
        allocations,
        journalId,
        closedByMode: source,
      },
    });

    return {
      period: updated,
      summary,
      rule,
      allocations,
      journalId,
      warnings,
    };
  });
};

export const financeClosingService = {
  async listPeriods(scope: BranchScope, input: ClosingPeriodsQueryInput) {
    await ensureFinanceClosingSchema();
    await financeClosingService.runScheduledClosings(scope, null);

    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (input.branchId) {
      assertBranchAccess(scope, input.branchId);
      params.push(input.branchId);
      where += ` AND cp.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND cp.branch_id = ANY($${params.length})`;
    }
    if (input.status) {
      params.push(input.status);
      where += ` AND cp.status = $${params.length}`;
    }
    if (input.fromDate) {
      params.push(input.fromDate);
      where += ` AND cp.period_to >= $${params.length}::date`;
    }
    if (input.toDate) {
      params.push(input.toDate);
      where += ` AND cp.period_from <= $${params.length}::date`;
    }

    return queryMany<ClosingPeriodRow>(
      `SELECT cp.*
         FROM ims.finance_closing_periods cp
        ${where}
        ORDER BY cp.period_to DESC, cp.closing_id DESC
        LIMIT 200`,
      params
    );
  },

  async createPeriod(scope: BranchScope, input: ClosingPeriodCreateInput, userId: number | null) {
    await ensureFinanceClosingSchema();
    const branchId = pickBranchForWrite(scope, input.branchId);

    const overlaps = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM ims.finance_closing_periods cp
          WHERE cp.branch_id = $1
            AND cp.status IN ('draft', 'closed')
            AND daterange(cp.period_from, cp.period_to, '[]') && daterange($2::date, $3::date, '[]')
       ) AS exists`,
      [branchId, input.periodFrom, input.periodTo]
    );
    if (overlaps?.exists) {
      throw ApiError.badRequest('A closing period already exists for the selected date range');
    }

    const period = await queryOne<ClosingPeriodRow>(
      `INSERT INTO ims.finance_closing_periods
         (branch_id, close_mode, period_from, period_to, operational_from, operational_to, scheduled_at, note, created_by)
       VALUES ($1, $2, $3::date, $4::date, $5::date, $6::date, $7, $8, $9)
       RETURNING *`,
      [
        branchId,
        input.closeMode,
        input.periodFrom,
        input.periodTo,
        input.operationalFrom || null,
        input.operationalTo || null,
        input.scheduledAt || null,
        input.note || null,
        userId,
      ]
    );
    if (!period) throw ApiError.internal('Failed to create closing period');

    await logAudit({
      userId,
      action: 'finance.close.create',
      entity: 'finance_closing_periods',
      entityId: Number(period.closing_id),
      branchId,
      newValue: period,
    });

    return period;
  },

  async updatePeriod(scope: BranchScope, closingId: number, input: ClosingPeriodUpdateInput, userId: number | null) {
    await ensureFinanceClosingSchema();

    const before = await getClosingPeriod(pool, closingId);
    if (!before) throw ApiError.notFound('Closing period not found');
    assertBranchAccess(scope, Number(before.branch_id));

    if (before.status === 'closed') {
      throw ApiError.badRequest('Closed period must be reopened before editing');
    }

    const basePeriodFrom = toDateOnly(before.period_from);
    const basePeriodTo = toDateOnly(before.period_to);
    const baseOperationalFrom = before.operational_from ? toDateOnly(before.operational_from) : null;
    const baseOperationalTo = before.operational_to ? toDateOnly(before.operational_to) : null;

    const nextPeriodFrom = input.periodFrom ?? basePeriodFrom;
    const nextPeriodTo = input.periodTo ?? basePeriodTo;
    const nextCloseMode = input.closeMode ?? (before.close_mode as ClosingPeriodCreateInput['closeMode']);

    const hasOperationalPatch = input.operationalFrom !== undefined || input.operationalTo !== undefined;
    const clearOperational = hasOperationalPatch && !input.operationalFrom && !input.operationalTo;
    const nextOperationalFrom = clearOperational
      ? null
      : input.operationalFrom
      ? toDateOnly(input.operationalFrom)
      : baseOperationalFrom;
    const nextOperationalTo = clearOperational
      ? null
      : input.operationalTo
      ? toDateOnly(input.operationalTo)
      : baseOperationalTo;

    const nextScheduledAt =
      input.scheduledAt !== undefined
        ? input.scheduledAt
          ? new Date(input.scheduledAt).toISOString()
          : null
        : before.scheduled_at;
    const nextNote = input.note !== undefined ? input.note || null : before.note;

    const overlaps = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM ims.finance_closing_periods cp
          WHERE cp.branch_id = $1
            AND cp.closing_id <> $2
            AND cp.status IN ('draft', 'closed', 'reopened')
            AND daterange(cp.period_from, cp.period_to, '[]') && daterange($3::date, $4::date, '[]')
       ) AS exists`,
      [before.branch_id, closingId, nextPeriodFrom, nextPeriodTo]
    );
    if (overlaps?.exists) {
      throw ApiError.badRequest('A closing period already exists for the selected date range');
    }

    const periodWindowChanged = nextPeriodFrom !== basePeriodFrom || nextPeriodTo !== basePeriodTo;
    const settingsChanged =
      nextCloseMode !== before.close_mode ||
      nextOperationalFrom !== baseOperationalFrom ||
      nextOperationalTo !== baseOperationalTo ||
      nextScheduledAt !== before.scheduled_at ||
      nextNote !== before.note;
    const shouldResetComputedData = periodWindowChanged;

    if (!settingsChanged && !periodWindowChanged) {
      return before;
    }

    const updated = await queryOne<ClosingPeriodRow>(
      `UPDATE ims.finance_closing_periods
          SET close_mode = $2,
              period_from = $3::date,
              period_to = $4::date,
              operational_from = $5::date,
              operational_to = $6::date,
              scheduled_at = $7,
              note = $8,
              summary_json = CASE WHEN $9 THEN '{}'::jsonb ELSE summary_json END,
              profit_json = CASE WHEN $9 THEN '{}'::jsonb ELSE profit_json END,
              journal_id = CASE WHEN $9 THEN NULL ELSE journal_id END,
              updated_at = NOW()
        WHERE closing_id = $1
        RETURNING *`,
      [
        closingId,
        nextCloseMode,
        nextPeriodFrom,
        nextPeriodTo,
        nextOperationalFrom,
        nextOperationalTo,
        nextScheduledAt,
        nextNote,
        shouldResetComputedData,
      ]
    );
    if (!updated) throw ApiError.internal('Failed to update closing period');

    await logAudit({
      userId,
      action: 'finance.close.update',
      entity: 'finance_closing_periods',
      entityId: closingId,
      branchId: Number(updated.branch_id),
      oldValue: {
        closeMode: before.close_mode,
        periodFrom: basePeriodFrom,
        periodTo: basePeriodTo,
        operationalFrom: baseOperationalFrom,
        operationalTo: baseOperationalTo,
        scheduledAt: before.scheduled_at,
        note: before.note,
      },
      newValue: {
        closeMode: updated.close_mode,
        periodFrom: toDateOnly(updated.period_from),
        periodTo: toDateOnly(updated.period_to),
        operationalFrom: updated.operational_from ? toDateOnly(updated.operational_from) : null,
        operationalTo: updated.operational_to ? toDateOnly(updated.operational_to) : null,
        scheduledAt: updated.scheduled_at,
        note: updated.note,
      },
    });

    return updated;
  },

  async previewClose(scope: BranchScope, closingId: number, input: ClosingActionInput, userId: number | null) {
    await ensureFinanceClosingSchema();
    const period = await getClosingPeriod(pool, closingId);
    if (!period) throw ApiError.notFound('Closing period not found');
    assertBranchAccess(scope, Number(period.branch_id));

    const summary = await computeClosingSnapshot(
      pool,
      Number(period.branch_id),
      toDateOnly(period.period_from),
      toDateOnly(period.period_to)
    );
    const rule = await resolveRuleForPeriod(Number(period.branch_id), input, userId);
    const allocations = buildProfitAllocations(summary.netIncome, rule);
    const warnings: string[] = [];

    if (summary.netIncome <= 0) {
      warnings.push('Net income is zero or negative. Profit sharing allocation will be skipped.');
    }
    if (input.autoTransfer && summary.netIncome > 0) {
      if (!rule.sourceAccId) warnings.push('Source capital account is not configured.');
      const missingTargets = allocations.filter((row) => !row.accId);
      if (missingTargets.length) {
        warnings.push(
          `Missing destination account mapping for: ${missingTargets.map((row) => row.label).join(', ')}`
        );
      }
    }

    return {
      period,
      summary,
      rule,
      allocations,
      warnings,
    };
  },

  async closePeriod(scope: BranchScope, closingId: number, input: ClosingActionInput, userId: number | null) {
    return closePeriodInternal(scope, closingId, input, userId, 'manual');
  },

  async reopenPeriod(scope: BranchScope, closingId: number, input: ClosingReopenInput, userId: number | null) {
    await ensureFinanceClosingSchema();

    const before = await getClosingPeriod(pool, closingId);
    if (!before) throw ApiError.notFound('Closing period not found');
    assertBranchAccess(scope, Number(before.branch_id));

    if (before.status !== 'closed') {
      throw ApiError.badRequest('Only closed periods can be reopened');
    }

    const reopened = await queryOne<ClosingPeriodRow>(
      `UPDATE ims.finance_closing_periods
          SET status = 'reopened',
              is_locked = FALSE,
              reopened_at = NOW(),
              reopened_by = $2,
              note = COALESCE($3, note),
              updated_at = NOW()
        WHERE closing_id = $1
        RETURNING *`,
      [closingId, userId, input.reason || null]
    );
    if (!reopened) throw ApiError.internal('Failed to reopen closing period');

    await logAudit({
      userId,
      action: 'finance.close.reopen',
      entity: 'finance_closing_periods',
      entityId: closingId,
      branchId: Number(reopened.branch_id),
      oldValue: { status: before.status, is_locked: before.is_locked },
      newValue: { status: reopened.status, is_locked: reopened.is_locked, reason: input.reason || null },
    });

    return reopened;
  },

  async getSummary(scope: BranchScope, closingId: number, options?: { live?: boolean }) {
    await ensureFinanceClosingSchema();
    const period = await getClosingPeriod(pool, closingId);
    if (!period) throw ApiError.notFound('Closing period not found');
    assertBranchAccess(scope, Number(period.branch_id));

    const allocations = await queryMany<{
      allocation_type: 'partner' | 'retained' | 'reinvestment' | 'reserve';
      partner_name: string | null;
      share_pct: string | number;
      amount: string | number;
      acc_id: number | null;
    }>(
      `SELECT allocation_type, partner_name, share_pct, amount, acc_id
         FROM ims.finance_profit_allocations
        WHERE closing_id = $1
        ORDER BY alloc_id`,
      [closingId]
    );

    const parsedSummary = parseJsonSafe<ClosingSnapshot | null>(period.summary_json, null);
    const shouldComputeLiveSummary =
      Boolean(options?.live) || period.status !== 'closed' || !parsedSummary || isEmptyObject(parsedSummary);
    const summary = shouldComputeLiveSummary
      ? await computeClosingSnapshot(
          pool,
          Number(period.branch_id),
          toDateOnly(period.period_from),
          toDateOnly(period.period_to)
        )
      : parsedSummary;
    const profit = parseJsonSafe<any>(period.profit_json, {});

    return {
      period,
      summary,
      profit: {
        ...profit,
        allocations: allocations.map((row) => ({
          allocationType: row.allocation_type,
          label:
            row.partner_name ||
            (row.allocation_type === 'retained'
              ? 'Retained Earnings'
              : row.allocation_type === 'reinvestment'
              ? 'Reinvestment'
              : row.allocation_type === 'reserve'
              ? 'Reserve Allocation'
              : 'Partner'),
          sharePct: Number(row.share_pct || 0),
          amount: Number(row.amount || 0),
          accId: row.acc_id ? Number(row.acc_id) : null,
        })),
      },
    };
  },

  async listRules(scope: BranchScope, branchId?: number) {
    await ensureFinanceClosingSchema();
    const params: any[] = [];
    let where = 'WHERE r.is_active = TRUE';

    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND r.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND r.branch_id = ANY($${params.length})`;
    }

    const rules = await queryMany<RuleRow>(
      `SELECT r.*
         FROM ims.finance_profit_share_rules r
        ${where}
        ORDER BY r.is_default DESC, r.rule_name ASC`,
      params
    );

    const ruleIds = rules.map((rule) => Number(rule.rule_id));
    const partners = ruleIds.length
      ? await queryMany<RulePartnerRow>(
          `SELECT partner_id, rule_id, partner_name, share_pct, acc_id, is_active
             FROM ims.finance_profit_share_partners
            WHERE rule_id = ANY($1::bigint[])
            ORDER BY rule_id, partner_id`,
          [ruleIds]
        )
      : [];

    return rules.map((rule) =>
      mapRuleRows(
        rule,
        partners.filter((partner) => Number(partner.rule_id || 0) === Number(rule.rule_id))
      )
    );
  },

  async saveRule(scope: BranchScope, input: ProfitShareRuleUpsertInput, userId: number | null) {
    await ensureFinanceClosingSchema();
    const branchId = pickBranchForWrite(scope, input.branchId);

    const normalized = normalizeRule(branchId, input, input.ruleId || null);
    ensureRulePercentages(normalized);

    const ruleId = await withTransaction(async (client) => {
      if (normalized.ruleId) {
        const existing = await client.query<{ branch_id: number }>(
          `SELECT branch_id
             FROM ims.finance_profit_share_rules
            WHERE rule_id = $1
            LIMIT 1`,
          [normalized.ruleId]
        );
        const existingBranch = Number(existing.rows[0]?.branch_id || 0);
        if (!existingBranch) throw ApiError.notFound('Rule not found');
        assertBranchAccess(scope, existingBranch);
        normalized.branchId = existingBranch;
      }
      return persistRule(client, normalized, userId, Boolean(input.isDefault));
    });

    const saved = await loadRuleById(normalized.branchId, ruleId);
    if (!saved) throw ApiError.internal('Failed to load saved rule');

    await logAudit({
      userId,
      action: normalized.ruleId ? 'finance.close.rule.update' : 'finance.close.rule.create',
      entity: 'finance_profit_share_rules',
      entityId: ruleId,
      branchId: normalized.branchId,
      newValue: saved,
    });

    return saved;
  },

  async runScheduledClosings(scope: BranchScope, userId: number | null) {
    await ensureFinanceClosingSchema();
    const params: any[] = [nowIso()];
    let where = `WHERE cp.status = 'draft'
                 AND cp.scheduled_at IS NOT NULL
                 AND cp.scheduled_at <= $1::timestamptz`;
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND cp.branch_id = ANY($${params.length})`;
    }

    const due = await queryMany<{ closing_id: number; branch_id: number }>(
      `SELECT cp.closing_id, cp.branch_id
         FROM ims.finance_closing_periods cp
        ${where}
        ORDER BY cp.scheduled_at ASC`,
      params
    );

    let closed = 0;
    const failed: Array<{ closingId: number; reason: string }> = [];
    for (const row of due) {
      try {
        await closePeriodInternal(
          scope,
          Number(row.closing_id),
          { autoTransfer: true, force: false, saveRuleAsDefault: false },
          userId,
          'scheduled'
        );
        closed += 1;
      } catch (error: any) {
        failed.push({
          closingId: Number(row.closing_id),
          reason: String(error?.message || 'Unknown error'),
        });
      }
    }

    return {
      due: due.length,
      closed,
      failed,
    };
  },
};
