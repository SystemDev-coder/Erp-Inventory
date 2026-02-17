import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { CloseShiftInput, ListShiftsQuery, OpenShiftInput } from './shifts.schemas';

export interface Shift {
  shift_id: number;
  branch_id: number;
  branch_name: string | null;
  user_id: number;
  username: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number;
  status: 'open' | 'closed' | 'void';
  note: string | null;
}

type ShiftRow = {
  shift_id: number;
  branch_id: number;
  branch_name: string | null;
  user_id: number;
  username: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  closing_cash: string;
  status: 'open' | 'closed' | 'void';
  note: string | null;
};

const mapShift = (row: ShiftRow): Shift => ({
  shift_id: Number(row.shift_id),
  branch_id: Number(row.branch_id),
  branch_name: row.branch_name,
  user_id: Number(row.user_id),
  username: row.username,
  opened_at: row.opened_at,
  closed_at: row.closed_at,
  opening_cash: Number(row.opening_cash || 0),
  closing_cash: Number(row.closing_cash || 0),
  status: row.status,
  note: row.note,
});

const getShiftById = async (id: number): Promise<Shift | null> => {
  const row = await queryOne<ShiftRow>(
    `SELECT
        s.shift_id,
        s.branch_id,
        b.branch_name,
        s.user_id,
        u.username,
        s.opened_at::text,
        s.closed_at::text,
        s.opening_cash::text,
        s.closing_cash::text,
        s.status::text AS status,
        s.note
       FROM ims.shifts s
       LEFT JOIN ims.users u ON u.user_id = s.user_id
       LEFT JOIN ims.branches b ON b.branch_id = s.branch_id
      WHERE s.shift_id = $1`,
    [id]
  );
  return row ? mapShift(row) : null;
};

export const shiftsService = {
  async list(scope: BranchScope, filters: ListShiftsQuery): Promise<Shift[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId) {
      if (!scope.isAdmin && !scope.branchIds.includes(filters.branchId)) {
        throw ApiError.forbidden('Access denied to requested branch');
      }
      params.push(filters.branchId);
      where.push(`s.branch_id = $${params.length}`);
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`s.branch_id = ANY($${params.length})`);
    }

    if (filters.status) {
      params.push(filters.status);
      where.push(`s.status = $${params.length}::ims.shift_status_enum`);
    }

    if (filters.userId) {
      params.push(filters.userId);
      where.push(`s.user_id = $${params.length}`);
    }

    params.push(filters.limit);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await queryMany<ShiftRow>(
      `SELECT
          s.shift_id,
          s.branch_id,
          b.branch_name,
          s.user_id,
          u.username,
          s.opened_at::text,
          s.closed_at::text,
          s.opening_cash::text,
          s.closing_cash::text,
          s.status::text AS status,
          s.note
         FROM ims.shifts s
         LEFT JOIN ims.users u ON u.user_id = s.user_id
         LEFT JOIN ims.branches b ON b.branch_id = s.branch_id
         ${whereSql}
        ORDER BY s.opened_at DESC
        LIMIT $${params.length}`,
      params
    );

    return rows.map(mapShift);
  },

  async open(
    scope: BranchScope,
    actorUserId: number,
    input: OpenShiftInput
  ): Promise<Shift> {
    const branchId = input.branchId ?? scope.primaryBranchId;
    if (!scope.isAdmin && !scope.branchIds.includes(branchId)) {
      throw ApiError.forbidden('Cannot open shift for this branch');
    }

    const existing = await queryOne<{ shift_id: number }>(
      `SELECT shift_id
         FROM ims.shifts
        WHERE branch_id = $1
          AND user_id = $2
          AND status = 'open'::ims.shift_status_enum
        LIMIT 1`,
      [branchId, actorUserId]
    );
    if (existing) {
      throw ApiError.conflict('You already have an open shift in this branch');
    }

    const created = await queryOne<{ shift_id: number }>(
      `INSERT INTO ims.shifts (branch_id, user_id, opening_cash, note, status)
       VALUES ($1, $2, COALESCE($3, 0), $4, 'open'::ims.shift_status_enum)
       RETURNING shift_id`,
      [branchId, actorUserId, input.openingCash ?? 0, input.note ?? null]
    );

    if (!created) {
      throw ApiError.internal('Failed to open shift');
    }

    const shift = await getShiftById(Number(created.shift_id));
    if (!shift) {
      throw ApiError.internal('Shift created but could not be loaded');
    }
    return shift;
  },

  async close(scope: BranchScope, id: number, input: CloseShiftInput): Promise<Shift | null> {
    const current = await getShiftById(id);
    if (!current) return null;

    if (!scope.isAdmin && !scope.branchIds.includes(current.branch_id)) {
      throw ApiError.forbidden('Cannot close shift in this branch');
    }
    if (current.status !== 'open') {
      throw ApiError.badRequest('Only open shifts can be closed');
    }

    await queryOne(
      `UPDATE ims.shifts
          SET closed_at = NOW(),
              closing_cash = $2,
              note = COALESCE($3, note),
              status = 'closed'::ims.shift_status_enum
        WHERE shift_id = $1`,
      [id, input.closingCash, input.note ?? null]
    );

    return getShiftById(id);
  },

  async void(scope: BranchScope, id: number): Promise<Shift | null> {
    const current = await getShiftById(id);
    if (!current) return null;

    if (!scope.isAdmin && !scope.branchIds.includes(current.branch_id)) {
      throw ApiError.forbidden('Cannot void shift in this branch');
    }
    if (current.status === 'void') {
      return current;
    }

    await queryOne(
      `UPDATE ims.shifts
          SET status = 'void'::ims.shift_status_enum,
              closed_at = COALESCE(closed_at, NOW())
        WHERE shift_id = $1`,
      [id]
    );

    return getShiftById(id);
  },
};

