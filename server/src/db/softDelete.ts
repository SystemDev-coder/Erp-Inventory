import { PoolClient } from 'pg';
import { ApiError } from '../utils/ApiError';
import { pool } from './pool';

type QueryRunner = Pick<PoolClient, 'query'> | typeof pool;

export type DeleteImpactEntry = { table: string; count: number };
export type DeleteImpactPreview = {
  blocked: boolean;
  blockedBy: DeleteImpactEntry[];
  cascaded: DeleteImpactEntry[];
  preserved: DeleteImpactEntry[];
};

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

/**
 * Central Delete Architecture (Phase 2) "Impact Preview": reports what
 * ims.sp_soft_delete would do to `table`/`id` - which dependent tables would
 * block the delete, which would be cascade-soft-deleted, and which are
 * historical data that gets left untouched - without mutating anything.
 * Table names only; callers that want human-readable labels (e.g.
 * trashService, which already owns a table->label map) apply those on top.
 */
export async function previewDelete(
  table: string,
  id: number,
  opts: { runner?: QueryRunner } = {}
): Promise<DeleteImpactPreview> {
  const runner = opts.runner ?? pool;

  const res = await runner.query<{
    child_table: string;
    child_column: string;
    policy: string;
    affected_count: string | number;
  }>(`SELECT child_table, child_column, policy, affected_count FROM ims.fn_analyze_delete_impact($1, $2)`, [
    table,
    id,
  ]);

  const blockedBy: DeleteImpactEntry[] = [];
  const cascaded: DeleteImpactEntry[] = [];
  const preserved: DeleteImpactEntry[] = [];

  for (const row of res.rows) {
    const entry: DeleteImpactEntry = { table: row.child_table, count: Number(row.affected_count) };
    if (row.policy === 'cascade') cascaded.push(entry);
    else if (row.policy === 'preserve') preserved.push(entry);
    else blockedBy.push(entry);
  }

  return { blocked: blockedBy.length > 0, blockedBy, cascaded, preserved };
}
