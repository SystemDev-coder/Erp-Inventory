import { queryMany, queryOne } from '../../db/query';

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  isActive?: boolean;
}

export const suppliersService = {
  // List all suppliers
  async listSuppliers(search?: string): Promise<Supplier[]> {
    if (search) {
      return queryMany<Supplier>(
        `SELECT * FROM ims.suppliers 
         WHERE supplier_name ILIKE $1 OR contact_person ILIKE $1
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
    return queryOne<Supplier>(
      `INSERT INTO ims.suppliers (
        supplier_name, contact_person, phone, email, address, logo_url, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.supplierName,
        input.contactPerson || null,
        input.phone || null,
        input.email || null,
        input.address || null,
        input.logoUrl || null,
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
      updates.push(`supplier_name = $${paramCount++}`);
      values.push(input.supplierName);
    }
    if (input.contactPerson !== undefined) {
      updates.push(`contact_person = $${paramCount++}`);
      values.push(input.contactPerson);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(input.phone);
    }
    if (input.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(input.email);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(input.address);
    }
    if (input.logoUrl !== undefined) {
      updates.push(`logo_url = $${paramCount++}`);
      values.push(input.logoUrl);
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
