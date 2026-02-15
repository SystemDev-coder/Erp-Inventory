import { queryMany, queryOne } from '../../db/query';
import { EmployeeInput, EmployeeUpdateInput } from './employees.schemas';

export interface Employee {
  emp_id: number;
  branch_id: number;
  user_id: number | null;
  role_id: number | null;
  full_name: string;
  phone: string | null;
  address: string | null;
  hire_date: string;
  status: 'active' | 'inactive' | 'terminated';
  created_at?: string;
  // Related data from joins
  username?: string;
  role_name?: string;
  basic_salary?: number;
}

export const employeesService = {
  /**
   * List all employees with optional filtering
   */
  async list(params?: { search?: string; status?: string; branchIds?: number[] }): Promise<Employee[]> {
    let query = `
      SELECT 
        e.emp_id,
        e.branch_id,
        e.user_id,
        e.role_id,
        e.full_name,
        e.phone,
        e.address,
        e.hire_date,
        e.status,
        e.created_at,
        u.username,
        r.role_name,
        COALESCE(es.basic_salary, 0) as basic_salary
      FROM ims.employees e
      LEFT JOIN ims.users u ON e.user_id = u.user_id
      LEFT JOIN ims.roles r ON e.role_id = r.role_id
      LEFT JOIN ims.employee_salary es ON e.emp_id = es.emp_id AND es.is_active = TRUE
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramCount = 1;

    // Filter by branch if provided
    if (params?.branchIds && params.branchIds.length > 0) {
      query += ` AND e.branch_id = ANY($${paramCount})`;
      values.push(params.branchIds);
      paramCount++;
    }

    // Search by name or phone
    if (params?.search) {
      query += ` AND (
        LOWER(e.full_name) LIKE LOWER($${paramCount}) OR 
        LOWER(e.phone) LIKE LOWER($${paramCount}) OR
        LOWER(u.username) LIKE LOWER($${paramCount}) OR
        LOWER(r.role_name) LIKE LOWER($${paramCount})
      )`;
      values.push(`%${params.search}%`);
      paramCount++;
    }

    // Filter by status
    if (params?.status && params.status !== 'all') {
      query += ` AND e.status = $${paramCount}::ims.employment_status_enum`;
      values.push(params.status);
      paramCount++;
    }

    query += ' ORDER BY e.created_at DESC';

    return queryMany<Employee>(query, values);
  },

  /**
   * Get employee by ID
   */
  async getById(id: number): Promise<Employee | null> {
    return queryOne<Employee>(
      `SELECT 
        e.*,
        u.username,
        r.role_name,
        COALESCE(es.basic_salary, 0) as basic_salary
      FROM ims.employees e
      LEFT JOIN ims.users u ON e.user_id = u.user_id
      LEFT JOIN ims.roles r ON e.role_id = r.role_id
      LEFT JOIN ims.employee_salary es ON e.emp_id = es.emp_id AND es.is_active = TRUE
      WHERE e.emp_id = $1`,
      [id]
    );
  },

  /**
   * Create new employee
   */
  async create(input: EmployeeInput): Promise<Employee> {
    // branch_id will be added automatically by trigger
    const result = await queryOne<Employee>(
      `INSERT INTO ims.employees (full_name, phone, address, role_id, hire_date, status)
       VALUES ($1, $2, $3, $4, $5, $6::ims.employment_status_enum) 
       RETURNING *`,
      [
        input.name,
        input.phone || null,
        input.address || null,
        input.role_id || null,
        input.hire_date || new Date().toISOString().split('T')[0],
        input.status || 'active',
      ]
    ) as Promise<Employee>;

    // If salary provided, create employee_salary record
    if (input.salary && input.salary > 0) {
      // Get or create default salary type
      const salType = await queryOne<any>(
        `INSERT INTO ims.salary_types (type_name, base_type)
         VALUES ('Monthly Salary', 'monthly')
         ON CONFLICT (type_name) DO UPDATE SET type_name = EXCLUDED.type_name
         RETURNING sal_type_id`,
        []
      );

      if (salType && result) {
        await queryOne(
          `INSERT INTO ims.employee_salary (emp_id, sal_type_id, basic_salary, start_date)
           VALUES ($1, $2, $3, $4)`,
          [result.emp_id, salType.sal_type_id, input.salary, result.hire_date]
        );
      }
    }

    return this.getById(result.emp_id) as Promise<Employee>;
  },

  /**
   * Update employee
   */
  async update(id: number, input: EmployeeUpdateInput): Promise<Employee | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(input.phone || null);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(input.address || null);
    }
    if (input.role_id !== undefined) {
      updates.push(`role_id = $${paramCount++}`);
      values.push(input.role_id || null);
    }
    if (input.hire_date !== undefined) {
      updates.push(`hire_date = $${paramCount++}`);
      values.push(input.hire_date);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramCount++}::ims.employment_status_enum`);
      values.push(input.status);
    }

    if (updates.length > 0) {
      values.push(id);
      await queryOne(
        `UPDATE ims.employees SET ${updates.join(', ')} WHERE emp_id = $${paramCount}`,
        values
      );
    }

    // Update salary if provided
    if (input.salary !== undefined && input.salary >= 0) {
      // Get or create salary type
      const salType = await queryOne<any>(
        `INSERT INTO ims.salary_types (type_name, base_type)
         VALUES ('Monthly Salary', 'monthly')
         ON CONFLICT (type_name) DO UPDATE SET type_name = EXCLUDED.type_name
         RETURNING sal_type_id`,
        []
      );

      if (salType) {
        // Deactivate old salary records
        await queryOne(
          `UPDATE ims.employee_salary SET is_active = FALSE, end_date = CURRENT_DATE
           WHERE emp_id = $1 AND is_active = TRUE`,
          [id]
        );

        // Create new salary record
        await queryOne(
          `INSERT INTO ims.employee_salary (emp_id, sal_type_id, basic_salary, start_date)
           VALUES ($1, $2, $3, CURRENT_DATE)`,
          [id, salType.sal_type_id, input.salary]
        );
      }
    }

    return this.getById(id);
  },

  /**
   * Delete employee
   */
  async delete(id: number): Promise<void> {
    await queryOne('DELETE FROM ims.employees WHERE emp_id = $1', [id]);
  },

  /**
   * Get employee statistics
   */
  async getStats(branchIds?: number[]): Promise<{
    total: number;
    active: number;
    inactive: number;
    totalSalaries: number;
  }> {
    let query = `
      SELECT 
        COUNT(DISTINCT e.emp_id) as total,
        COUNT(DISTINCT e.emp_id) FILTER (WHERE e.status = 'active') as active,
        COUNT(DISTINCT e.emp_id) FILTER (WHERE e.status = 'inactive') as inactive,
        COALESCE(SUM(es.basic_salary) FILTER (WHERE e.status = 'active' AND es.is_active = TRUE), 0) as total_salaries
      FROM ims.employees e
      LEFT JOIN ims.employee_salary es ON e.emp_id = es.emp_id AND es.is_active = TRUE
      WHERE 1=1
    `;
    const values: any[] = [];

    if (branchIds && branchIds.length > 0) {
      query += ' AND e.branch_id = ANY($1)';
      values.push(branchIds);
    }

    const result = await queryOne<any>(query, values);
    
    return {
      total: parseInt(result.total) || 0,
      active: parseInt(result.active) || 0,
      inactive: parseInt(result.inactive) || 0,
      totalSalaries: parseFloat(result.total_salaries) || 0,
    };
  },
};
