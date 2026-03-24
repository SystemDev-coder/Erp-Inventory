import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';

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

  if (!amount) return;

  await client.query(
    `INSERT INTO ims.supplier_ledger
      (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
     VALUES
      ($1, $2, 'opening', 'opening_balance', $2, NULL, 0, $3, NOW() - INTERVAL '1 second', $4)`,
    [branchId, supplierId, amount, '[OPENING BALANCE] Set from supplier form']
  );
};

const mapSupplier = (row: {
  supplier_id: number;
  supplier_name_value: string;
  supplier_location_value: string | null;
  phone: string | null;
  supplier_balance_value: string | number;
  is_active: boolean;
  created_at: string;
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
          WHERE supplier_id = $1
            AND branch_id = ANY($2)`,
        [id, scope.branchIds]
      );

  return row ? mapSupplier(row) : null;
};

export const suppliersService = {
  async listSuppliers(
    scope: BranchScope,
    search?: string,
    dateRange?: { fromDate?: string; toDate?: string }
  ): Promise<Supplier[]> {
    const shape = await detectSupplierShape();
    const params: unknown[] = [];
    const where: string[] = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`branch_id = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(${shape.nameColumn} ILIKE $${params.length} OR COALESCE(${shape.locationColumn}, '') ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
      );
    }

    if (dateRange?.fromDate && dateRange?.toDate) {
      params.push(dateRange.fromDate);
      where.push(`created_at::date >= $${params.length}::date`);
      params.push(dateRange.toDate);
      where.push(`created_at::date <= $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
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
        ORDER BY ${shape.nameColumn}`,
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
      const branchRow = await client.query<{ branch_id: number }>(
        scope.isAdmin
          ? `SELECT branch_id FROM ims.suppliers WHERE supplier_id = $1`
          : `SELECT branch_id FROM ims.suppliers WHERE supplier_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(branchRow.rows[0]?.branch_id || 0);
      if (!branchId) return null;

      if (wantsOpeningUpdate) {
        if (await hasSupplierNonOpeningLedger(client, branchId, id)) {
          throw ApiError.badRequest('Supplier has transactions; cannot change opening balance');
        }
        await upsertSupplierOpeningLedger(
          client,
          branchId,
          id,
          Math.max(0, Number(input.remainingBalance ?? 0))
        );
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
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.suppliers WHERE supplier_id = $1`, [id]);
      return;
    }

    await queryOne(
      `DELETE FROM ims.suppliers
        WHERE supplier_id = $1
          AND branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },
};
