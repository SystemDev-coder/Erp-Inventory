import { PoolClient } from 'pg';
import { ApiError } from '../utils/ApiError';
import { pool } from './pool';

type QueryRunner = Pick<PoolClient, 'query'> | typeof pool;

/**
 * NEW: Safe soft-delete helper that uses DB function `ims.sp_soft_delete`.
 * This avoids `DELETE ... RETURNING` breaking when soft-delete triggers cancel hard deletes.
 */
export async function softDeleteById(
  table: string,
  id: number,
  opts: { runner?: QueryRunner; userId?: number | null } = {}
): Promise<void> {
  const runner = opts.runner ?? pool;
  const userId = opts.userId ?? null;

  const res = await runner.query<{ success: boolean; message: string }>(
    `SELECT success, message FROM ims.sp_soft_delete($1,$2,$3)`,
    [table, id, userId]
  );

  const row = res.rows[0];
  if (!row) {
    throw ApiError.internal('Delete failed');
  }
  if (!row.success) {
    throw ApiError.badRequest(row.message || 'Cannot delete this record');
  }
}
