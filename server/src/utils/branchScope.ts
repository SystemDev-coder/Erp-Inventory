import { queryMany, queryOne } from '../db/query';
import { AuthRequest } from '../middlewares/requireAuth';
import { ApiError } from './ApiError';

export interface BranchScope {
  isAdmin: boolean;
  branchIds: number[];
  primaryBranchId: number;
}

const dedupeNumbers = (values: Array<number | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

const ensureBranchAssignment = async (userId: number): Promise<number> => {
  const firstBranch = await queryOne<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.branches
      WHERE is_active = TRUE
      ORDER BY branch_id
      LIMIT 1`
  );

  if (!firstBranch) {
    throw ApiError.badRequest('No active branch is available in the system');
  }

  await queryOne(
    `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, branch_id)
     DO UPDATE SET is_default = TRUE`,
    [userId, firstBranch.branch_id]
  );

  return Number(firstBranch.branch_id);
};

export const resolveBranchScope = async (req: AuthRequest): Promise<BranchScope> => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const roleRow = await queryOne<{ role_name: string }>(
    `SELECT role_name
       FROM ims.roles
      WHERE role_id = $1`,
    [req.user.roleId]
  );

  const roleName = (roleRow?.role_name || '').toLowerCase();
  const isAdmin = roleName.includes('admin');

  if (isAdmin) {
    const rows = await queryMany<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE is_active = TRUE
        ORDER BY branch_id`
    );
    const branchIds = dedupeNumbers(rows.map((row) => row.branch_id));
    const primaryBranchId =
      Number(req.user.branchId) ||
      Number(branchIds[0]) ||
      (await ensureBranchAssignment(req.user.userId));

    return {
      isAdmin: true,
      branchIds,
      primaryBranchId,
    };
  }

  const assigned = await queryMany<{ branch_id: number; is_default: boolean }>(
    `SELECT ub.branch_id, ub.is_default
       FROM ims.user_branches ub
       JOIN ims.branches b ON b.branch_id = ub.branch_id
      WHERE ub.user_id = $1
        AND b.is_active = TRUE
      ORDER BY ub.is_default DESC, ub.branch_id`,
    [req.user.userId]
  );

  let branchIds = dedupeNumbers(assigned.map((row) => row.branch_id));
  let primaryBranchId = Number(
    assigned.find((row) => row.is_default)?.branch_id ||
      branchIds[0] ||
      req.user.branchId ||
      0
  );

  if (!branchIds.length || !primaryBranchId) {
    primaryBranchId = await ensureBranchAssignment(req.user.userId);
    branchIds = [primaryBranchId];
  }

  return {
    isAdmin: false,
    branchIds,
    primaryBranchId,
  };
};

export const assertBranchAccess = (scope: BranchScope, branchId: number) => {
  if (scope.isAdmin) return;
  if (!scope.branchIds.includes(branchId)) {
    throw ApiError.forbidden('You can only access your assigned branch');
  }
};

export const pickBranchForWrite = (
  scope: BranchScope,
  requestedBranchId?: number | null
) => {
  if (requestedBranchId && Number.isFinite(requestedBranchId)) {
    assertBranchAccess(scope, requestedBranchId);
    return requestedBranchId;
  }
  return scope.primaryBranchId;
};
