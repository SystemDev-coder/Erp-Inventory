import { queryMany, queryOne } from '../../db/query';

export interface Schedule {
  schedule_id: number;
  emp_id: number;
  branch_id: number;
  schedule_type: 'sick_leave' | 'vacation' | 'personal' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: number;
  approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Related data from joins
  employee_name?: string;
  approved_by_name?: string;
}

export interface ScheduleInput {
  emp_id: number;
  schedule_type: 'sick_leave' | 'vacation' | 'personal' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  reason?: string;
  notes?: string;
}

export const schedulesService = {
  async list(filters?: { empId?: number; status?: string; branchIds?: number[] }): Promise<Schedule[]> {
    let sql = `
      SELECT 
        s.*,
        e.full_name as employee_name,
        u.name as approved_by_name
      FROM ims.employee_schedule s
      LEFT JOIN ims.employees e ON s.emp_id = e.emp_id
      LEFT JOIN ims.users u ON s.approved_by = u.user_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (filters?.empId) {
      sql += ` AND s.emp_id = $${paramCount++}`;
      params.push(filters.empId);
    }

    if (filters?.status) {
      sql += ` AND s.status = $${paramCount++}`;
      params.push(filters.status);
    }

    if (filters?.branchIds && filters.branchIds.length > 0) {
      sql += ` AND s.branch_id = ANY($${paramCount++})`;
      params.push(filters.branchIds);
    }

    sql += ' ORDER BY s.start_date DESC, s.created_at DESC';

    return query<Schedule>(sql, params);
  },

  async getById(id: number): Promise<Schedule | null> {
    return queryOne<Schedule>(
      `SELECT 
        s.*,
        e.full_name as employee_name,
        u.name as approved_by_name
      FROM ims.employee_schedule s
      LEFT JOIN ims.employees e ON s.emp_id = e.emp_id
      LEFT JOIN ims.users u ON s.approved_by = u.user_id
      WHERE s.schedule_id = $1`,
      [id]
    );
  },

  async create(input: ScheduleInput): Promise<Schedule> {
    const result = await queryOne<Schedule>(
      `INSERT INTO ims.employee_schedule 
        (emp_id, schedule_type, start_date, end_date, reason, notes, status)
       VALUES ($1, $2::ims.schedule_type_enum, $3, $4, $5, $6, 'pending') 
       RETURNING *`,
      [
        input.emp_id,
        input.schedule_type,
        input.start_date,
        input.end_date,
        input.reason || null,
        input.notes || null,
      ]
    );

    if (!result) {
      throw new Error('Failed to create schedule');
    }

    return result;
  },

  async update(id: number, input: Partial<ScheduleInput>): Promise<Schedule | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.schedule_type !== undefined) {
      updates.push(`schedule_type = $${paramCount++}::ims.schedule_type_enum`);
      values.push(input.schedule_type);
    }
    if (input.start_date !== undefined) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(input.start_date);
    }
    if (input.end_date !== undefined) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(input.end_date);
    }
    if (input.reason !== undefined) {
      updates.push(`reason = $${paramCount++}`);
      values.push(input.reason);
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(input.notes);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `
      UPDATE ims.employee_schedule 
      SET ${updates.join(', ')}
      WHERE schedule_id = $${paramCount}
      RETURNING *
    `;

    return queryOne<Schedule>(sql, values);
  },

  async updateStatus(
    id: number,
    status: 'pending' | 'approved' | 'rejected' | 'cancelled',
    approvedBy?: number
  ): Promise<Schedule | null> {
    return queryOne<Schedule>(
      `UPDATE ims.employee_schedule 
       SET status = $1::ims.schedule_status_enum,
           approved_by = $2,
           approved_at = CASE WHEN $1 IN ('approved', 'rejected') THEN CURRENT_TIMESTAMP ELSE approved_at END
       WHERE schedule_id = $3
       RETURNING *`,
      [status, approvedBy || null, id]
    );
  },

  async delete(id: number): Promise<boolean> {
    const result = await queryMany(`DELETE FROM ims.employee_schedule WHERE schedule_id = $1 RETURNING schedule_id`, [id]);
    return result.length > 0;
  },

  async getUpcoming(empId?: number, days: number = 30): Promise<Schedule[]> {
    const sql = `
      SELECT 
        s.*,
        e.full_name as employee_name
      FROM ims.employee_schedule s
      LEFT JOIN ims.employees e ON s.emp_id = e.emp_id
      WHERE s.start_date >= CURRENT_DATE
        AND s.start_date <= CURRENT_DATE + INTERVAL '${days} days'
        AND s.status IN ('pending', 'approved')
        ${empId ? 'AND s.emp_id = $1' : ''}
      ORDER BY s.start_date ASC
    `;

    return query<Schedule>(sql, empId ? [empId] : []);
  },
};
