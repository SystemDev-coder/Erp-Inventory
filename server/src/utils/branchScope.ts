import { queryMany, queryOne } from '../db/query';
import { AuthRequest } from '../middlewares/requireAuth';
import { ApiError } from './ApiError';

export interface BranchScope {
  isAdmin: boolean;
  branchIds: number[];
  primaryBranchId: number;
}

const uniqueNumbers = (values: number[]) => Array.from(new Set(values.filter((v) => Number.isFinite(v) && v > 0)));

export const resolveBranchScope = async (req: AuthRequest): Promise<BranchScope> => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const role = await queryOne<{ role_name: string }>(
    `SELECT role_name FROM ims.roles WHERE role_id = $1`,
    [req.user.roleId]
  );

  const isAdmin = (role?.role_name || '').toLowerCase() === 'admin';
  if (isAdmin) {
    const branches = await queryMany<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE COALESCE(is_deleted, FALSE) = FALSE
        ORDER BY branch_id`
    );
    const branchIds = uniqueNumbers(branches.map((row) => Number(row.branch_id)));
    return {
      isAdmin: true,
      branchIds,
      primaryBranchId: req.user.branchId,
    };
  }

  const assigned = await queryMany<{ branch_id: number; is_primary: boolean }>(
    `SELECT ub.branch_id, ub.is_primary
       FROM ims.user_branch ub
       JOIN ims.branches b ON b.branch_id = ub.branch_id
      WHERE ub.user_id = $1
        AND COALESCE(b.is_deleted, FALSE) = FALSE
      ORDER BY ub.is_primary DESC, ub.branch_id`,
    [req.user.userId]
  );

  const branchIds = uniqueNumbers(assigned.map((row) => Number(row.branch_id)));
  const primaryFromMap = assigned.find((row) => row.is_primary)?.branch_id;
  const primaryBranchId = Number(primaryFromMap || branchIds[0] || req.user.branchId);

  if (!branchIds.length) {
    // Backfill legacy data so old users still get one branch assignment.
    await queryOne(
      `INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, branch_id) DO UPDATE SET is_primary = TRUE`,
      [req.user.userId, primaryBranchId]
    );
    return {
      isAdmin: false,
      branchIds: [primaryBranchId],
      primaryBranchId,
    };
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

export const pickBranchForWrite = (scope: BranchScope, requestedBranchId?: number | null) => {
  if (requestedBranchId && Number.isFinite(requestedBranchId)) {
    assertBranchAccess(scope, requestedBranchId);
    return requestedBranchId;
  }
  return scope.primaryBranchId;
};
