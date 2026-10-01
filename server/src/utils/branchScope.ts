import { queryMany, queryOne } from '../db/query';
import { AuthRequest } from '../middlewares/requireAuth';
import { ApiError } from './ApiError';

export interface BranchScope {
  isAdmin: boolean;
  branchIds: number[];
  primaryBranchId: number;
}

// H9 fix: all-branch/admin status must never be derived from the role's
// display name (role_name) - that's free text an operator can set to
// anything, and a substring check (`.includes('admin')`) meant a role named
// e.g. "Store Administrator" or a rename of "Store Manager" -> "Store
// Administrator" would silently grant every holder of that role unrestricted
// access to every branch. role_code is the stable, unique, system-assigned
// identifier (UNIQUE constraint on ims.roles.role_code), and is_system is
// hardcoded FALSE for every role created through the app (system.service.ts
// #createRole) with no update path to ever flip it back - so only the
// originally-seeded Administrator role can ever satisfy both conditions,
// regardless of what role_name or any custom role's role_code is set to.
export const isAdminRoleRecord = (
  role: { role_code?: string | null; is_system?: boolean | null } | null | undefined
): boolean =>
  String(role?.role_code || '').trim().toUpperCase() === 'ADMIN' && role?.is_system === true;

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

  const roleRow = await queryOne<{ role_code: string; is_system: boolean }>(
    `SELECT role_code, is_system
       FROM ims.roles
      WHERE role_id = $1`,
    [req.user.roleId]
  );

  const isAdmin = isAdminRoleRecord(roleRow);

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

export const resolveActiveBranchId = async (req: AuthRequest): Promise<number> => {
  const scope = await resolveBranchScope(req);
  const raw = req.query.branchId;
  let branchId = scope.primaryBranchId;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (!parsed || Number.isNaN(parsed) || parsed <= 0) {
      throw ApiError.badRequest('branchId is invalid');
    }
    branchId = parsed;
  }
  assertBranchAccess(scope, branchId);
  return branchId;
};

/**
 * Resolves which branch id(s) a request should be scoped to, for endpoints that
 * aggregate across branches (e.g. dashboard). Unlike resolveActiveBranchId, an
 * admin with no ?branchId= gets every branch ("All Branches" mode). A non-admin
 * with no ?branchId= is pinned to their primary branch only, never the full
 * multi-branch set — this is what guarantees a Multi-Branch user never sees
 * mixed data unless they explicitly pick a branch they're assigned to.
 */
export const resolveActiveBranchIds = async (req: AuthRequest): Promise<number[]> => {
  const scope = await resolveBranchScope(req);
  const raw = req.query.branchId;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (!parsed || Number.isNaN(parsed) || parsed <= 0) {
      throw ApiError.badRequest('branchId is invalid');
    }
    assertBranchAccess(scope, parsed);
    return [parsed];
  }
  return scope.isAdmin ? scope.branchIds : [scope.primaryBranchId];
};
