import { pool } from '../../db/pool';
import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';

const SCHEMA = 'ims';

type TrashModule = {
  key: string;
  label: string;
  table: string;
  filter?: { column: string; value: string; op?: 'eq' | 'neq' };
  auditEntity?: string;
};

type TrashRowDb = {
  id: number;
  label: string;
  deleted_at: string | null;
  created_at: string | null;
  module_key: string | null;
  deleted_by_id: number | null;
  deleted_by: string | null;
  deleted_logged_at: string | null;
};

type TrashRow = Omit<TrashRowDb, 'module_key'> & { table: string };

type AuditLogColumns = {
  actionColumn: string;
  entityColumn: string;
  entityIdColumn: string;
  createdAtColumn: string;
};

let auditLogColumnsCache: AuditLogColumns | null = null;

const MODULES: TrashModule[] = [
  { key: 'customers', label: 'Customers', table: 'customers' },
  { key: 'sales', label: 'Sales', table: 'sales', filter: { column: 'doc_type', value: 'quotation', op: 'neq' }, auditEntity: 'sales' },
  { key: 'items', label: 'Items', table: 'items' },
  { key: 'items_state', label: 'Items State', table: 'store_items', auditEntity: 'store_items' },
  { key: 'inventory_transaction', label: 'Inventory Transactions', table: 'inventory_transaction' },
  { key: 'stores', label: 'Stores', table: 'stores' },
  { key: 'adjustment_items', label: 'Adjustment Items', table: 'stock_adjustment', auditEntity: 'stock_adjustment' },
  { key: 'sales_returns', label: 'Sales Returns', table: 'sales_returns' },
  { key: 'supplier_returns', label: 'Supplier Returns', table: 'purchase_returns', auditEntity: 'purchase_returns' },
  { key: 'purchases', label: 'Purchases', table: 'purchases' },
  { key: 'suppliers', label: 'Suppliers', table: 'suppliers' },
  { key: 'quotations', label: 'Quotations', table: 'sales', filter: { column: 'doc_type', value: 'quotation' }, auditEntity: 'sales' },
  { key: 'other_income', label: 'Other Income', table: 'other_incomes' },
  { key: 'customer_receipts', label: 'Customer Receipts', table: 'customer_receipts' },
  { key: 'supplier_receipts', label: 'Supplier Receipts', table: 'supplier_receipts' },
  { key: 'expenses', label: 'Expenses', table: 'expenses' },
  { key: 'expense_charges', label: 'Expense Charges', table: 'expense_charges' },
  { key: 'employee_payments', label: 'Employee Payments', table: 'employee_payments' },
  { key: 'employees', label: 'Employees', table: 'employees' },
  { key: 'users', label: 'Users', table: 'users' },
  { key: 'roles', label: 'Roles', table: 'roles' },
  { key: 'company', label: 'Company', table: 'company', auditEntity: 'company_info' },
  { key: 'capital', label: 'Capital Contributions', table: 'capital_contributions' },
  { key: 'drawings', label: 'Owner Drawings', table: 'owner_drawings' },
  { key: 'assets', label: 'Assets', table: 'assets' },
  { key: 'fixed_assets', label: 'Fixed Assets', table: 'fixed_assets' },
];
const MODULE_BY_KEY = new Map(MODULES.map((module) => [module.key, module]));

const detectAuditLogColumns = async (): Promise<AuditLogColumns | null> => {
  if (auditLogColumnsCache) return auditLogColumnsCache;

  const exists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'audit_logs'
     ) AS exists`,
    [SCHEMA]
  );
  if (!exists?.exists) return null;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'audit_logs'`,
    [SCHEMA]
  );
  const names = new Set(columns.map((row) => row.column_name));

  auditLogColumnsCache = {
    actionColumn: names.has('action_type') ? 'action_type' : 'action',
    entityColumn: names.has('table_name') ? 'table_name' : 'entity',
    entityIdColumn: names.has('record_id') ? 'record_id' : 'entity_id',
    createdAtColumn: 'created_at',
  };

  return auditLogColumnsCache;
};

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

const buildFilterPredicate = (filter: TrashModule['filter'], placeholder: string) => {
  if (!filter) return '';
  const op = filter.op || 'eq';
  if (op === 'neq') {
    return `COALESCE(t.${filter.column}::text, '') <> ${placeholder}::text`;
  }
  return `t.${filter.column}::text = ${placeholder}::text`;
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

  async listDeleted(
    table: string | undefined,
    options: { fromDate?: string; toDate?: string; limit?: number; offset?: number; branchId?: number }
  ) {
    if (!options.fromDate || !options.toDate) {
      throw ApiError.badRequest('Please select a From Date and To Date');
    }

    // Backward-compatible: when module key is provided, return that module only.
    if (table) {
      const module = resolveModule(table);
      await ensureTrashTable(module.table);

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

      const auditCols = await detectAuditLogColumns();

      const where: string[] = ["(COALESCE(to_jsonb(t)->>'is_deleted','0') IN ('1','true','t','TRUE','T'))"];
      const params: any[] = [];
      if (module.filter) {
        params.push(module.filter.value);
        where.push(buildFilterPredicate(module.filter, `$${params.length}`));
      }
      if (columns.has('branch_id')) {
        params.push(options.branchId ?? null);
        where.push(`($${params.length}::bigint IS NULL OR t.branch_id = $${params.length})`);
      }
      params.push(options.fromDate);
      where.push(`t.${dateCol}::date >= $${params.length}::date`);
      params.push(options.toDate);
      where.push(`t.${dateCol}::date <= $${params.length}::date`);
      const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
      const offset = Math.max(Number(options.offset || 0), 0);

      const tableParamIndex = params.length + 1;
      params.push(module.key);
      const limitParamIndex = params.length + 1;
      params.push(limit);
      const offsetParamIndex = params.length + 1;
      params.push(offset);

      const auditEntityParamIndex = params.length + 1;
      params.push(module.auditEntity || module.key);

      const labelExpr = labelCol ? `t.${labelCol}::text` : `t.${pkCol}::text`;
      const deletedExpr = dateCol ? `t.${dateCol}::text` : 'NULL::text';
      const createdExpr = columns.has('created_at') ? 't.created_at::text' : 'NULL::text';

      const auditJoinSql = auditCols
        ? `LEFT JOIN LATERAL (`
            + ` SELECT al.user_id::bigint AS deleted_by_id,`
            + `        u.username::text AS deleted_by,`
            + `        al.${auditCols.createdAtColumn}::text AS deleted_logged_at`
            + `   FROM ${SCHEMA}.audit_logs al`
            + `   LEFT JOIN ${SCHEMA}.users u ON u.user_id = al.user_id`
            + `  WHERE LOWER(COALESCE(al.${auditCols.actionColumn}::text, '')) = 'delete'`
            + `    AND COALESCE(al.${auditCols.entityColumn}::text, '') = $${auditEntityParamIndex}::text`
            + `    AND al.${auditCols.entityIdColumn}::bigint = t.${pkCol}::bigint`
            + `  ORDER BY al.${auditCols.createdAtColumn} DESC`
            + `  LIMIT 1`
            + ` ) aud ON TRUE`
        : `LEFT JOIN LATERAL (`
            + ` SELECT NULL::bigint AS deleted_by_id, NULL::text AS deleted_by, NULL::text AS deleted_logged_at`
            + ` ) aud ON TRUE`;
      const auditSelectSql = `, aud.deleted_by_id, aud.deleted_by, aud.deleted_logged_at`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.include_deleted = '1'`);
	        const data = await client.query<TrashRowDb>(
	          `SELECT t.${pkCol}::bigint AS id,
	                  ${labelExpr} AS label,
	                  ${deletedExpr} AS deleted_at,
	                  ${createdExpr} AS created_at,
	                  $${tableParamIndex}::text AS module_key
	                  ${auditSelectSql}
	             FROM ${SCHEMA}.${module.table} t
	             ${auditJoinSql}
	            WHERE ${where.join(' AND ')}
	            ORDER BY t.${dateCol || pkCol} DESC
	            LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
	          params
	        );
        const count = await client.query(
          `SELECT COUNT(*)::int AS total
             FROM ${SCHEMA}.${module.table} t
            WHERE ${where.join(' AND ')}`,
          params.slice(0, tableParamIndex - 1)
	        );
	        await client.query('COMMIT');
	        return {
	          rows: data.rows.map(
	            (row): TrashRow => ({
	              id: Number(row.id),
	              label: String(row.label ?? ''),
	              deleted_at: row.deleted_at ?? null,
	              created_at: row.created_at ?? null,
	              table: String(row.module_key ?? module.key),
	              deleted_by_id: row.deleted_by_id ?? null,
	              deleted_by: row.deleted_by ?? null,
	              deleted_logged_at: row.deleted_logged_at ?? null,
	            })
	          ),
	          total: Number(count.rows[0]?.total || 0),
	        };
	      } catch (error) {
	        await client.query('ROLLBACK');
	        throw error;
      } finally {
        client.release();
      }
    }

    // New behavior: no module selected -> list deleted records across all modules within date range.
    const fromDate = options.fromDate;
    const toDate = options.toDate;
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
    const offset = Math.max(Number(options.offset || 0), 0);

    const auditCols = await detectAuditLogColumns();

    const tablesWithTrash = await queryMany<{ table_name: string }>(
      `SELECT DISTINCT table_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND column_name = 'is_deleted'`,
      [SCHEMA]
    );
    const enabledTables = new Set(tablesWithTrash.map((r) => r.table_name));

    const dataParams: any[] = [fromDate, toDate, options.branchId ?? null];
    const countParams: any[] = [fromDate, toDate, options.branchId ?? null];

    const dataSelects: string[] = [];
    const countSelects: string[] = [];

    for (const module of MODULES) {
      if (!enabledTables.has(module.table)) continue;
      const columns = await getTableColumns(module.table);
      if (module.filter && !columns.has(module.filter.column)) continue;
      const pkCol = await getPkColumn(module.table);
      if (!pkCol) continue;

      const dateCol = columns.has('deleted_at')
        ? 'deleted_at'
        : columns.has('updated_at')
        ? 'updated_at'
        : columns.has('created_at')
        ? 'created_at'
        : null;
      if (!dateCol) continue;

      const labelCol = pickLabelColumn(columns);
      const labelExpr = labelCol ? `t.${labelCol}::text` : `t.${pkCol}::text`;
      const createdExpr = columns.has('created_at') ? 't.created_at::text' : 'NULL::text';

      const wherePartsData: string[] = [
        "(COALESCE(to_jsonb(t)->>'is_deleted','0') IN ('1','true','t','TRUE','T'))",
        `t.${dateCol}::date BETWEEN $1::date AND $2::date`,
      ];
      const wherePartsCount = [...wherePartsData];

      if (columns.has('branch_id')) {
        wherePartsData.push(`($3::bigint IS NULL OR t.branch_id = $3)`);
        wherePartsCount.push(`($3::bigint IS NULL OR t.branch_id = $3)`);
      }

      let filterClauseData = '';
      let filterClauseCount = '';
      if (module.filter) {
        const pData = `$${dataParams.length + 1}`;
        dataParams.push(module.filter.value);
        filterClauseData = buildFilterPredicate(module.filter, pData);

        const pCount = `$${countParams.length + 1}`;
        countParams.push(module.filter.value);
        filterClauseCount = buildFilterPredicate(module.filter, pCount);
      }
      if (filterClauseData) wherePartsData.push(filterClauseData);
      if (filterClauseCount) wherePartsCount.push(filterClauseCount);

      const moduleKeyParam = `$${dataParams.length + 1}`;
      dataParams.push(module.key);

      const auditEntityParam = `$${dataParams.length + 1}`;
      dataParams.push(module.auditEntity || module.key);

      const auditJoinSql = auditCols
        ? `LEFT JOIN LATERAL (`
            + ` SELECT al.user_id::bigint AS deleted_by_id,`
            + `        u.username::text AS deleted_by,`
            + `        al.${auditCols.createdAtColumn}::text AS deleted_logged_at`
            + `   FROM ${SCHEMA}.audit_logs al`
            + `   LEFT JOIN ${SCHEMA}.users u ON u.user_id = al.user_id`
            + `  WHERE LOWER(COALESCE(al.${auditCols.actionColumn}::text, '')) = 'delete'`
            + `    AND COALESCE(al.${auditCols.entityColumn}::text, '') = ${auditEntityParam}::text`
            + `    AND al.${auditCols.entityIdColumn}::bigint = t.${pkCol}::bigint`
            + `  ORDER BY al.${auditCols.createdAtColumn} DESC`
            + `  LIMIT 1`
            + ` ) aud ON TRUE`
        : `LEFT JOIN LATERAL (`
            + ` SELECT NULL::bigint AS deleted_by_id, NULL::text AS deleted_by, NULL::text AS deleted_logged_at`
            + ` ) aud ON TRUE`;

	      dataSelects.push(
	        `SELECT t.${pkCol}::bigint AS id,
	                ${labelExpr} AS label,
	                t.${dateCol}::text AS deleted_at,
	                ${createdExpr} AS created_at,
	                ${moduleKeyParam}::text AS module_key,
	                aud.deleted_by_id,
	                aud.deleted_by,
	                aud.deleted_logged_at,
	                t.${dateCol}::timestamptz AS deleted_sort
	           FROM ${SCHEMA}.${module.table} t
           ${auditJoinSql}
          WHERE ${wherePartsData.join(' AND ')}`
      );

      countSelects.push(
        `SELECT COUNT(*)::int AS total
           FROM ${SCHEMA}.${module.table} t
          WHERE ${wherePartsCount.join(' AND ')}`
      );
    }

    if (dataSelects.length === 0) {
      return { rows: [], total: 0 };
    }

    const limitParam = `$${dataParams.length + 1}`;
    dataParams.push(limit);
    const offsetParam = `$${dataParams.length + 1}`;
    dataParams.push(offset);

	    const dataSql = `WITH unioned AS (
	        ${dataSelects.join('\nUNION ALL\n')}
	      ),
	      ordered AS (
	        SELECT *
	          FROM unioned
	         ORDER BY deleted_sort DESC, module_key ASC, id DESC
	         LIMIT ${limitParam} OFFSET ${offsetParam}
	      )
	      SELECT id, label, deleted_at, created_at, module_key, deleted_by_id, deleted_by, deleted_logged_at
	        FROM ordered`;

    const countSql = `SELECT COALESCE(SUM(total), 0)::int AS total
        FROM (
          ${countSelects.join('\nUNION ALL\n')}
        ) x`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.include_deleted = '1'`);
	      const dataRes = await client.query<TrashRowDb>(dataSql, dataParams);
	      const countRes = await client.query(countSql, countParams);
	      await client.query('COMMIT');
	      return {
	        rows: dataRes.rows.map(
	          (row): TrashRow => ({
	            id: Number(row.id),
	            label: String(row.label ?? ''),
	            deleted_at: row.deleted_at ?? null,
	            created_at: row.created_at ?? null,
	            table: String(row.module_key ?? ''),
	            deleted_by_id: row.deleted_by_id ?? null,
	            deleted_by: row.deleted_by ?? null,
	            deleted_logged_at: row.deleted_logged_at ?? null,
	          })
	        ),
	        total: Number(countRes.rows[0]?.total || 0),
	      };
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
