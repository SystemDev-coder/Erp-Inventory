import { queryMany, queryOne } from '../../db/query';
import {
  EmployeeInput,
  EmployeeUpdateInput,
  ShiftAssignmentInput,
  ShiftAssignmentUpdateInput,
  StateUpdateInput,
} from './employees.schemas';

export interface Employee {
  emp_id: number;
  branch_id: number;
  user_id: number | null;
  role_id: number | null;
  full_name: string;
  phone: string | null;
  address: string | null;
  gender: string | null;
  hire_date: string;
  status: 'active' | 'inactive' | 'terminated';
  created_at?: string;
  // Related data from joins
  username?: string;
  role_name?: string;
  basic_salary?: number;
}

export interface ShiftAssignment {
  assignment_id: number;
  branch_id: number;
  emp_id: number;
  employee_name: string;
  shift_type: 'Morning' | 'Night' | 'Evening';
  effective_date: string;
  is_active: boolean;
  created_at: string;
}

let employeesHaveGenderColumn: boolean | null = null;

const detectEmployeesGenderColumn = async (): Promise<boolean> => {
  if (employeesHaveGenderColumn !== null) return employeesHaveGenderColumn;
  const rows = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'employees'`
  );
  employeesHaveGenderColumn = rows.some((row) => row.column_name === 'gender');
  return employeesHaveGenderColumn;
};

export const employeesService = {
  /**
   * List all employees with optional filtering
   */
  async list(params?: { search?: string; status?: string; branchIds?: number[] }): Promise<Employee[]> {
    const hasGender = await detectEmployeesGenderColumn();
    let query = `
      SELECT 
        e.emp_id,
        e.branch_id,
        e.user_id,
        u.role_id,
        e.full_name,
        e.phone,
        e.address,
        ${hasGender ? 'e.gender' : 'NULL::varchar AS gender'},
        e.hire_date,
        e.status,
        e.created_at,
        u.username,
        r.role_name,
        COALESCE(es.basic_salary, 0) as basic_salary
      FROM ims.employees e
      LEFT JOIN ims.users u ON e.user_id = u.user_id
      LEFT JOIN ims.roles r ON u.role_id = r.role_id
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
        u.role_id,
        u.username,
        r.role_name,
        COALESCE(es.basic_salary, 0) as basic_salary
      FROM ims.employees e
      LEFT JOIN ims.users u ON e.user_id = u.user_id
      LEFT JOIN ims.roles r ON u.role_id = r.role_id
      LEFT JOIN ims.employee_salary es ON e.emp_id = es.emp_id AND es.is_active = TRUE
      WHERE e.emp_id = $1`,
      [id]
    );
  },

  /**
   * Create new employee
   */
  async create(input: EmployeeInput): Promise<Employee> {
    const hasGender = await detectEmployeesGenderColumn();
    // branch_id will be added automatically by trigger
    const result = hasGender
      ? await queryOne<Employee>(
          `INSERT INTO ims.employees (user_id, full_name, phone, address, gender, hire_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7::ims.employment_status_enum) 
           RETURNING *`,
          [
            input.user_id || null,
            input.name,
            input.phone || null,
            input.address || null,
            input.gender || null,
            input.hire_date || new Date().toISOString().split('T')[0],
            input.status || 'active',
          ]
        )
      : await queryOne<Employee>(
          `INSERT INTO ims.employees (user_id, full_name, phone, address, hire_date, status)
           VALUES ($1, $2, $3, $4, $5, $6::ims.employment_status_enum) 
           RETURNING *`,
          [
            input.user_id || null,
            input.name,
            input.phone || null,
            input.address || null,
            input.hire_date || new Date().toISOString().split('T')[0],
            input.status || 'active',
          ]
        );

    if (!result) {
      throw new Error('Failed to create employee');
    }

    if (input.role_id !== undefined && input.user_id) {
      await queryOne(
        `UPDATE ims.users SET role_id = $1 WHERE user_id = $2`,
        [input.role_id || null, input.user_id]
      );
    }

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

      if (salType) {
        await queryOne(
          `INSERT INTO ims.employee_salary (emp_id, sal_type_id, basic_salary, start_date)
           VALUES ($1, $2, $3, $4)`,
          [result.emp_id, salType.sal_type_id, input.salary, result.hire_date]
        );
      }
    }

    const created = await this.getById(result.emp_id);
    if (!created) {
      throw new Error('Employee created but could not be loaded');
    }
    return created;
  },

  /**
   * Update employee
   */
  async update(id: number, input: EmployeeUpdateInput): Promise<Employee | null> {
    const hasGender = await detectEmployeesGenderColumn();
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
    if (hasGender && input.gender !== undefined) {
      updates.push(`gender = $${paramCount++}`);
      values.push(input.gender || null);
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

    if (input.role_id !== undefined) {
      await queryOne(
        `UPDATE ims.users u
            SET role_id = $1
           FROM ims.employees e
          WHERE e.emp_id = $2
            AND e.user_id = u.user_id`,
        [input.role_id || null, id]
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

  async updateState(input: StateUpdateInput, branchIds?: number[]): Promise<void> {
    if (input.targetType === 'employee') {
      const hasBranches = Boolean(branchIds && branchIds.length > 0);
      await queryOne(
        `UPDATE ims.employees
            SET status = $2::ims.employment_status_enum
          WHERE emp_id = $1 ${hasBranches ? 'AND branch_id = ANY($3)' : ''}`,
        hasBranches ? [input.targetId, input.status, branchIds] : [input.targetId, input.status]
      );
      return;
    }

    if (input.targetType === 'customer') {
      const hasBranches = Boolean(branchIds && branchIds.length > 0);
      await queryOne(
        `UPDATE ims.customers
            SET is_active = $2
          WHERE customer_id = $1 ${hasBranches ? 'AND branch_id = ANY($3)' : ''}`,
        hasBranches ? [input.targetId, input.status === 'active', branchIds] : [input.targetId, input.status === 'active']
      );
      return;
    }

    await queryOne(
      `UPDATE ims.items
          SET is_active = $2
        WHERE item_id = $1`,
      [input.targetId, input.status === 'active']
    );
  },

  async listShiftAssignments(branchIds?: number[]): Promise<ShiftAssignment[]> {
    const values: any[] = [];
    let where = '';
    if (branchIds && branchIds.length > 0) {
      values.push(branchIds);
      where = 'WHERE a.branch_id = ANY($1)';
    }

    return queryMany<ShiftAssignment>(
      `SELECT
         a.assignment_id,
         a.branch_id,
         a.emp_id,
         e.full_name AS employee_name,
         a.shift_type,
         a.effective_date::text AS effective_date,
         a.is_active,
         a.created_at::text AS created_at
       FROM ims.employee_shift_assignments a
       JOIN ims.employees e ON e.emp_id = a.emp_id
       ${where}
       ORDER BY a.created_at DESC`,
      values
    );
  },

  async createShiftAssignment(
    input: ShiftAssignmentInput,
    context: { branchId: number; userId?: number }
  ): Promise<ShiftAssignment> {
    const row = await queryOne<ShiftAssignment>(
      `INSERT INTO ims.employee_shift_assignments
         (branch_id, emp_id, shift_type, effective_date, is_active, created_by)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), COALESCE($5, TRUE), $6)
       RETURNING assignment_id, branch_id, emp_id, shift_type, effective_date::text, is_active, created_at::text, ''::text AS employee_name`,
      [
        context.branchId,
        input.emp_id,
        input.shift_type,
        input.effective_date ?? null,
        input.is_active ?? true,
        context.userId ?? null,
      ]
    );

    if (!row) {
      throw new Error('Failed to create shift assignment');
    }
    const assignments = await this.listShiftAssignments([context.branchId]);
    return assignments.find((assignment) => assignment.assignment_id === row.assignment_id) || row;
  },

  async updateShiftAssignment(
    id: number,
    input: ShiftAssignmentUpdateInput,
    branchIds?: number[]
  ): Promise<ShiftAssignment | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.emp_id !== undefined) {
      updates.push(`emp_id = $${p++}`);
      values.push(input.emp_id);
    }
    if (input.shift_type !== undefined) {
      updates.push(`shift_type = $${p++}`);
      values.push(input.shift_type);
    }
    if (input.effective_date !== undefined) {
      updates.push(`effective_date = $${p++}::date`);
      values.push(input.effective_date);
    }
    if (input.is_active !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(input.is_active);
    }

    if (!updates.length) {
      const list = await this.listShiftAssignments(branchIds);
      return list.find((row) => row.assignment_id === id) || null;
    }

    values.push(id);
    let where = `assignment_id = $${p++}`;
    if (branchIds && branchIds.length > 0) {
      values.push(branchIds);
      where += ` AND branch_id = ANY($${p++})`;
    }

    const row = await queryOne<{ assignment_id: number }>(
      `UPDATE ims.employee_shift_assignments
          SET ${updates.join(', ')}
        WHERE ${where}
        RETURNING assignment_id`,
      values
    );
    if (!row) return null;

    const list = await this.listShiftAssignments(branchIds);
    return list.find((assignment) => assignment.assignment_id === id) || null;
  },

  async deleteShiftAssignment(id: number, branchIds?: number[]): Promise<void> {
    if (branchIds && branchIds.length > 0) {
      await queryOne(
        `DELETE FROM ims.employee_shift_assignments
          WHERE assignment_id = $1
            AND branch_id = ANY($2)`,
        [id, branchIds]
      );
      return;
    }
    await queryOne('DELETE FROM ims.employee_shift_assignments WHERE assignment_id = $1', [id]);
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
