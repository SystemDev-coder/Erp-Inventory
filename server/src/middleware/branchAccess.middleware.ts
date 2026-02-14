/**
 * BRANCH ACCESS MIDDLEWARE
 * Ensures users can only access data from their assigned branches
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';

// Extend Express Request to include branch information
declare global {
  namespace Express {
    interface Request {
      userBranches?: number[];
      primaryBranch?: number;
      currentBranch?: number;
    }
  }
}

/**
 * Middleware to load user's accessible branches and set database context
 */
export const loadUserBranches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    // Get all branches user has access to
    const result = await pool.query(
      `SELECT branch_id, is_primary 
       FROM ims.user_branch 
       WHERE user_id = $1 
       ORDER BY is_primary DESC, branch_id`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(403).json({ 
        message: 'User has no branch access assigned' 
      });
      return;
    }

    // Store accessible branches in request
    req.userBranches = result.rows.map((r: any) => r.branch_id);
    
    // Set primary branch
    const primaryRow = result.rows.find((r: any) => r.is_primary);
    req.primaryBranch = primaryRow ? primaryRow.branch_id : result.rows[0].branch_id;

    // Check if user specified a branch in query/header
    const requestedBranch = 
      req.query.branchId || 
      req.headers['x-branch-id'] ||
      req.body?.branchId;

    if (requestedBranch) {
      const branchId = parseInt(requestedBranch as string);
      
      // Verify user has access to requested branch
      if (req.userBranches.includes(branchId)) {
        req.currentBranch = branchId;
      } else {
        res.status(403).json({ 
          message: 'Access denied to requested branch' 
        });
        return;
      }
    } else {
      // Default to primary branch
      req.currentBranch = req.primaryBranch;
    }

    // **IMPORTANT: Set database session context for automatic branch_id population**
    await setDatabaseContext(userId, req.currentBranch);

    next();
  } catch (error) {
    console.error('Branch access middleware error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Middleware to ensure branch_id is provided and user has access
 */
export const validateBranchAccess = (paramName: string = 'branchId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const branchId = parseInt(req.params[paramName] || req.body[paramName] || req.query[paramName] as string);

    if (!branchId) {
      res.status(400).json({ message: `${paramName} is required` });
      return;
    }

    if (!req.userBranches || !req.userBranches.includes(branchId)) {
      res.status(403).json({ 
        message: 'Access denied to this branch' 
      });
      return;
    }

    next();
  };
};

/**
 * Helper function to build SQL WHERE clause for branch filtering
 */
export const buildBranchFilter = (
  req: Request,
  tableAlias?: string
): { clause: string; params: number[] } => {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  
  if (!req.userBranches || req.userBranches.length === 0) {
    return { clause: 'FALSE', params: [] };
  }

  if (req.currentBranch) {
    // Filter by current/selected branch only
    return {
      clause: `${prefix}branch_id = $1`,
      params: [req.currentBranch]
    };
  }

  // Filter by all accessible branches
  const placeholders = req.userBranches.map((_, i) => `$${i + 1}`).join(', ');
  return {
    clause: `${prefix}branch_id IN (${placeholders})`,
    params: req.userBranches
  };
};

/**
 * Helper to get user's primary branch
 */
export const getUserPrimaryBranch = async (userId: number): Promise<number | null> => {
  const result = await pool.query(
    `SELECT ims.fn_user_primary_branch($1) as branch_id`,
    [userId]
  );
  return result.rows[0]?.branch_id || null;
};

/**
 * Helper to check if user has access to specific branch
 */
export const checkBranchAccess = async (
  userId: number,
  branchId: number
): Promise<boolean> => {
  const result = await pool.query(
    `SELECT ims.fn_user_has_branch_access($1, $2) as has_access`,
    [userId, branchId]
  );
  return result.rows[0]?.has_access || false;
};

/**
 * Set database session context for automatic branch_id and user_id population
 * This enables database triggers to automatically insert branch_id and audit fields
 */
export const setDatabaseContext = async (
  userId: number,
  branchId: number
): Promise<void> => {
  await pool.query(
    `SELECT ims.set_current_context($1, $2)`,
    [userId, branchId]
  );
};

/**
 * Clear database session context (optional, good practice at end of request)
 */
export const clearDatabaseContext = async (): Promise<void> => {
  try {
    await pool.query(`SELECT set_config('app.current_user_id', '', false)`);
    await pool.query(`SELECT set_config('app.current_branch_id', '', false)`);
  } catch (error) {
    // Ignore errors during cleanup
  }
};
