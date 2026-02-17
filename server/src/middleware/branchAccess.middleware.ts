import { Request, Response, NextFunction } from 'express';
import { queryMany, queryOne } from '../db/query';

declare global {
  namespace Express {
    interface Request {
      userBranches?: number[];
      primaryBranch?: number;
      currentBranch?: number;
    }
  }
}

const resolveRequestedBranch = (req: Request): number | null => {
  const raw =
    req.query.branchId ??
    req.headers['x-branch-id'] ??
    req.body?.branchId;

  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const loadUserBranches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId as number | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    let rows = await queryMany<{ branch_id: number; is_default: boolean }>(
      `SELECT ub.branch_id, ub.is_default
         FROM ims.user_branches ub
         JOIN ims.branches b ON b.branch_id = ub.branch_id
        WHERE ub.user_id = $1
          AND b.is_active = TRUE
        ORDER BY ub.is_default DESC, ub.branch_id`,
      [userId]
    );

    if (!rows.length) {
      const tokenBranchId = Number((req as any).user?.branchId || 0);
      const preferredBranch = tokenBranchId
        ? await queryOne<{ branch_id: number }>(
            `SELECT branch_id
               FROM ims.branches
              WHERE branch_id = $1
                AND is_active = TRUE`,
            [tokenBranchId]
          )
        : null;

      const fallbackBranch =
        preferredBranch ||
        (await queryOne<{ branch_id: number }>(
          `SELECT branch_id
             FROM ims.branches
            WHERE is_active = TRUE
            ORDER BY branch_id
            LIMIT 1`
        ));

      if (!fallbackBranch) {
        res.status(403).json({
          success: false,
          message: 'No active branch available in the system',
        });
        return;
      }

      await queryOne(
        `INSERT INTO ims.user_branches (user_id, branch_id, is_default)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, branch_id)
         DO UPDATE SET is_default = TRUE`,
        [userId, fallbackBranch.branch_id]
      );

      rows = await queryMany<{ branch_id: number; is_default: boolean }>(
        `SELECT ub.branch_id, ub.is_default
           FROM ims.user_branches ub
           JOIN ims.branches b ON b.branch_id = ub.branch_id
          WHERE ub.user_id = $1
            AND b.is_active = TRUE
          ORDER BY ub.is_default DESC, ub.branch_id`,
        [userId]
      );
    }

    req.userBranches = rows.map((row) => Number(row.branch_id));
    req.primaryBranch =
      Number(rows.find((row) => row.is_default)?.branch_id) ||
      Number(rows[0].branch_id);

    const requestedBranchId = resolveRequestedBranch(req);
    if (requestedBranchId) {
      if (!req.userBranches.includes(requestedBranchId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to requested branch',
        });
        return;
      }
      req.currentBranch = requestedBranchId;
    } else {
      req.currentBranch = req.primaryBranch;
    }

    next();
  } catch (error) {
    console.error('Branch access middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const validateBranchAccess = (paramName = 'branchId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw =
      req.params[paramName] ??
      req.body?.[paramName] ??
      req.query?.[paramName];

    const branchId = Number(raw);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      res.status(400).json({
        success: false,
        message: `${paramName} is required`,
      });
      return;
    }

    if (!req.userBranches || !req.userBranches.includes(branchId)) {
      res.status(403).json({
        success: false,
        message: 'Access denied to this branch',
      });
      return;
    }

    next();
  };
};

export const buildBranchFilter = (
  req: Request,
  tableAlias?: string
): { clause: string; params: number[] } => {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (!req.userBranches?.length) {
    return { clause: 'FALSE', params: [] };
  }

  if (req.currentBranch) {
    return {
      clause: `${prefix}branch_id = $1`,
      params: [req.currentBranch],
    };
  }

  return {
    clause: `${prefix}branch_id = ANY($1)`,
    params: [req.userBranches],
  };
};

export const getUserPrimaryBranch = async (
  userId: number
): Promise<number | null> => {
  const rows = await queryMany<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.user_branches
      WHERE user_id = $1
      ORDER BY is_default DESC, branch_id
      LIMIT 1`,
    [userId]
  );
  return rows[0] ? Number(rows[0].branch_id) : null;
};

export const checkBranchAccess = async (
  userId: number,
  branchId: number
): Promise<boolean> => {
  const rows = await queryMany<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.user_branches
      WHERE user_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [userId, branchId]
  );
  return Boolean(rows[0]);
};

export const setDatabaseContext = async (): Promise<void> => {};

export const clearDatabaseContext = async (): Promise<void> => {};
