import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';

export interface Branch {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  audit_id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  old_value?: unknown;
  new_value?: unknown;
  meta?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface CompanyInfo {
  company_id: number;
  company_name: string;
  logo_img: string | null;
  banner_img: string | null;
  phone: string | null;
  manager_name: string | null;
  created_at: string;
  updated_at: string;
}

type AuditLogColumns = {
  idColumn: 'log_id' | 'audit_id';
  actionColumn: 'action_type' | 'action';
  entityColumn: 'table_name' | 'entity';
  entityIdColumn: 'record_id' | 'entity_id';
  oldColumn: 'old_values' | 'old_value';
  newColumn: 'new_values' | 'new_value';
  hasMeta: boolean;
};

let auditLogColumnsCache: AuditLogColumns | null = null;

const detectAuditLogColumns = async (): Promise<AuditLogColumns> => {
  if (auditLogColumnsCache) return auditLogColumnsCache;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'audit_logs'`
  );

  const names = new Set(columns.map((row) => row.column_name));

  auditLogColumnsCache = {
    idColumn: names.has('log_id') ? 'log_id' : 'audit_id',
    actionColumn: names.has('action_type') ? 'action_type' : 'action',
    entityColumn: names.has('table_name') ? 'table_name' : 'entity',
    entityIdColumn: names.has('record_id') ? 'record_id' : 'entity_id',
    oldColumn: names.has('old_values') ? 'old_values' : 'old_value',
    newColumn: names.has('new_values') ? 'new_values' : 'new_value',
    hasMeta: names.has('meta'),
  };

  return auditLogColumnsCache;
};

const mapCompany = (row: {
  company_id: number;
  company_name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}): CompanyInfo => ({
  company_id: Number(row.company_id),
  company_name: row.company_name,
  phone: row.phone,
  manager_name: row.address,
  logo_img: row.logo_url,
  banner_img: row.banner_url,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const settingsService = {
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    const row = await queryOne<{
      company_id: number;
      company_name: string;
      phone: string | null;
      address: string | null;
      logo_url: string | null;
      banner_url: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT company_id, company_name, phone, address, logo_url, banner_url, created_at, updated_at
         FROM ims.company
        WHERE company_id = 1`
    );

    return row ? mapCompany(row) : null;
  },

  async upsertCompanyInfo(input: {
    companyName: string;
    phone?: string | null;
    managerName?: string | null;
    logoImg?: string | null;
    bannerImg?: string | null;
  }): Promise<CompanyInfo> {
    const row = await queryOne<{
      company_id: number;
      company_name: string;
      phone: string | null;
      address: string | null;
      logo_url: string | null;
      banner_url: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO ims.company
         (company_id, company_name, phone, address, logo_url, banner_url, is_active)
       VALUES
         (1, $1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (company_id)
       DO UPDATE SET
         company_name = EXCLUDED.company_name,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         logo_url = EXCLUDED.logo_url,
         banner_url = EXCLUDED.banner_url,
         updated_at = NOW()
       RETURNING company_id, company_name, phone, address, logo_url, banner_url, created_at, updated_at`,
      [
        input.companyName,
        input.phone ?? null,
        input.managerName ?? null,
        input.logoImg ?? null,
        input.bannerImg ?? null,
      ]
    );

    if (!row) {
      throw ApiError.internal('Failed to save company information');
    }

    return mapCompany(row);
  },

  async deleteCompanyInfo(): Promise<void> {
    await queryOne(`DELETE FROM ims.company WHERE company_id = 1`);
  },

  async listBranches(): Promise<Branch[]> {
    return queryMany<Branch>(
      `SELECT
          branch_id,
          branch_name,
          address AS location,
          is_active,
          created_at
       FROM ims.branches
       ORDER BY branch_name`
    );
  },

  async createBranch(input: {
    branchName: string;
    location?: string | null;
    isActive?: boolean;
  }): Promise<Branch> {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE LOWER(branch_name) = LOWER($1)
        LIMIT 1`,
      [input.branchName]
    );
    if (existing) {
      throw ApiError.conflict('Branch name already exists');
    }

    const row = await queryOne<Branch>(
      `INSERT INTO ims.branches (branch_name, address, is_active)
       VALUES ($1, $2, COALESCE($3, TRUE))
       RETURNING branch_id, branch_name, address AS location, is_active, created_at`,
      [input.branchName, input.location ?? null, input.isActive]
    );

    if (!row) {
      throw ApiError.internal('Failed to create branch');
    }
    return row;
  },

  async updateBranch(
    id: number,
    input: { branchName?: string; location?: string | null; isActive?: boolean }
  ): Promise<Branch | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.branchName !== undefined) {
      const existing = await queryOne<{ branch_id: number }>(
        `SELECT branch_id
           FROM ims.branches
          WHERE LOWER(branch_name) = LOWER($1)
            AND branch_id <> $2
          LIMIT 1`,
        [input.branchName, id]
      );
      if (existing) {
        throw ApiError.conflict('Branch name already exists');
      }
      updates.push(`branch_name = $${parameter++}`);
      values.push(input.branchName);
    }

    if (input.location !== undefined) {
      updates.push(`address = $${parameter++}`);
      values.push(input.location ?? null);
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      return queryOne<Branch>(
        `SELECT
            branch_id,
            branch_name,
            address AS location,
            is_active,
            created_at
         FROM ims.branches
         WHERE branch_id = $1`,
        [id]
      );
    }

    values.push(id);

    return queryOne<Branch>(
      `UPDATE ims.branches
          SET ${updates.join(', ')}
        WHERE branch_id = $${parameter}
        RETURNING branch_id, branch_name, address AS location, is_active, created_at`,
      values
    );
  },

  async deleteBranch(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.branches WHERE branch_id = $1`, [id]);
  },

  async listAuditLogs(
    page = 1,
    limit = 50
  ): Promise<{ rows: AuditLog[]; total: number }> {
    const offset = (page - 1) * limit;
    const columns = await detectAuditLogColumns();
    const rows = await queryMany<AuditLog>(
      `SELECT
          al.${columns.idColumn} AS audit_id,
          al.user_id,
          u.username,
          al.${columns.actionColumn} AS action,
          al.${columns.entityColumn} AS entity,
          al.${columns.entityIdColumn} AS entity_id,
          al.${columns.oldColumn} AS old_value,
          al.${columns.newColumn} AS new_value,
          ${columns.hasMeta ? 'al.meta' : 'NULL::jsonb'} AS meta,
          al.ip_address,
          al.user_agent,
          al.created_at::text AS created_at
       FROM ims.audit_logs al
       LEFT JOIN ims.users u ON u.user_id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ims.audit_logs`
    );

    return {
      rows,
      total: Number(totalRow?.count || 0),
    };
  },
};
