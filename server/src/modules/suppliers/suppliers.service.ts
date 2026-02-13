import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';

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
  updated_at: string;
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

export const suppliersService = {
  // List all suppliers
  async listSuppliers(search?: string): Promise<Supplier[]> {
    if (search) {
      return queryMany<Supplier>(
        `SELECT * FROM ims.suppliers 
         WHERE supplier_name ILIKE $1 
           OR COALESCE(company_name, '') ILIKE $1
           OR contact_person ILIKE $1
           OR COALESCE(contact_phone, '') ILIKE $1
           OR COALESCE(location, '') ILIKE $1
         ORDER BY supplier_name`,
        [`%${search}%`]
      );
    }
    
    return queryMany<Supplier>(
      `SELECT * FROM ims.suppliers ORDER BY supplier_name`
    );
  },

  // Get single supplier
  async getSupplier(id: number): Promise<Supplier | null> {
    return queryOne<Supplier>(
      `SELECT * FROM ims.suppliers WHERE supplier_id = $1`,
      [id]
    );
  },

  // Create supplier
  async createSupplier(input: SupplierInput): Promise<Supplier> {
    // Enforce unique supplier name (case-insensitive)
    const existing = await queryOne<{ supplier_id: number }>(
      `SELECT supplier_id FROM ims.suppliers WHERE LOWER(supplier_name) = LOWER($1)`,
      [input.supplierName]
    );
    if (existing) {
      throw ApiError.conflict('Supplier name already exists');
    }

    return queryOne<Supplier>(
      `INSERT INTO ims.suppliers (
        supplier_name, company_name, contact_person, contact_phone, phone, address, location, remaining_balance, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.supplierName,
        input.companyName || null,
        input.contactPerson || null,
        input.contactPhone || null,
        input.phone || null,
        input.address || null,
        input.location || null,
        input.remainingBalance ?? 0,
        input.isActive !== undefined ? input.isActive : true,
      ]
    ) as Promise<Supplier>;
  },

  // Update supplier
  async updateSupplier(id: number, input: Partial<SupplierInput>): Promise<Supplier | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.supplierName !== undefined) {
      // Prevent renaming to an existing supplier name
      const existing = await queryOne<{ supplier_id: number }>(
        `SELECT supplier_id FROM ims.suppliers WHERE LOWER(supplier_name) = LOWER($1) AND supplier_id <> $2`,
        [input.supplierName, id]
      );
      if (existing) {
        throw ApiError.conflict('Supplier name already exists');
      }
      updates.push(`supplier_name = $${paramCount++}`);
      values.push(input.supplierName);
    }
    if (input.companyName !== undefined) {
      updates.push(`company_name = $${paramCount++}`);
      values.push(input.companyName);
    }
    if (input.contactPerson !== undefined) {
      updates.push(`contact_person = $${paramCount++}`);
      values.push(input.contactPerson);
    }
    if (input.contactPhone !== undefined) {
      updates.push(`contact_phone = $${paramCount++}`);
      values.push(input.contactPhone);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(input.phone);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(input.address);
    }
    if (input.location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(input.location);
    }
    if (input.remainingBalance !== undefined) {
      updates.push(`remaining_balance = $${paramCount++}`);
      values.push(input.remainingBalance);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(input.isActive);
    }

    if (updates.length === 0) {
      return this.getSupplier(id);
    }

    values.push(id);

    return queryOne<Supplier>(
      `UPDATE ims.suppliers 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE supplier_id = $${paramCount}
       RETURNING *`,
      values
    );
  },

  // Delete supplier
  async deleteSupplier(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.suppliers WHERE supplier_id = $1`, [id]);
  },
};
