import { adminQueryMany } from '../../db/adminQuery';
import { queryMany, queryOne } from '../../db/query';
import { pool } from '../../db/pool';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, pickBranchForWrite } from '../../utils/branchScope';

export type AssetType = 'current' | 'fixed';
export type AssetState = 'active' | 'inactive' | 'disposed';

export interface AssetRow {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  asset_type: AssetType;
  purchased_date: string;
  amount: number;
  state: AssetState;
  created_by: number | null;
  created_at: string;
}

export interface CreateAssetInput {
  assetName: string;
  type: AssetType;
  purchasedDate?: string;
  amount: number;
  state?: AssetState;
  branchId?: number;
}

export interface UpdateAssetInput {
  assetName?: string;
  type?: AssetType;
  purchasedDate?: string;
  amount?: number;
  state?: AssetState;
}

let assetsSchemaReady = false;

const ensureAssetsSchema = async () => {
  if (assetsSchemaReady) return;

  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'asset_type_enum'
      ) THEN
        CREATE TYPE ims.asset_type_enum AS ENUM ('current', 'fixed');
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'asset_state_enum'
      ) THEN
        CREATE TYPE ims.asset_state_enum AS ENUM ('active', 'inactive', 'disposed');
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.assets (
      asset_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      asset_name VARCHAR(150) NOT NULL,
      asset_type ims.asset_type_enum NOT NULL,
      purchased_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      state ims.asset_state_enum NOT NULL DEFAULT 'active',
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_assets_branch_type_date
      ON ims.assets(branch_id, asset_type, purchased_date DESC, asset_id DESC);
  `);

  // One-time best-effort migration:
  // - Move legacy ims.fixed_assets into ims.assets as type='fixed'
  // - Move wrongly-created "Supplies" account into ims.assets as type='current'
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fixedTable = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.tables
          WHERE table_schema='ims'
            AND table_name='fixed_assets'
       ) AS exists`
    );

    if (fixedTable.rows[0]?.exists) {
      await client.query(`
        INSERT INTO ims.assets (branch_id, asset_name, asset_type, purchased_date, amount, state, created_by, created_at)
        SELECT
          fa.branch_id,
          fa.asset_name,
          'fixed'::ims.asset_type_enum,
          fa.purchase_date,
          COALESCE(fa.cost, 0),
          CASE
            WHEN LOWER(COALESCE(fa.status, 'active')) = 'disposed' THEN 'disposed'::ims.asset_state_enum
            WHEN LOWER(COALESCE(fa.status, 'active')) = 'inactive' THEN 'inactive'::ims.asset_state_enum
            ELSE 'active'::ims.asset_state_enum
          END AS state,
          fa.created_by,
          COALESCE(fa.created_at, NOW())
        FROM ims.fixed_assets fa
        WHERE NOT EXISTS (
          SELECT 1
            FROM ims.assets a
           WHERE a.branch_id = fa.branch_id
             AND LOWER(BTRIM(a.asset_name)) = LOWER(BTRIM(fa.asset_name))
             AND a.asset_type = 'fixed'::ims.asset_type_enum
             AND a.purchased_date = fa.purchase_date
             AND a.amount = COALESCE(fa.cost, 0)
        );
      `);
    }

    // Migrate (and delete) legacy "Supplies" account if it only has opening-balance GL postings.
    const suppliesRows = await client.query<{
      acc_id: number;
      branch_id: number;
      name: string;
      balance: string;
      created_at: string | null;
    }>(
      `SELECT acc_id, branch_id, name, balance::text AS balance, created_at::text AS created_at
         FROM ims.accounts
        WHERE LOWER(BTRIM(name)) = 'supplies'
        LIMIT 20`
    );

    for (const row of suppliesRows.rows) {
      const accId = Number(row.acc_id);
      const branchId = Number(row.branch_id);
      const amount = Number(row.balance || 0);
      const purchasedDate = (row.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

      // Create a current asset record.
      await client.query(
        `INSERT INTO ims.assets (branch_id, asset_name, asset_type, purchased_date, amount, state)
         SELECT $1, $2::text, 'current'::ims.asset_type_enum, $3::date, $4, 'active'::ims.asset_state_enum
         WHERE NOT EXISTS (
           SELECT 1
             FROM ims.assets a
            WHERE a.branch_id = $1
              AND LOWER(BTRIM(a.asset_name)) = LOWER(BTRIM($2::text))
              AND a.asset_type = 'current'::ims.asset_type_enum
         )`,
        [branchId, row.name, purchasedDate, Math.max(0, amount)]
      );

      const totalTxn = (
        await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND acc_id = $2`,
          [branchId, accId]
        )
      ).rows[0]?.cnt;
      const openingTxn = (
        await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'accounts'
              AND ref_id = $2`,
          [branchId, accId]
        )
      ).rows[0]?.cnt;

      const totalCount = Number(totalTxn || 0);
      const openingCount = Number(openingTxn || 0);

      // Only delete if the account has no postings except its opening-balance entry.
      if (totalCount > 0 && totalCount !== openingCount) {
        // Not safe to delete; just deactivate so it stops showing up.
        await client.query(`UPDATE ims.accounts SET is_active = FALSE WHERE branch_id = $1 AND acc_id = $2`, [
          branchId,
          accId,
        ]);
        continue;
      }

      // Remove both sides of the opening-balance posting (ref_table='accounts', ref_id=<acc_id>).
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'accounts'
            AND ref_id = $2`,
        [branchId, accId]
      );

      // Now delete the account row.
      await client.query(`DELETE FROM ims.accounts WHERE branch_id = $1 AND acc_id = $2`, [branchId, accId]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  assetsSchemaReady = true;
};

const mapRow = (row: {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  asset_type: string;
  purchased_date: string;
  amount: string | number;
  state: string;
  created_by: number | null;
  created_at: string;
}): AssetRow => ({
  asset_id: Number(row.asset_id),
  branch_id: Number(row.branch_id),
  asset_name: row.asset_name,
  asset_type: (row.asset_type || 'current') as AssetType,
  purchased_date: row.purchased_date,
  amount: Number(row.amount || 0),
  state: (row.state || 'active') as AssetState,
  created_by: row.created_by ? Number(row.created_by) : null,
  created_at: row.created_at,
});

export const assetsService = {
  async ensureSchema(): Promise<void> {
    await ensureAssetsSchema();
  },

  async listAssets(
    scope: BranchScope,
    filters: { search?: string; type?: AssetType; state?: string; fromDate?: string; toDate?: string }
  ): Promise<AssetRow[]> {
    await ensureAssetsSchema();

    const params: Array<string | number | number[]> = [];
    const where: string[] = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`a.branch_id = ANY($${params.length})`);
    }

    if (filters.search) {
      params.push(`%${filters.search.trim()}%`);
      where.push(`a.asset_name ILIKE $${params.length}`);
    }

    if (filters.type) {
      params.push(filters.type);
      where.push(`a.asset_type = $${params.length}::ims.asset_type_enum`);
    }

    if (filters.state) {
      params.push(filters.state.trim().toLowerCase());
      where.push(`LOWER(a.state::text) = $${params.length}`);
    }

    if (filters.fromDate && filters.toDate) {
      params.push(filters.fromDate);
      where.push(`a.purchased_date::date >= $${params.length}::date`);
      params.push(filters.toDate);
      where.push(`a.purchased_date::date <= $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await queryMany<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      asset_type: string;
      purchased_date: string;
      amount: string;
      state: string;
      created_by: number | null;
      created_at: string;
    }>(
      `SELECT
         a.asset_id,
         a.branch_id,
         a.asset_name,
         a.asset_type::text AS asset_type,
         a.purchased_date::text AS purchased_date,
         a.amount::text AS amount,
         a.state::text AS state,
         a.created_by,
         a.created_at::text AS created_at
       FROM ims.assets a
       ${whereSql}
       ORDER BY a.purchased_date DESC, a.asset_id DESC
       LIMIT 5000`,
      params
    );

    return rows.map(mapRow);
  },

  async createAsset(input: CreateAssetInput, scope: BranchScope, userId: number): Promise<AssetRow> {
    await ensureAssetsSchema();
    const branchId = pickBranchForWrite(scope, input.branchId);

    const purchasedDate = input.purchasedDate || new Date().toISOString().slice(0, 10);
    const state = (input.state || 'active').toLowerCase() as AssetState;

    const row = await queryOne<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      asset_type: string;
      purchased_date: string;
      amount: string;
      state: string;
      created_by: number | null;
      created_at: string;
    }>(
      `INSERT INTO ims.assets
         (branch_id, asset_name, asset_type, purchased_date, amount, state, created_by)
       VALUES
         ($1, $2, $3::ims.asset_type_enum, $4::date, $5, $6::ims.asset_state_enum, $7)
       RETURNING
         asset_id,
         branch_id,
         asset_name,
         asset_type::text AS asset_type,
         purchased_date::text AS purchased_date,
         amount::text AS amount,
         state::text AS state,
         created_by,
         created_at::text AS created_at`,
      [branchId, input.assetName.trim(), input.type, purchasedDate, input.amount, state, userId]
    );
    if (!row) throw ApiError.internal('Failed to create asset');
    return mapRow(row);
  },

  async updateAsset(assetId: number, input: UpdateAssetInput, scope: BranchScope): Promise<AssetRow | null> {
    await ensureAssetsSchema();

    const updates: string[] = [];
    const values: Array<string | number | number[] | null> = [];
    let param = 1;

    if (input.assetName !== undefined) {
      updates.push(`asset_name = $${param++}`);
      values.push(input.assetName.trim());
    }
    if (input.type !== undefined) {
      updates.push(`asset_type = $${param++}::ims.asset_type_enum`);
      values.push(input.type);
    }
    if (input.purchasedDate !== undefined) {
      updates.push(`purchased_date = $${param++}::date`);
      values.push(input.purchasedDate);
    }
    if (input.amount !== undefined) {
      updates.push(`amount = $${param++}`);
      values.push(input.amount);
    }
    if (input.state !== undefined) {
      updates.push(`state = $${param++}::ims.asset_state_enum`);
      values.push(input.state);
    }

    if (!updates.length) {
      return queryOne<{
        asset_id: number;
        branch_id: number;
        asset_name: string;
        asset_type: string;
        purchased_date: string;
        amount: string;
        state: string;
        created_by: number | null;
        created_at: string;
      }>(
        scope.isAdmin
          ? `SELECT asset_id, branch_id, asset_name, asset_type::text AS asset_type, purchased_date::text AS purchased_date,
                   amount::text AS amount, state::text AS state, created_by, created_at::text AS created_at
              FROM ims.assets WHERE asset_id = $1 LIMIT 1`
          : `SELECT asset_id, branch_id, asset_name, asset_type::text AS asset_type, purchased_date::text AS purchased_date,
                   amount::text AS amount, state::text AS state, created_by, created_at::text AS created_at
              FROM ims.assets WHERE asset_id = $1 AND branch_id = ANY($2) LIMIT 1`,
        scope.isAdmin ? [assetId] : [assetId, scope.branchIds]
      ).then((r) => (r ? mapRow(r as any) : null));
    }

    updates.push(`updated_at = NOW()`);
    const params: Array<string | number | number[] | null> = [...values, assetId];
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
      asset_type: string;
      purchased_date: string;
      amount: string;
      state: string;
      created_by: number | null;
      created_at: string;
    }>(
      `UPDATE ims.assets
          SET ${updates.join(', ')}
        WHERE asset_id = $${assetIdParam}${scopeSql}
        RETURNING
          asset_id,
          branch_id,
          asset_name,
          asset_type::text AS asset_type,
          purchased_date::text AS purchased_date,
          amount::text AS amount,
          state::text AS state,
          created_by,
          created_at::text AS created_at`,
      params
    );

    return row ? mapRow(row) : null;
  },

  async deleteAsset(assetId: number, scope: BranchScope): Promise<boolean> {
    await ensureAssetsSchema();
    const params: Array<number | number[]> = [assetId];
    let scopeSql = '';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      scopeSql = ` AND branch_id = ANY($${params.length})`;
    }

    const row = await queryOne<{ asset_id: number }>(
      `DELETE FROM ims.assets
        WHERE asset_id = $1${scopeSql}
        RETURNING asset_id`,
      params
    );
    return Boolean(row);
  },
};
