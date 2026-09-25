import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { offsetOf, type Paged } from '../../utils/pagination';
import { deleteGlByRef, ensureCoreCoa, postGl } from '../../utils/glPosting';
import { syncSystemAccountBalancesWithClient } from '../../utils/systemAccounts';
import { softDeleteById } from '../../db/softDelete';

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  company_name: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  phone: string | null;
  address: string | null;
  location: string | null;
  remaining_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  has_transactions: boolean;
}

export interface SupplierInput {
  supplierName: string;
  companyName?: string;
  contactPerson?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  location?: string;
  remainingBalance?: number;
  isActive?: boolean;
}

type SupplierSchemaShape = {
  nameColumn: 'name' | 'supplier_name';
  balanceColumn: 'open_balance' | 'remaining_balance';
  locationColumn: 'country' | 'location' | 'company_name';
};

let supplierShape: SupplierSchemaShape | null = null;

const detectSupplierShape = async (): Promise<SupplierSchemaShape> => {
  if (supplierShape) return supplierShape;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'suppliers'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  supplierShape = {
    nameColumn: names.has('name') ? 'name' : 'supplier_name',
    // Prefer `remaining_balance` as the live outstanding; keep `open_balance` as opening balance.
    balanceColumn: names.has('remaining_balance') ? 'remaining_balance' : 'open_balance',
    locationColumn: names.has('country')
      ? 'country'
      : names.has('location')
      ? 'location'
      : 'company_name',
  };

  return supplierShape;
};

// Mirrors hasSupplierNonOpeningLedger's predicate exactly, so the UI's
// disabled state and the server-side save-time guard never disagree
// (see customers.service.ts#HAS_TRANSACTIONS_SELECT, Phase 1).
const HAS_TRANSACTIONS_SELECT = `EXISTS (
  SELECT 1 FROM ims.supplier_ledger sl
   WHERE sl.branch_id = suppliers.branch_id
     AND sl.supplier_id = suppliers.supplier_id
     AND NOT (sl.entry_type = 'opening' AND sl.ref_table = 'opening_balance')
) AS has_transactions`;

const hasSupplierNonOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  supplierId: number
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.supplier_ledger
        WHERE branch_id = $1
          AND supplier_id = $2
          AND NOT (entry_type = 'opening' AND ref_table = 'opening_balance')
     ) AS exists`,
    [branchId, supplierId]
  );
  return Boolean(result.rows[0]?.exists);
};

// Phase 4 (Central Delete Architecture): deleteSupplier below now soft-deletes
// via ims.sp_soft_delete, which lets a supplier with real purchase/return/
// ledger history be archived (that history is 'preserve'd, untouched - see
// server/sql/20260923_customer_supplier_delete_policy.sql). The one thing the
// generic policy engine can't express is "outstanding balance must be zero" -
// mirrors getCustomerOutstandingBalance from Phase 4 / getProductStockOnHand
// from Phase 3.
const getSupplierOutstandingBalance = async (
  client: PoolClient,
  branchId: number,
  supplierId: number
): Promise<number> => {
  const shape = await detectSupplierShape();
  const balanceRow = await client.query<{ balance: string }>(
    `SELECT COALESCE(${shape.balanceColumn}, 0)::text AS balance
       FROM ims.suppliers
      WHERE supplier_id = $1
        AND branch_id = $2`,
    [supplierId, branchId]
  );
  return Math.abs(Number(balanceRow.rows[0]?.balance || 0));
};

const upsertSupplierOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  supplierId: number,
  amount: number
) => {
  await client.query(
    `DELETE FROM ims.supplier_ledger
      WHERE branch_id = $1
        AND supplier_id = $2
        AND entry_type = 'opening'
        AND ref_table = 'opening_balance'`,
    [branchId, supplierId]
  );

  const coa = await ensureCoreCoa(client, branchId, ['accountsPayable', 'openingBalanceEquity']);
  // H4 fix: reverse this ref's previous Opening Balance Equity contribution
  // to accounts.balance before the old GL rows are deleted below - it was
  // never mirrored into accounts.balance at all, so re-edits accumulated
  // stale GL-only value. Accounts Payable is deliberately left out here;
  // it's resynced from the ledger at the end of this function.
  const priorObeRows = await client.query<{ debit: string; credit: string }>(
    `SELECT debit, credit FROM ims.account_transactions
      WHERE branch_id = $1 AND ref_table = 'opening_balance' AND ref_id = $2
        AND acc_id = $3 AND COALESCE(is_deleted, 0) = 0`,
    [branchId, supplierId, coa.openingBalanceEquity]
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
  // opening-balance journal entry for this supplier, then re-post it if the
  // new amount is non-zero, so Accounts Payable never drifts from what the
  // supplier's balance edit form shows.
  await deleteGlByRef(client, { branchId, refTable: 'opening_balance', refId: supplierId });

  if (amount) {
    await client.query(
      `INSERT INTO ims.supplier_ledger
        (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
       VALUES
        ($1, $2, 'opening', 'opening_balance', $2, NULL, 0, $3, NOW() - INTERVAL '1 second', $4)`,
      [branchId, supplierId, amount, '[OPENING BALANCE] Set from supplier form']
    );

    await postGl(client, {
      branchId,
      refTable: 'opening_balance',
      refId: supplierId,
      note: 'Supplier opening/adjusted balance',
      lines: [
        { accId: coa.openingBalanceEquity, debit: amount, credit: 0, note: 'Opening balance equity' },
        { accId: coa.accountsPayable, debit: 0, credit: amount, note: 'Supplier payable (opening/adjusted)' },
      ],
    });
    // H4 fix: Opening Balance Equity debit above was never mirrored into
    // accounts.balance. Equity - debit decreases it.
    await client.query(`UPDATE ims.accounts SET balance = balance - $1 WHERE acc_id = $2 AND branch_id = $3`, [
      amount,
      coa.openingBalanceEquity,
      branchId,
    ]);
  }

  // The Balance Sheet reads the "Accounts Payable" system account's stored
  // balance directly (it doesn't re-derive it from account_transactions), and
  // that balance is otherwise only kept current by a periodic background
  // sync. Resync it synchronously, in this same transaction, so the Balance
  // Sheet never shows a stale figure between the ledger edit and the next
  // scheduled sync.
  await syncSystemAccountBalancesWithClient(client, branchId);
};

const mapSupplier = (row: {
  supplier_id: number;
  supplier_name_value: string;
  supplier_location_value: string | null;
  phone: string | null;
  supplier_balance_value: string | number;
  is_active: boolean;
  created_at: string;
  has_transactions?: boolean | null;
}): Supplier => ({
  supplier_id: Number(row.supplier_id),
  supplier_name: row.supplier_name_value,
  company_name: row.supplier_location_value,
  contact_person: null,
  contact_phone: null,
  phone: row.phone,
  address: null,
  location: row.supplier_location_value,
  remaining_balance: Number(row.supplier_balance_value || 0),
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
  updated_at: null,
  has_transactions: Boolean(row.has_transactions),
});

const scopedSupplier = async (
  id: number,
  scope: BranchScope
): Promise<Supplier | null> => {
  const shape = await detectSupplierShape();
  const row = scope.isAdmin
    ? await queryOne<{
        supplier_id: number;
        supplier_name_value: string;
        supplier_location_value: string | null;
        phone: string | null;
        supplier_balance_value: string;
        is_active: boolean;
        created_at: string;
        has_transactions: boolean;
      }>(
        `SELECT
            supplier_id,
            ${shape.nameColumn} AS supplier_name_value,
            ${shape.locationColumn} AS supplier_location_value,
            phone,
            ${shape.balanceColumn}::text AS supplier_balance_value,
            is_active,
            created_at::text,
            ${HAS_TRANSACTIONS_SELECT}
           FROM ims.suppliers
          WHERE supplier_id = $1`,
        [id]
      )
    : await queryOne<{
        supplier_id: number;
        supplier_name_value: string;
        supplier_location_value: string | null;
        phone: string | null;
        supplier_balance_value: string;
        is_active: boolean;
        created_at: string;
        has_transactions: boolean;
      }>(
        `SELECT
            supplier_id,
            ${shape.nameColumn} AS supplier_name_value,
            ${shape.locationColumn} AS supplier_location_value,
            phone,
            ${shape.balanceColumn}::text AS supplier_balance_value,
            is_active,
            created_at::text,
            ${HAS_TRANSACTIONS_SELECT}
           FROM ims.suppliers
          WHERE supplier_id = $1
            AND branch_id = ANY($2)`,
        [id, scope.branchIds]
      );

  return row ? mapSupplier(row) : null;
};

export const suppliersService = {
  async listSuppliers(
    branchIds: number[],
    search?: string,
    dateRange?: { fromDate?: string; toDate?: string },
    pagination?: { page: number; limit: number }
  ): Promise<Paged<Supplier>> {
    const shape = await detectSupplierShape();
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
        `(${shape.nameColumn} ILIKE $${params.length} OR COALESCE(${shape.locationColumn}, '') ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
      );
    }

    if (dateRange?.fromDate) {
      params.push(dateRange.fromDate);
      where.push(`created_at::date >= $${params.length}::date`);
    }
    if (dateRange?.toDate) {
      params.push(dateRange.toDate);
      where.push(`created_at::date <= $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.suppliers ${whereSql}`,
      params
    );

    const rows = await queryMany<{
      supplier_id: number;
      supplier_name_value: string;
      supplier_location_value: string | null;
      phone: string | null;
      supplier_balance_value: string;
      is_active: boolean;
      created_at: string;
      has_transactions: boolean;
    }>(
      `SELECT
          supplier_id,
          ${shape.nameColumn} AS supplier_name_value,
          ${shape.locationColumn} AS supplier_location_value,
          phone,
          ${shape.balanceColumn}::text AS supplier_balance_value,
          is_active,
          created_at::text,
          ${HAS_TRANSACTIONS_SELECT}
         FROM ims.suppliers
         ${whereSql}
        ORDER BY ${shape.nameColumn}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offsetOf(page, limit)]
    );

    return {
      rows: rows.map(mapSupplier),
      total: Number(countRow?.total || 0),
      page,
      limit,
    };
  },

  async lookupSuppliers(branchIds: number[], search?: string, limit = 50): Promise<Supplier[]> {
    const shape = await detectSupplierShape();
    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));

    const params: unknown[] = [branchIds];

    // UPDATED: Explicitly hide soft-deleted rows even when DB user bypasses RLS (e.g., postgres/superuser).
    const where: string[] = [`branch_id = ANY($1)`, `is_active = TRUE`, `COALESCE(is_deleted, 0)::int = 0`];

    const q = String(search || '').trim();
    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(${shape.nameColumn} ILIKE $${params.length} OR COALESCE(${shape.locationColumn}, '') ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
      );
    }

    params.push(safeLimit);
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const rows = await queryMany<{
      supplier_id: number;
      supplier_name_value: string;
      supplier_location_value: string | null;
      phone: string | null;
      supplier_balance_value: string;
      is_active: boolean;
      created_at: string;
    }>(
      `SELECT
          supplier_id,
          ${shape.nameColumn} AS supplier_name_value,
          ${shape.locationColumn} AS supplier_location_value,
          phone,
          ${shape.balanceColumn}::text AS supplier_balance_value,
          is_active,
          created_at::text
         FROM ims.suppliers
         ${whereSql}
        ORDER BY ${shape.nameColumn}
        LIMIT $${params.length}`,
      params
    );

    return rows.map(mapSupplier);
  },

  async getSupplier(id: number, scope: BranchScope): Promise<Supplier | null> {
    return scopedSupplier(id, scope);
  },

  async createSupplier(
    input: SupplierInput,
    context: { branchId: number }
  ): Promise<Supplier> {
    const shape = await detectSupplierShape();
    const existing = await queryOne<{ supplier_id: number }>(
      `SELECT supplier_id
         FROM ims.suppliers
        WHERE branch_id = $1
          AND LOWER(${shape.nameColumn}) = LOWER($2)
        LIMIT 1`,
      [context.branchId, input.supplierName]
    );
    if (existing) {
      throw ApiError.conflict('Supplier name already exists');
    }

    const opening = Math.max(0, Number(input.remainingBalance ?? 0));

    return withTransaction(async (client) => {
      const rowRes = await client.query<{
        supplier_id: number;
        supplier_name_value: string;
        supplier_location_value: string | null;
        phone: string | null;
        supplier_balance_value: string;
        is_active: boolean;
        created_at: string;
      }>(
        `INSERT INTO ims.suppliers (branch_id, ${shape.nameColumn}, ${shape.locationColumn}, phone, ${shape.balanceColumn}, is_active)
         VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, TRUE))
         RETURNING
           supplier_id,
           ${shape.nameColumn} AS supplier_name_value,
           ${shape.locationColumn} AS supplier_location_value,
           phone,
           ${shape.balanceColumn}::text AS supplier_balance_value,
           is_active,
           created_at::text`,
        [
          context.branchId,
          input.supplierName,
          input.companyName ?? input.location ?? null,
          input.phone ?? input.contactPhone ?? null,
          opening,
          input.isActive ?? true,
        ]
      );

      const row = rowRes.rows[0];
      if (!row) {
        throw ApiError.internal('Failed to create supplier');
      }

      await upsertSupplierOpeningLedger(client, context.branchId, Number(row.supplier_id), opening);
      return mapSupplier(row);
    });
  },

  async updateSupplier(
    id: number,
    input: Partial<SupplierInput>,
    scope: BranchScope
  ): Promise<Supplier | null> {
    const shape = await detectSupplierShape();
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.supplierName !== undefined) {
      updates.push(`${shape.nameColumn} = $${parameter++}`);
      values.push(input.supplierName);
    }
    if (input.companyName !== undefined || input.location !== undefined) {
      updates.push(`${shape.locationColumn} = $${parameter++}`);
      values.push(input.companyName ?? input.location ?? null);
    }
    if (input.phone !== undefined || input.contactPhone !== undefined) {
      updates.push(`phone = $${parameter++}`);
      values.push(input.phone ?? input.contactPhone ?? null);
    }
    const wantsOpeningUpdate = input.remainingBalance !== undefined;
    if (wantsOpeningUpdate) {
      updates.push(`${shape.balanceColumn} = $${parameter++}`);
      values.push(Math.max(0, Number(input.remainingBalance ?? 0)));
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      return scopedSupplier(id, scope);
    }

    values.push(id);
    let whereSql = `supplier_id = $${parameter++}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${parameter++})`;
    }

    return withTransaction(async (client) => {
      const branchRow = await client.query<{ branch_id: number; current_balance: string | null }>(
        scope.isAdmin
          ? `SELECT branch_id, ${shape.balanceColumn}::text AS current_balance FROM ims.suppliers WHERE supplier_id = $1`
          : `SELECT branch_id, ${shape.balanceColumn}::text AS current_balance FROM ims.suppliers WHERE supplier_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(branchRow.rows[0]?.branch_id || 0);
      if (!branchId) return null;

      // Phase 4 fix: mirrors customers.service.ts#updateCustomer (Phase 1) -
      // the frontend submits remainingBalance on every save regardless of
      // whether the user touched it, so gating on "was it present" instead of
      // "did it actually change" blocked ALL edits to any supplier with
      // ledger history. Compare against the supplier's current balance so an
      // unchanged value never triggers the guard or the ledger rewrite below.
      const currentBalance = Number(branchRow.rows[0]?.current_balance ?? 0);
      const openingAmount = Math.max(0, Number(input.remainingBalance ?? 0));
      const balanceActuallyChanged = wantsOpeningUpdate && Math.abs(openingAmount - currentBalance) > 0.005;

      if (balanceActuallyChanged) {
        if (await hasSupplierNonOpeningLedger(client, branchId, id)) {
          throw ApiError.badRequest('Supplier has transactions; cannot change opening balance');
        }
        await upsertSupplierOpeningLedger(client, branchId, id, openingAmount);
      }

      const rowRes = await client.query<{
        supplier_id: number;
        supplier_name_value: string;
        supplier_location_value: string | null;
        phone: string | null;
        supplier_balance_value: string;
        is_active: boolean;
        created_at: string;
      }>(
        `UPDATE ims.suppliers
            SET ${updates.join(', ')}
          WHERE ${whereSql}
          RETURNING
            supplier_id,
            ${shape.nameColumn} AS supplier_name_value,
            ${shape.locationColumn} AS supplier_location_value,
            phone,
            ${shape.balanceColumn}::text AS supplier_balance_value,
            is_active,
            created_at::text`,
        values
      );

      const row = rowRes.rows[0];
      return row ? mapSupplier(row) : null;
    });
  },

  async deleteSupplier(id: number, scope: BranchScope): Promise<void> {
    await withTransaction(async (client) => {
      const supplierRow = scope.isAdmin
        ? await client.query<{ supplier_id: number; branch_id: number }>(
            `SELECT supplier_id, branch_id
               FROM ims.suppliers
              WHERE supplier_id = $1`,
            [id]
          )
        : await client.query<{ supplier_id: number; branch_id: number }>(
            `SELECT supplier_id, branch_id
               FROM ims.suppliers
              WHERE supplier_id = $1
                AND branch_id = ANY($2)`,
            [id, scope.branchIds]
          );

      const supplier = supplierRow.rows[0];
      if (!supplier) return;

      const branchId = Number(supplier.branch_id || 0);
      const balance = await getSupplierOutstandingBalance(client, branchId, id);
      if (balance > 0.005) {
        throw ApiError.badRequest(`Cannot delete — outstanding balance of ${balance.toFixed(2)} exists. Settle to zero first.`);
      }

      await softDeleteById('suppliers', id, { runner: client });
    });
  },
};
