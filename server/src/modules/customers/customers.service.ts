import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { deleteGlByRef, ensureCoreCoa, postGl } from '../../utils/glPosting';
import { syncSystemAccountBalancesWithClient } from '../../utils/systemAccounts';
import { softDeleteById } from '../../db/softDelete';

export interface Customer {
  customer_id: number;
  full_name: string;
  phone: string | null;
  customer_type: 'regular' | 'one-time' | string;
  address: string | null;
  sex: string | null;
  gender: string | null;
  registered_date: string;
  is_active: boolean;
  credit_allowed: boolean;
  credit_limit: number | null;
  credit_days: number;
  balance: number;
  open_balance: number;
  remaining_balance: number;
  has_transactions: boolean;
}

export interface CustomerInput {
  fullName: string;
  phone?: string | null;
  customerType?: 'regular' | 'one-time' | string;
  address?: string | null;
  sex?: string | null;
  gender?: string | null;
  isActive?: boolean;
  creditAllowed?: boolean;
  creditDays?: number;
  creditLimit?: number | null;
  remainingBalance?: number;
  editReason?: string;
}

type CustomerColumnMeta = {
  balanceColumn: 'open_balance' | 'remaining_balance';
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
  hasGender: boolean;
  hasType: boolean;
  hasCreditAllowed: boolean;
  hasCreditDays: boolean;
  hasCreditLimit: boolean;
};

let customerColumnMeta: CustomerColumnMeta | null = null;

const detectCustomerColumns = async (): Promise<CustomerColumnMeta> => {
  if (customerColumnMeta) return customerColumnMeta;
  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));
  const hasRemainingBalance = names.has('remaining_balance');
  const hasOpenBalance = names.has('open_balance');
  customerColumnMeta = {
    hasOpenBalance,
    hasRemainingBalance,
    balanceColumn: hasRemainingBalance ? 'remaining_balance' : 'open_balance',
    hasGender: names.has('gender'),
    hasType: names.has('customer_type'),
    hasCreditAllowed: names.has('credit_allowed'),
    hasCreditDays: names.has('credit_days'),
    hasCreditLimit: names.has('credit_limit'),
  };
  return customerColumnMeta;
};

const mapCustomer = (row: {
  customer_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  sex: string | null;
  gender: string | null;
  registered_date: string;
  is_active: boolean;
  customer_type: string | null;
  credit_allowed?: boolean | null;
  credit_days?: number | string | null;
  balance_value: string | number;
  credit_limit?: number | string | null;
  open_balance_value?: string | number | null;
  has_transactions?: boolean | null;
}): Customer => ({
  customer_id: Number(row.customer_id),
  full_name: row.full_name,
  phone: row.phone,
  customer_type: row.customer_type || 'regular',
  address: row.address,
  sex: row.sex,
  gender: row.gender,
  registered_date: row.registered_date,
  is_active: Boolean(row.is_active),
  credit_allowed: row.credit_allowed !== false,
  credit_days: Number(row.credit_days ?? 30),
  balance: Number(row.balance_value || 0),
  credit_limit: row.credit_limit == null ? null : Number(row.credit_limit),
  open_balance: Number(row.open_balance_value ?? row.balance_value ?? 0),
  remaining_balance: Number(row.balance_value || 0),
  has_transactions: Boolean(row.has_transactions),
});

const getGenderSelect = (meta: CustomerColumnMeta) =>
  meta.hasGender ? 'COALESCE(gender, sex::text) AS gender' : 'sex::text AS gender';
const getCustomerTypeSelect = (meta: CustomerColumnMeta) =>
  meta.hasType ? 'customer_type' : `'regular'::text AS customer_type`;
const getCreditAllowedSelect = (meta: CustomerColumnMeta) =>
  meta.hasCreditAllowed ? 'credit_allowed' : 'TRUE AS credit_allowed';
const getCreditDaysSelect = (meta: CustomerColumnMeta) =>
  meta.hasCreditDays ? 'credit_days' : '30 AS credit_days';
const getCreditLimitSelect = (meta: CustomerColumnMeta) =>
  meta.hasCreditLimit ? 'credit_limit::text AS credit_limit' : 'NULL::text AS credit_limit';
const getOpenBalanceSelect = (meta: CustomerColumnMeta) =>
  meta.hasOpenBalance ? 'open_balance::text AS open_balance_value' : 'NULL::text AS open_balance_value';

// Mirrors hasCustomerNonOpeningLedger's predicate exactly, so the UI's disabled
// state and the server-side save-time guard never disagree.
const HAS_TRANSACTIONS_SELECT = `EXISTS (
  SELECT 1 FROM ims.customer_ledger cl
   WHERE cl.branch_id = customers.branch_id
     AND cl.customer_id = customers.customer_id
     AND NOT (cl.entry_type = 'opening' AND cl.ref_table = 'opening_balance')
) AS has_transactions`;

const scopedCustomer = async (
  id: number,
  scope: BranchScope
): Promise<Customer | null> => {
  const meta = await detectCustomerColumns();
  const balanceColumn = meta.balanceColumn;
  const genderSelect = getGenderSelect(meta);
  const row = scope.isAdmin
    ? await queryOne<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
        has_transactions: boolean;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${getCreditLimitSelect(meta)}, ${balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}, ${HAS_TRANSACTIONS_SELECT}
           FROM ims.customers
          WHERE customer_id = $1
            AND COALESCE(is_deleted, 0)::int = 0`,
        [id]
      )
    : await queryOne<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
        has_transactions: boolean;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${getCreditLimitSelect(meta)}, ${balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}, ${HAS_TRANSACTIONS_SELECT}
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = ANY($2)
            AND COALESCE(is_deleted, 0)::int = 0`,
        [id, scope.branchIds]
      );

  return row ? mapCustomer(row) : null;
};

// Phase 4 (Central Delete Architecture): deleteCustomer below now soft-deletes
// via ims.sp_soft_delete, which lets a customer with real sales/returns/ledger
// history be archived (that history is 'preserve'd, untouched - see
// server/sql/20260923_customer_supplier_delete_policy.sql). The one thing the
// generic policy engine can't express is "outstanding balance must be zero" -
// it only knows whether a dependent row exists, not its value - so that stays
// a manual pre-check here, mirroring getProductStockOnHand from Phase 3.
const getCustomerOutstandingBalance = async (
  client: PoolClient,
  branchId: number,
  customerId: number
): Promise<number> => {
  const meta = await detectCustomerColumns();
  const balanceCol = meta.balanceColumn;
  const balanceRow = await client.query<{ balance: string }>(
    `SELECT COALESCE(${balanceCol}, 0)::text AS balance
       FROM ims.customers
      WHERE customer_id = $1
        AND branch_id = $2`,
    [customerId, branchId]
  );
  return Math.abs(Number(balanceRow.rows[0]?.balance || 0));
};

const hasCustomerNonOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.customer_ledger
        WHERE branch_id = $1
          AND customer_id = $2
          AND NOT (entry_type = 'opening' AND ref_table = 'opening_balance')
     ) AS exists`,
    [branchId, customerId]
  );
  return Boolean(result.rows[0]?.exists);
};

const upsertCustomerOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number,
  amount: number
) => {
  await client.query(
    `DELETE FROM ims.customer_ledger
      WHERE branch_id = $1
        AND customer_id = $2
        AND entry_type = 'opening'
        AND ref_table = 'opening_balance'`,
    [branchId, customerId]
  );

  const coa = await ensureCoreCoa(client, branchId, ['accountsReceivable', 'openingBalanceEquity']);
  // H4 fix: reverse this ref's previous Opening Balance Equity contribution
  // to accounts.balance before the old GL rows are deleted below - it was
  // never mirrored into accounts.balance at all, so re-edits accumulated
  // stale GL-only value. Accounts Receivable is deliberately left out here;
  // it's resynced from the ledger at the end of this function.
  const priorObeRows = await client.query<{ debit: string; credit: string }>(
    `SELECT debit, credit FROM ims.account_transactions
      WHERE branch_id = $1 AND ref_table = 'opening_balance' AND ref_id = $2
        AND acc_id = $3 AND COALESCE(is_deleted, 0) = 0`,
    [branchId, customerId, coa.openingBalanceEquity]
  );
  for (const row of priorObeRows.rows) {
    const delta = -(Number(row.credit) - Number(row.debit));
    if (delta) {
      await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
        delta,
        coa.openingBalanceEquity,
        branchId,
      ]);
    }
  }

  // Keep the real GL in sync with the subsidiary ledger: replace any prior
  // opening-balance journal entry for this customer, then re-post it if the
  // new amount is non-zero, so Accounts Receivable never drifts from what
  // the customer's balance edit form shows.
  await deleteGlByRef(client, { branchId, refTable: 'opening_balance', refId: customerId });

  if (amount) {
    await client.query(
      `INSERT INTO ims.customer_ledger
        (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
       VALUES
        ($1, $2, 'opening', 'opening_balance', $2, NULL, $3, 0, NOW() - INTERVAL '1 second', $4)`,
      [branchId, customerId, amount, '[OPENING BALANCE] Set from customer form']
    );

    await postGl(client, {
      branchId,
      refTable: 'opening_balance',
      refId: customerId,
      note: 'Customer opening/adjusted balance',
      lines: [
        { accId: coa.accountsReceivable, debit: amount, credit: 0, note: 'Customer receivable (opening/adjusted)' },
        { accId: coa.openingBalanceEquity, debit: 0, credit: amount, note: 'Opening balance equity' },
      ],
    });
    // H4 fix: Opening Balance Equity credit above was never mirrored into
    // accounts.balance. Equity - credit increases it.
    await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
      amount,
      coa.openingBalanceEquity,
      branchId,
    ]);
  }

  // The Balance Sheet reads the "Accounts Receivable" system account's stored
  // balance directly (it doesn't re-derive it from account_transactions), and
  // that balance is otherwise only kept current by a periodic background
  // sync. Resync it synchronously, in this same transaction, so the Balance
  // Sheet never shows a stale figure between the ledger edit and the next
  // scheduled sync.
  await syncSystemAccountBalancesWithClient(client, branchId);
};

export const customersService = {
  async listCustomers(
    branchIds: number[],
    search?: string,
    dateRange?: { fromDate?: string; toDate?: string },
    pagination?: { page: number; limit: number },
    customerType?: 'regular' | 'one-time'
  ): Promise<{ rows: Customer[]; total: number; page: number; limit: number }> {
    const meta = await detectCustomerColumns();
    const balanceColumn = meta.balanceColumn;
    const genderSelect = getGenderSelect(meta);
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 100;

    const params: unknown[] = [];
    const where: string[] = [];

    // UPDATED: Explicitly hide soft-deleted rows even when DB user bypasses RLS (e.g., postgres/superuser).
    where.push(`COALESCE(is_deleted, 0)::int = 0`);

    params.push(branchIds);
    where.push(`branch_id = ANY($${params.length})`);

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(full_name ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
      );
    }

    if (dateRange?.fromDate) {
      params.push(dateRange.fromDate);
      where.push(`registered_date >= $${params.length}::date`);
    }
    if (dateRange?.toDate) {
      params.push(dateRange.toDate);
      where.push(`registered_date <= $${params.length}::date`);
    }

    if (customerType && meta.hasType) {
      params.push(customerType);
      where.push(`customer_type = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.customers ${whereSql}`,
      params
    );

    const result = await queryMany<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      gender: string | null;
      registered_date: string;
      is_active: boolean;
      customer_type: string | null;
      credit_allowed: boolean | null;
      credit_days: number | null;
      balance_value: string;
      open_balance_value: string | null;
      has_transactions: boolean;
    }>(
      `SELECT
          customer_id,
          full_name,
          phone,
          address,
          sex::text AS sex,
          ${genderSelect},
          registered_date::text,
          is_active,
          ${getCustomerTypeSelect(meta)},
          ${getCreditAllowedSelect(meta)},
          ${getCreditDaysSelect(meta)},
          ${getCreditLimitSelect(meta)},
          ${balanceColumn}::text AS balance_value,
          ${getOpenBalanceSelect(meta)},
          ${HAS_TRANSACTIONS_SELECT}
       FROM ims.customers
       ${whereSql}
       ORDER BY full_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    return {
      rows: result.map(mapCustomer),
      total: Number(countResult?.total || 0),
      page,
      limit,
    };
  },

  async lookupCustomers(branchIds: number[], search?: string, limit = 50): Promise<Customer[]> {
    const meta = await detectCustomerColumns();
    const balanceColumn = meta.balanceColumn;
    const genderSelect = getGenderSelect(meta);

    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const params: unknown[] = [branchIds];

    // UPDATED: Explicitly hide soft-deleted rows even when DB user bypasses RLS (e.g., postgres/superuser).
    const where: string[] = [`branch_id = ANY($1)`, `is_active = TRUE`, `COALESCE(is_deleted, 0)::int = 0`];

    const q = String(search || '').trim();
    if (q) {
      params.push(`%${q}%`);
      where.push(`(full_name ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`);
    }

    params.push(safeLimit);
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const rows = await queryMany<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      gender: string | null;
      registered_date: string;
      is_active: boolean;
      customer_type: string | null;
      credit_allowed: boolean | null;
      credit_days: number | null;
      balance_value: string;
      open_balance_value: string | null;
    }>(
      `SELECT
          customer_id,
          full_name,
          phone,
          address,
          sex::text AS sex,
          ${genderSelect},
          registered_date::text,
          is_active,
          ${getCustomerTypeSelect(meta)},
          ${getCreditAllowedSelect(meta)},
          ${getCreditDaysSelect(meta)},
          ${getCreditLimitSelect(meta)},
          ${balanceColumn}::text AS balance_value,
          ${getOpenBalanceSelect(meta)}
       FROM ims.customers
       ${whereSql}
       ORDER BY full_name
       LIMIT $${params.length}`,
      params
    );

    return rows.map(mapCustomer);
  },

  async getCustomer(id: number, scope: BranchScope): Promise<Customer | null> {
    return scopedCustomer(id, scope);
  },

  async createCustomer(
    input: CustomerInput,
    context: { branchId: number }
  ): Promise<Customer> {
    const meta = await detectCustomerColumns();
    const genderSelect = getGenderSelect(meta);
    const genderValue = input.gender ?? input.sex ?? null;
    const customerType = input.customerType ?? 'regular';
    const opening = Math.max(0, Number(input.remainingBalance ?? 0));
    const creditAllowed =
      customerType === 'one-time' ? false : input.creditAllowed !== false;
    const creditDays = Math.max(0, Number(input.creditDays ?? 30));

    return withTransaction(async (client) => {
      let insertColumns = `(branch_id, full_name, phone, sex, `;
      let insertValues = `($1, $2, $3, $4::ims.sex_enum, `;
      const values: unknown[] = [
        context.branchId,
        input.fullName,
        input.phone ?? null,
        (genderValue ?? null) as 'male' | 'female' | null,
      ];
      let p = 5;

      if (meta.hasGender) {
        insertColumns += `gender, `;
        insertValues += `$${p++}, `;
        values.push(genderValue);
      }
      if (meta.hasType) {
        insertColumns += `customer_type, `;
        insertValues += `$${p++}, `;
        values.push(customerType);
      }
      if (meta.hasCreditAllowed) {
        insertColumns += `credit_allowed, `;
        insertValues += `$${p++}, `;
        values.push(creditAllowed);
      }
      if (meta.hasCreditDays) {
        insertColumns += `credit_days, `;
        insertValues += `$${p++}, `;
        values.push(creditDays);
      }

      if (meta.hasCreditLimit) {
        insertColumns += `credit_limit, `;
        insertValues += `$${p++}, `;
        values.push(input.creditLimit ?? null);
      }
      insertColumns += `address, `;
      insertValues += `$${p++}, `;
      values.push(input.address ?? null);

      if (meta.hasOpenBalance && meta.hasRemainingBalance) {
        insertColumns += `open_balance, remaining_balance, `;
        insertValues += `COALESCE($${p++}, 0), COALESCE($${p++}, 0), `;
        values.push(opening, opening);
      } else {
        insertColumns += `${meta.balanceColumn}, `;
        insertValues += `COALESCE($${p++}, 0), `;
        values.push(opening);
      }

      insertColumns += `is_active)`;
      insertValues += `COALESCE($${p++}, TRUE))`;
      values.push(input.isActive ?? true);

      const rowRes = await client.query<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `INSERT INTO ims.customers
           ${insertColumns}
         VALUES
           ${insertValues}
         RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${getCreditLimitSelect(meta)}, ${meta.balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}`,
        values
      );

      const row = rowRes.rows[0];
      if (!row) {
        throw new Error('Failed to create customer');
      }

      // Persist opening balance into ledger so "Prepare Accounts" reconciliation won't reset it.
      await upsertCustomerOpeningLedger(client, context.branchId, Number(row.customer_id), opening);

      return mapCustomer(row);
    });
  },

  async updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
    scope: BranchScope
  ): Promise<Customer | null> {
    const meta = await detectCustomerColumns();
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.fullName !== undefined) {
      updates.push(`full_name = $${parameter++}`);
      values.push(input.fullName);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${parameter++}`);
      values.push(input.phone ?? null);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${parameter++}`);
      values.push(input.address ?? null);
    }
    if (input.sex !== undefined || input.gender !== undefined) {
      const val = (input.gender ?? input.sex ?? null) as 'male' | 'female' | null;
      updates.push(`sex = $${parameter++}::ims.sex_enum`);
      values.push(val);
      if (meta.hasGender) {
        updates.push(`gender = $${parameter++}`);
        values.push(input.gender ?? input.sex ?? null);
      }
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    // ── FIX (SQLSTATE 42701) ─────────────────────────────────────────────
    // Previously, changing a customer to 'one-time' pushed `credit_allowed
    // = false` from the type-change branch AND again from the standalone
    // `input.creditAllowed !== undefined` branch below, producing:
    //   ERROR: column "credit_allowed" specified more than once
    // Regular updates never hit the first branch, so the duplicate never
    // happened for them. Resolve credit_allowed to a single value once,
    // then push at most one assignment.
    if (input.customerType !== undefined && meta.hasType) {
      updates.push(`customer_type = $${parameter++}`);
      values.push(input.customerType);
    }

    let resolvedCreditAllowed: boolean | undefined;
    if (input.customerType === 'one-time') {
      resolvedCreditAllowed = false;
    } else if (input.creditAllowed !== undefined) {
      resolvedCreditAllowed = input.creditAllowed;
    }
    if (resolvedCreditAllowed !== undefined && meta.hasCreditAllowed) {
      updates.push(`credit_allowed = $${parameter++}`);
      values.push(resolvedCreditAllowed);
    }
    // ─────────────────────────────────────────────────────────────────────

    if (input.creditDays !== undefined && meta.hasCreditDays) {
      updates.push(`credit_days = $${parameter++}`);
      values.push(Math.max(0, Number(input.creditDays ?? 30)));
    }
    if (input.creditLimit !== undefined && meta.hasCreditLimit) {
      updates.push(`credit_limit = $${parameter++}`);
      values.push(input.creditLimit == null ? null : Math.max(0, Number(input.creditLimit)));
    }
    const wantsOpeningUpdate = input.remainingBalance !== undefined;
    const openingAmount = Math.max(0, Number(input.remainingBalance ?? 0));
    if (wantsOpeningUpdate) {
      if (meta.hasOpenBalance) {
        updates.push(`open_balance = $${parameter++}`);
        values.push(openingAmount);
      }
      if (meta.hasRemainingBalance) {
        updates.push(`remaining_balance = $${parameter++}`);
        values.push(openingAmount);
      } else if (!meta.hasOpenBalance) {
        updates.push(`${meta.balanceColumn} = $${parameter++}`);
        values.push(openingAmount);
      }
    }

    if (!updates.length) {
      return scopedCustomer(id, scope);
    }

    values.push(id);
    let whereSql = `customer_id = $${parameter++}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${parameter++})`;
    }

    return withTransaction(async (client) => {
      const branchRow = await client.query<{ branch_id: number; current_balance: string | null }>(
        scope.isAdmin
          ? `SELECT branch_id, ${meta.balanceColumn}::text AS current_balance FROM ims.customers WHERE customer_id = $1`
          : `SELECT branch_id, ${meta.balanceColumn}::text AS current_balance FROM ims.customers WHERE customer_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(branchRow.rows[0]?.branch_id || 0);
      if (!branchId) return null;

      // HIGH-03 fix: this used to allow overwriting remaining_balance once
      // transactions existed as long as any non-empty "reason" string was
      // supplied - not a real guard, since remaining_balance is also raw-set
      // by the dynamic UPDATE below (built from `updates` further up),
      // bypassing upsertCustomerOpeningLedger's ledger-safe adjustment and
      // discarding whatever sales/receipts/returns had since moved the
      // customer's real balance away from the opening figure. Mirrors the
      // supplier side exactly (suppliers.service.ts#updateSupplier), which
      // already hard-rejects any opening-balance change once transactions
      // exist rather than accepting a free-text bypass.
      //
      // Phase 1 fix: the frontend always submits remainingBalance on every
      // save (even when the user only touched phone/name), so gating on
      // "was it present" instead of "did it actually change" blocked ALL
      // edits to any customer with transaction history. Compare against the
      // customer's current balance so an unchanged value never triggers the
      // guard or the ledger rewrite below.
      const currentBalance = Number(branchRow.rows[0]?.current_balance ?? 0);
      const balanceActuallyChanged = wantsOpeningUpdate && Math.abs(openingAmount - currentBalance) > 0.005;
      if (balanceActuallyChanged) {
        const hasTransactions = await hasCustomerNonOpeningLedger(client, branchId, id);
        if (hasTransactions) {
          throw ApiError.badRequest('Customer has transactions; cannot change opening balance');
        }
        await upsertCustomerOpeningLedger(client, branchId, id, openingAmount);
      }

      const rowRes = await client.query<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `UPDATE ims.customers
            SET ${updates.join(', ')}
          WHERE ${whereSql}
          RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${getGenderSelect(meta)}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${getCreditLimitSelect(meta)}, ${meta.balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}`,
        values
      );

      const row = rowRes.rows[0];
      return row ? mapCustomer(row) : null;
    });
  },

  async deleteCustomer(id: number, scope: BranchScope): Promise<void> {
    await withTransaction(async (client) => {
      // Phase 4 (Central Delete Architecture): soft-deletes via sp_soft_delete
      // instead of a hard DELETE, so a customer with real sales/returns/ledger
      // history can be archived - that history is 'preserve'd, completely
      // untouched. Only a nonzero outstanding balance still blocks the delete.
      const row = await client.query<{ branch_id: number }>(
        scope.isAdmin
          ? `SELECT branch_id FROM ims.customers WHERE customer_id = $1`
          : `SELECT branch_id FROM ims.customers WHERE customer_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(row.rows[0]?.branch_id || 0);
      if (!branchId) throw ApiError.notFound('Customer not found');

      const balance = await getCustomerOutstandingBalance(client, branchId, id);
      if (balance > 0.005) {
        throw ApiError.badRequest(`Cannot delete — outstanding balance of ${balance.toFixed(2)} exists. Settle to zero first.`);
      }

      await softDeleteById('customers', id, { runner: client });
    });
  },
};