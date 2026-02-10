import { queryOne } from '../../db/query';

export interface SystemInfo {
  system_id: number;
  system_name: string;
  logo_url: string | null;
  banner_image_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemInfoInput {
  systemName?: string;
  logoUrl?: string;
  bannerImageUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export const systemService = {
  // Get system information (always returns the single row)
  async getSystemInfo(): Promise<SystemInfo | null> {
    return queryOne<SystemInfo>(
      `SELECT * FROM ims.system_information WHERE system_id = 1`
    );
  },

  // Update system information (upsert - insert if not exists)
  async updateSystemInfo(input: SystemInfoInput): Promise<SystemInfo> {
    const existing = await this.getSystemInfo();
    
    if (existing) {
      // Update existing
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (input.systemName !== undefined) {
        updates.push(`system_name = $${paramCount++}`);
        values.push(input.systemName);
      }
      if (input.logoUrl !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(input.logoUrl);
      }
      if (input.bannerImageUrl !== undefined) {
        updates.push(`banner_image_url = $${paramCount++}`);
        values.push(input.bannerImageUrl);
      }
      if (input.address !== undefined) {
        updates.push(`address = $${paramCount++}`);
        values.push(input.address);
      }
      if (input.phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(input.phone);
      }
      if (input.email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(input.email);
      }
      if (input.website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        values.push(input.website);
      }

      if (updates.length === 0) {
        return existing;
      }

      return queryOne<SystemInfo>(
        `UPDATE ims.system_information 
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE system_id = 1
         RETURNING *`,
        values
      ) as Promise<SystemInfo>;
    } else {
      // Insert new
      return queryOne<SystemInfo>(
        `INSERT INTO ims.system_information (
          system_name, logo_url, banner_image_url, address, phone, email, website
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          input.systemName || 'My ERP System',
          input.logoUrl || null,
          input.bannerImageUrl || null,
          input.address || null,
          input.phone || null,
          input.email || null,
          input.website || null,
        ]
      ) as Promise<SystemInfo>;
    }
  },
};
