import { queryMany, queryOne } from '../../db/query';
import { adminQueryMany } from '../../db/adminQuery';
import { pool } from '../../db/pool';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, pickBranchForWrite } from '../../utils/branchScope';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';

export interface FixedAssetRow {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  purchase_date: string;
  cost: number;
  status: string;
  account_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface CreateFixedAssetInput {
  assetName: string;
  purchaseDate: string;
  cost: number;
  category?: string;
  status?: string;
  accountId?: number;
  branchId?: number;
}

export interface UpdateFixedAssetInput {
  assetName?: string;
  purchaseDate?: string;
  cost?: number;
  category?: string;
  status?: string;
  accountId?: number;
}

let fixedAssetsSchemaReady = false;

const ensureFixedAssetsSchema = async () => {
  if (fixedAssetsSchemaReady) return;

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.fixed_assets (
      asset_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      asset_name VARCHAR(150) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'Fixed Asset',
      purchase_date DATE NOT NULL,
      cost NUMERIC(14,2) NOT NULL CHECK (cost >= 0),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    ALTER TABLE ims.fixed_assets
      ADD COLUMN IF NOT EXISTS category VARCHAR(100),
      ADD COLUMN IF NOT EXISTS status VARCHAR(30),
      ADD COLUMN IF NOT EXISTS acc_id BIGINT,
      ADD COLUMN IF NOT EXISTS created_by BIGINT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `);

  await adminQueryMany(`
    UPDATE ims.fixed_assets
       SET category = COALESCE(NULLIF(category, ''), 'Fixed Asset'),
           status = COALESCE(NULLIF(status, ''), 'active'),
           created_at = COALESCE(created_at, NOW()),
           updated_at = COALESCE(updated_at, NOW())
  `);

  await adminQueryMany(`
    ALTER TABLE ims.fixed_assets
      ALTER COLUMN category SET DEFAULT 'Fixed Asset',
      ALTER COLUMN status SET DEFAULT 'active',
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW()
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_created
      ON ims.fixed_assets(branch_id, created_at DESC)
  `);

  fixedAssetsSchemaReady = true;
};

const mapRow = (row: {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  purchase_date: string;
  cost: string | number;
  status: string;
  acc_id?: number | null;
  created_by: number | null;
  created_at: string;
}): FixedAssetRow => ({
  asset_id: Number(row.asset_id),
  branch_id: Number(row.branch_id),
  asset_name: row.asset_name,
  purchase_date: row.purchase_date,
  cost: Number(row.cost || 0),
  status: row.status,
  account_id: row.acc_id === undefined ? null : row.acc_id ? Number(row.acc_id) : null,
  created_by: row.created_by ? Number(row.created_by) : null,
  created_at: row.created_at,
});

export const assetsService = {
  async listFixedAssets(
    scope: BranchScope,
    filters: { search?: string; status?: string; fromDate?: string; toDate?: string }
  ): Promise<FixedAssetRow[]> {
    await ensureFixedAssetsSchema();

    const params: Array<string | number | number[]> = [];
    const where: string[] = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`fa.branch_id = ANY($${params.length})`);
    }

    if (filters.search) {
      params.push(`%${filters.search.trim()}%`);
      where.push(`fa.asset_name ILIKE $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status.trim().toLowerCase());
      where.push(`LOWER(fa.status) = $${params.length}`);
    }
    if (filters.fromDate && filters.toDate) {
      params.push(filters.fromDate);
      where.push(`fa.purchase_date::date >= $${params.length}::date`);
      params.push(filters.toDate);
      where.push(`fa.purchase_date::date <= $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await queryMany<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      purchase_date: string;
      cost: string | number;
      status: string;
      acc_id: number | null;
      created_by: number | null;
      created_at: string;
    }>(
      `SELECT
         fa.asset_id,
         fa.branch_id,
         fa.asset_name,
         fa.purchase_date::text AS purchase_date,
         fa.cost::text AS cost,
         fa.status,
         fa.acc_id,
         fa.created_by,
         fa.created_at::text AS created_at
       FROM ims.fixed_assets fa
       ${whereSql}
       ORDER BY fa.created_at DESC, fa.asset_id DESC
       LIMIT 5000`,
      params
    );

    return rows.map(mapRow);
  },

  async createFixedAsset(
    input: CreateFixedAssetInput,
    scope: BranchScope,
    userId: number
  ): Promise<FixedAssetRow> {
    await ensureFixedAssetsSchema();

    const branchId = pickBranchForWrite(scope, input.branchId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cashAccount = input.accountId
        ? (await client.query<{ acc_id: number; account_type: string }>(
            `SELECT acc_id, account_type
               FROM ims.accounts
              WHERE branch_id = $1
                AND acc_id = $2
                AND is_active = TRUE
              LIMIT 1`,
            [branchId, input.accountId]
          )).rows[0]
        : (await client.query<{ acc_id: number; account_type: string }>(
            `SELECT acc_id, account_type
               FROM ims.accounts
              WHERE branch_id = $1
                AND is_active = TRUE
                AND account_type = 'asset'
              ORDER BY
                CASE
                  WHEN name ILIKE '%cash%' THEN 0
                  WHEN name ILIKE '%bank%' THEN 1
                  ELSE 2
                END,
                acc_id ASC
              LIMIT 1`,
            [branchId]
          )).rows[0];

      if (!cashAccount) {
        throw ApiError.badRequest('No active cash/bank asset account found for this branch');
      }
      if ((cashAccount.account_type || 'asset') !== 'asset') {
        throw ApiError.badRequest('Selected payment account must be an asset (cash/bank) account');
      }
      const cashAccountId = Number(cashAccount.acc_id);

      const rowRes = await client.query<{
        asset_id: number;
        branch_id: number;
        asset_name: string;
        purchase_date: string;
        cost: string | number;
        status: string;
        acc_id: number | null;
        created_by: number | null;
        created_at: string;
      }>(
        `INSERT INTO ims.fixed_assets
           (branch_id, asset_name, category, purchase_date, cost, status, acc_id, created_by)
         VALUES
           ($1, $2, $3, $4::date, $5, $6, $7, $8)
         RETURNING
           asset_id,
           branch_id,
           asset_name,
           purchase_date::text AS purchase_date,
           cost::text AS cost,
           status,
           acc_id,
           created_by,
           created_at::text AS created_at`,
        [
          branchId,
          input.assetName,
          input.category || 'Fixed Asset',
          input.purchaseDate,
          input.cost,
          input.status || 'active',
          cashAccountId,
          userId,
        ]
      );

      const row = rowRes.rows[0];
      if (!row) throw ApiError.internal('Failed to create fixed asset');

      await client.query(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) - $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [input.cost, branchId, cashAccountId]
      );

      const coa = await ensureCoaAccounts(client, branchId, ['fixedAssets']);
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'fixed_assets'
            AND ref_id = $2`,
        [branchId, row.asset_id]
      );
      await postGl(client, {
        branchId,
        txnDate: input.purchaseDate || null,
        refTable: 'fixed_assets',
        refId: row.asset_id,
        note: `[FIXED ASSET] ${input.assetName}`,
        lines: [
          { accId: coa.fixedAssets, debit: Number(input.cost || 0), credit: 0 },
          { accId: cashAccountId, debit: 0, credit: Number(input.cost || 0) },
        ],
      });

      await client.query('COMMIT');
      return mapRow(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateFixedAsset(
    assetId: number,
    input: UpdateFixedAssetInput,
    scope: BranchScope
  ): Promise<FixedAssetRow | null> {
    await ensureFixedAssetsSchema();

    const existing = await queryOne<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      purchase_date: string;
      cost: string | number;
      status: string;
      acc_id: number | null;
    }>(
      scope.isAdmin
        ? `SELECT asset_id, branch_id, asset_name, purchase_date::text AS purchase_date, cost::text AS cost, status, acc_id
             FROM ims.fixed_assets
            WHERE asset_id = $1
            LIMIT 1`
        : `SELECT asset_id, branch_id, asset_name, purchase_date::text AS purchase_date, cost::text AS cost, status, acc_id
             FROM ims.fixed_assets
            WHERE asset_id = $1
              AND branch_id = ANY($2)
            LIMIT 1`,
      scope.isAdmin ? [assetId] : [assetId, scope.branchIds]
    );
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: Array<string | number | number[] | null> = [];
    let param = 1;

    if (input.assetName !== undefined) {
      updates.push(`asset_name = $${param++}`);
      values.push(input.assetName);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${param++}`);
      values.push(input.category);
    }
    if (input.purchaseDate !== undefined) {
      updates.push(`purchase_date = $${param++}::date`);
      values.push(input.purchaseDate);
    }
    if (input.cost !== undefined) {
      updates.push(`cost = $${param++}`);
      values.push(input.cost);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${param++}`);
      values.push(input.status);
    }
    if (input.accountId !== undefined) {
      updates.push(`acc_id = $${param++}`);
      values.push(input.accountId);
    }

    if (!updates.length) {
      const params: Array<number | number[]> = [assetId];
      let scopeSql = '';
      if (!scope.isAdmin) {
        params.push(scope.branchIds);
        scopeSql = ` AND fa.branch_id = ANY($${params.length})`;
      }
      const row = await queryOne<{
        asset_id: number;
        branch_id: number;
        asset_name: string;
        purchase_date: string;
        cost: string | number;
        status: string;
        acc_id: number | null;
        created_by: number | null;
        created_at: string;
      }>(
        `SELECT
           fa.asset_id,
           fa.branch_id,
           fa.asset_name,
           fa.purchase_date::text AS purchase_date,
           fa.cost::text AS cost,
           fa.status,
           fa.acc_id,
           fa.created_by,
           fa.created_at::text AS created_at
         FROM ims.fixed_assets fa
         WHERE fa.asset_id = $1${scopeSql}
         LIMIT 1`,
        params
      );
      return row ? mapRow(row) : null;
    }

    updates.push(`updated_at = NOW()`);
    const params: Array<string | number | number[] | null> = [...values];
    params.push(assetId);
    const assetIdParam = params.length;

    let scopeSql = '';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      scopeSql = ` AND branch_id = ANY($${params.length})`;
    }

    const row = await queryOne<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      purchase_date: string;
      cost: string | number;
      status: string;
      acc_id: number | null;
      created_by: number | null;
      created_at: string;
    }>(
      `UPDATE ims.fixed_assets
          SET ${updates.join(', ')}
        WHERE asset_id = $${assetIdParam}${scopeSql}
        RETURNING
          asset_id,
          branch_id,
          asset_name,
          purchase_date::text AS purchase_date,
          cost::text AS cost,
          status,
          acc_id,
          created_by,
          created_at::text AS created_at`,
      params
    );

    // If any accounting fields changed, rewrite the associated cash ledger row.
    const prevCost = Number(existing.cost || 0);
    const nextCost = input.cost !== undefined ? Number(input.cost || 0) : prevCost;
    const prevDate = existing.purchase_date;
    const nextDate = input.purchaseDate !== undefined ? input.purchaseDate : prevDate;
    const prevAccId = existing.acc_id ? Number(existing.acc_id) : null;
    const nextAccId = input.accountId !== undefined ? (input.accountId ? Number(input.accountId) : null) : prevAccId;

    const accountingChanged =
      nextCost !== prevCost ||
      nextDate !== prevDate ||
      nextAccId !== prevAccId ||
      (input.assetName !== undefined && input.assetName !== existing.asset_name);

    if (accountingChanged) {
      const branchId = Number(existing.branch_id);

      // Reverse old cash movement.
      if (prevAccId && prevCost > 0) {
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) + $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [prevCost, branchId, prevAccId]
        );
      }

      if (nextAccId && nextCost > 0) {
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) - $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [nextCost, branchId, nextAccId]
        );
      }

      const glClient = await pool.connect();
      try {
        await glClient.query('BEGIN');
        const coa = await ensureCoaAccounts(glClient, branchId, ['fixedAssets']);
        await glClient.query(
          `DELETE FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'fixed_assets'
              AND ref_id = $2`,
          [branchId, assetId]
        );

        if (nextAccId && nextCost > 0) {
          await postGl(glClient, {
            branchId,
            txnDate: nextDate || null,
            refTable: 'fixed_assets',
            refId: assetId,
            note: `[FIXED ASSET] ${(input.assetName ?? existing.asset_name) || existing.asset_name}`,
            lines: [
              { accId: coa.fixedAssets, debit: nextCost, credit: 0 },
              { accId: nextAccId, debit: 0, credit: nextCost },
            ],
          });
        }
        await glClient.query('COMMIT');
      } catch (error) {
        await glClient.query('ROLLBACK');
        throw error;
      } finally {
        glClient.release();
      }
    }

    return row ? mapRow(row) : null;
  },

  async deleteFixedAsset(assetId: number, scope: BranchScope): Promise<boolean> {
    await ensureFixedAssetsSchema();

    const params: Array<number | number[]> = [assetId];
    let scopeSql = '';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      scopeSql = ` AND branch_id = ANY($${params.length})`;
    }

    const existing = await queryOne<{ branch_id: number; cost: string | number; acc_id: number | null }>(
      `SELECT branch_id, cost::text AS cost, acc_id
         FROM ims.fixed_assets
        WHERE asset_id = $1${scopeSql}
        LIMIT 1`,
      params
    );

    if (!existing) return false;

    // Reverse cash movement and remove ledger entry.
    const branchId = Number(existing.branch_id);
    const cost = Number(existing.cost || 0);
    const cashAccId = existing.acc_id ? Number(existing.acc_id) : null;

    if (cashAccId && cost > 0) {
      await queryOne(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) + $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [cost, branchId, cashAccId]
      );
    }

    await queryOne(
      `DELETE FROM ims.account_transactions
        WHERE branch_id = $1
          AND ref_table = 'fixed_assets'
          AND ref_id = $2`,
      [branchId, assetId]
    );

    const deleted = await queryOne<{ asset_id: number }>(
      `DELETE FROM ims.fixed_assets
        WHERE asset_id = $1${scopeSql}
        RETURNING asset_id`,
      params
    );

    return Boolean(deleted);
  },
};
