import { queryMany, queryOne } from '../../db/query';

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
  username?: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  old_value?: any;
  new_value?: any;
  meta?: any;
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

export const settingsService = {
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    return queryOne<CompanyInfo>(
      `SELECT * FROM ims.company_info WHERE company_id = 1`
    );
  },

  async upsertCompanyInfo(input: {
    companyName: string;
    phone?: string | null;
    managerName?: string | null;
    logoImg?: string | null;
    bannerImg?: string | null;
  }): Promise<CompanyInfo> {
    const existing = await this.getCompanyInfo();
    if (existing) {
      return queryOne<CompanyInfo>(
        `UPDATE ims.company_info
         SET company_name = $1,
             phone = $2,
             manager_name = $3,
             logo_img = $4,
             banner_img = $5,
             updated_at = NOW()
         WHERE company_id = 1
         RETURNING *`,
        [
          input.companyName,
          input.phone ?? null,
          input.managerName ?? null,
          input.logoImg ?? null,
          input.bannerImg ?? null,
        ]
      ) as Promise<CompanyInfo>;
    }

    return queryOne<CompanyInfo>(
      `INSERT INTO ims.company_info (company_id, company_name, phone, manager_name, logo_img, banner_img)
       VALUES (1, $1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.companyName,
        input.phone ?? null,
        input.managerName ?? null,
        input.logoImg ?? null,
        input.bannerImg ?? null,
      ]
    ) as Promise<CompanyInfo>;
  },

  async listBranches(): Promise<Branch[]> {
    return queryMany<Branch>(
      `SELECT branch_id, branch_name, location, is_active, created_at
         FROM ims.branches
         ORDER BY branch_name`
    );
  },

  async createBranch(input: { branchName: string; location?: string | null; isActive?: boolean }): Promise<Branch> {
    return queryOne<Branch>(
      `INSERT INTO ims.branches (branch_name, location, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING branch_id, branch_name, location, is_active, created_at`,
      [input.branchName, input.location || null, input.isActive]
    ) as Promise<Branch>;
  },

  async updateBranch(id: number, input: { branchName?: string; location?: string | null; isActive?: boolean }): Promise<Branch | null> {
    const updates: string[] = [];
    const values: any[] = [id];
    let param = 2;

    if (input.branchName !== undefined) {
      updates.push(`branch_name = $${param++}`);
      values.push(input.branchName);
    }
    if (input.location !== undefined) {
      updates.push(`location = $${param++}`);
      values.push(input.location || null);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${param++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      return queryOne<Branch>(
        `SELECT branch_id, branch_name, location, is_active, created_at
           FROM ims.branches
           WHERE branch_id = $1`,
        [id]
      );
    }

    return queryOne<Branch>(
      `UPDATE ims.branches
         SET ${updates.join(', ')}, updated_at = NOW()
       WHERE branch_id = $1
       RETURNING branch_id, branch_name, location, is_active, created_at`,
      values
    );
  },

  async deleteBranch(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.branches WHERE branch_id = $1`, [id]);
  },

  async listAuditLogs(page = 1, limit = 50): Promise<{ rows: AuditLog[]; total: number }> {
    const offset = (page - 1) * limit;
    const rows = await queryMany<AuditLog>(
      `SELECT al.audit_id,
              al.user_id,
              u.username,
              al.action,
              al.entity,
              al.entity_id,
              al.old_value,
              al.new_value,
              al.meta,
              al.ip_address,
              al.user_agent,
              al.created_at
         FROM ims.audit_logs al
         LEFT JOIN ims.users u ON u.user_id = al.user_id
         ORDER BY al.created_at DESC
         LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM ims.audit_logs`
    );

    const total = totalRow ? Number(totalRow.count) : 0;
    return { rows, total };
  },
};
