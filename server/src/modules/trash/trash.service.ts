import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';

const SCHEMA = 'ims';

type TrashModule = {
  key: string;
  label: string;
  table: string;
  filter?: { column: string; value: string };
};

const MODULES: TrashModule[] = [
  { key: 'customers', label: 'Customers', table: 'customers' },
  { key: 'sales', label: 'Sales', table: 'sales' },
  { key: 'items', label: 'Items', table: 'items' },
  { key: 'items_state', label: 'Items State', table: 'store_items' },
  { key: 'inventory_transaction', label: 'Inventory Transactions', table: 'inventory_transaction' },
  { key: 'stores', label: 'Stores', table: 'stores' },
  { key: 'adjustment_items', label: 'Adjustment Items', table: 'stock_adjustment' },
  { key: 'sales_returns', label: 'Sales Returns', table: 'sales_returns' },
  { key: 'supplier_returns', label: 'Supplier Returns', table: 'purchase_returns' },
  { key: 'purchases', label: 'Purchases', table: 'purchases' },
  { key: 'suppliers', label: 'Suppliers', table: 'suppliers' },
  { key: 'quotations', label: 'Quotations', table: 'sales', filter: { column: 'doc_type', value: 'quotation' } },
  { key: 'accounts', label: 'Accounts', table: 'accounts' },
  { key: 'customer_receipts', label: 'Customer Receipts', table: 'customer_receipts' },
  { key: 'supplier_receipts', label: 'Supplier Receipts', table: 'supplier_receipts' },
  { key: 'expenses', label: 'Expenses', table: 'expenses' },
  { key: 'expense_charges', label: 'Expense Charges', table: 'expense_charges' },
  { key: 'employee_payments', label: 'Employee Payments', table: 'employee_payments' },
  { key: 'employees', label: 'Employees', table: 'employees' },
  { key: 'users', label: 'Users', table: 'users' },
  { key: 'roles', label: 'Roles', table: 'roles' },
  { key: 'company', label: 'Company', table: 'company' },
  { key: 'capital', label: 'Capital Contributions', table: 'capital_contributions' },
  { key: 'drawings', label: 'Owner Drawings', table: 'owner_drawings' },
  { key: 'fixed_assets', label: 'Fixed Assets', table: 'fixed_assets' },
];
const MODULE_BY_KEY = new Map(MODULES.map((module) => [module.key, module]));

const getTableColumns = async (table: string) => {
  const rows = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2`,
    [SCHEMA, table]
  );
  return new Set(rows.map((row) => row.column_name));
};

const getPkColumn = async (table: string) => {
  const row = await queryOne<{ column_name: string }>(
    `SELECT a.attname AS column_name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.indisprimary
        AND n.nspname = $1
        AND c.relname = $2
      ORDER BY a.attnum
      LIMIT 1`,
    [SCHEMA, table]
  );
  return row?.column_name || null;
};

const resolveModule = (key: string) => {
  const module = MODULE_BY_KEY.get(key);
  if (!module) {
    throw ApiError.badRequest('Invalid module');
  }
  return module;
};

const ensureTrashTable = async (table: string) => {
  const exists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
    ) AS exists`,
    [SCHEMA, table]
  );
  if (!exists?.exists) {
    throw ApiError.badRequest('Invalid table');
  }
  const hasDeleted = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = 'is_deleted'
    ) AS exists`,
    [SCHEMA, table]
  );
  if (!hasDeleted?.exists) {
    throw ApiError.badRequest('Trash not enabled for this table');
  }
};

const pickLabelColumn = (columns: Set<string>) => {
  const candidates = [
    'name',
    'full_name',
    'title',
    'description',
    'code',
    'reference_no',
    'username',
    'email',
    'phone',
  ];
  for (const key of candidates) {
    if (columns.has(key)) return key;
  }
  return null;
};

export const trashService = {
  async listTables() {
    const rows = await queryMany<{ table_name: string }>(
      `SELECT DISTINCT table_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND column_name = 'is_deleted'
        ORDER BY table_name`,
      [SCHEMA]
    );
    const available = new Set(rows.map((row) => row.table_name));
    const modules: Array<{ key: string; label: string }> = [];
    for (const module of MODULES) {
      if (!available.has(module.table)) continue;
      if (module.filter) {
        const columns = await getTableColumns(module.table);
        if (!columns.has(module.filter.column)) continue;
      }
      modules.push({ key: module.key, label: module.label });
    }
    return { tables: modules.map((module) => module.key), modules };
  },

  async listDeleted(table: string, options: { fromDate?: string; toDate?: string; limit?: number; offset?: number; branchId?: number }) {
    const module = resolveModule(table);
    await ensureTrashTable(module.table);
    if (!options.fromDate || !options.toDate) {
      throw ApiError.badRequest('Please select a From Date and To Date');
    }
    const columns = await getTableColumns(module.table);
    const pkCol = await getPkColumn(module.table);
    if (!pkCol) throw ApiError.badRequest('Primary key not found');
    if (module.filter && !columns.has(module.filter.column)) {
      throw ApiError.badRequest('Invalid module');
    }

    const labelCol = pickLabelColumn(columns);
    const dateCol = columns.has('deleted_at')
      ? 'deleted_at'
      : columns.has('updated_at')
      ? 'updated_at'
      : columns.has('created_at')
      ? 'created_at'
      : null;

    if (!dateCol) {
      throw ApiError.badRequest('This table does not support date filtering');
    }

    const where: string[] = ['is_deleted = 1'];
    const params: any[] = [];
    if (module.filter) {
      params.push(module.filter.value);
      where.push(`${module.filter.column}::text = $${params.length}`);
    }
    if (options.branchId && columns.has('branch_id')) {
      params.push(options.branchId);
      where.push(`branch_id = $${params.length}`);
    }
    params.push(options.fromDate);
    where.push(`${dateCol}::date >= $${params.length}::date`);
    params.push(options.toDate);
    where.push(`${dateCol}::date <= $${params.length}::date`);
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
    const offset = Math.max(Number(options.offset || 0), 0);

    const tableParamIndex = params.length + 1;
    params.push(module.key);
    const limitParamIndex = params.length + 1;
    params.push(limit);
    const offsetParamIndex = params.length + 1;
    params.push(offset);

    const labelExpr = labelCol ? `${labelCol}::text` : `${pkCol}::text`;
    const deletedExpr = dateCol ? `${dateCol}::text` : 'NULL::text';
    const createdExpr = columns.has('created_at') ? 'created_at::text' : 'NULL::text';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.include_deleted = '1'`);
      const data = await client.query(
        `SELECT ${pkCol}::bigint AS id,
                ${labelExpr} AS label,
                ${deletedExpr} AS deleted_at,
                ${createdExpr} AS created_at,
                $${tableParamIndex}::text AS table
           FROM ${SCHEMA}.${module.table}
          WHERE ${where.join(' AND ')}
          ORDER BY ${dateCol || pkCol} DESC
          LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
        params
      );
      const count = await client.query(
        `SELECT COUNT(*)::int AS total
           FROM ${SCHEMA}.${module.table}
          WHERE ${where.join(' AND ')}`,
        params.slice(0, tableParamIndex - 1)
      );
      await client.query('COMMIT');
      return { rows: data.rows, total: Number(count.rows[0]?.total || 0) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async restore(table: string, id: number, userId?: number | null) {
    const module = resolveModule(table);
    await ensureTrashTable(module.table);
    if (module.filter) {
      const columns = await getTableColumns(module.table);
      const pkCol = await getPkColumn(module.table);
      if (!pkCol || !columns.has(module.filter.column)) {
        throw ApiError.badRequest('Invalid module');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.include_deleted = '1'`);
        const check = await client.query(
          `SELECT 1
             FROM ${SCHEMA}.${module.table}
            WHERE ${pkCol} = $1
              AND ${module.filter.column}::text = $2
            LIMIT 1`,
          [id, module.filter.value]
        );
        await client.query('COMMIT');
        if (check.rowCount === 0) {
          throw ApiError.badRequest('Record not found');
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const result = await queryOne<{ success: boolean; message: string }>(
      `SELECT * FROM ${SCHEMA}.sp_restore($1, $2, $3)`,
      [module.table, id, userId ?? null]
    );
    if (!result?.success) {
      throw ApiError.badRequest(result?.message || 'Failed to restore record');
    }
    return result;
  },
};
