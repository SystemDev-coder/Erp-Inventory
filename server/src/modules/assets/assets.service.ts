import { queryMany, queryOne } from '../../db/query';
import { BranchScope, pickBranchForWrite } from '../../utils/branchScope';

export interface FixedAssetRow {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  category: string;
  purchase_date: string;
  cost: number;
  useful_life_months: number;
  depreciation_method: string;
  status: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface CreateFixedAssetInput {
  assetName: string;
  category: string;
  purchaseDate: string;
  cost: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  status?: string;
  notes?: string | null;
  branchId?: number;
}

export interface UpdateFixedAssetInput {
  assetName?: string;
  category?: string;
  purchaseDate?: string;
  cost?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: string;
  status?: string;
  notes?: string | null;
}

let fixedAssetsSchemaReady = false;

const ensureFixedAssetsSchema = async () => {
  if (fixedAssetsSchemaReady) return;

  await queryMany(`
    CREATE TABLE IF NOT EXISTS ims.fixed_assets (
      asset_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      asset_name VARCHAR(150) NOT NULL,
      category VARCHAR(100) NOT NULL,
      purchase_date DATE NOT NULL,
      cost NUMERIC(14,2) NOT NULL CHECK (cost >= 0),
      useful_life_months INTEGER NOT NULL DEFAULT 12 CHECK (useful_life_months > 0),
      depreciation_method VARCHAR(50) NOT NULL DEFAULT 'straight_line',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      notes TEXT,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryMany(`
    ALTER TABLE ims.fixed_assets
      ADD COLUMN IF NOT EXISTS useful_life_months INTEGER,
      ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS status VARCHAR(30),
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS created_by BIGINT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `);

  await queryMany(`
    UPDATE ims.fixed_assets
       SET useful_life_months = COALESCE(useful_life_months, 12),
           depreciation_method = COALESCE(NULLIF(depreciation_method, ''), 'straight_line'),
           status = COALESCE(NULLIF(status, ''), 'active'),
           created_at = COALESCE(created_at, NOW()),
           updated_at = COALESCE(updated_at, NOW())
  `);

  await queryMany(`
    ALTER TABLE ims.fixed_assets
      ALTER COLUMN useful_life_months SET DEFAULT 12,
      ALTER COLUMN depreciation_method SET DEFAULT 'straight_line',
      ALTER COLUMN status SET DEFAULT 'active',
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW()
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_created
      ON ims.fixed_assets(branch_id, created_at DESC)
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_category
      ON ims.fixed_assets(branch_id, category)
  `);

  fixedAssetsSchemaReady = true;
};

const mapRow = (row: {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  category: string;
  purchase_date: string;
  cost: string | number;
  useful_life_months: number;
  depreciation_method: string;
  status: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}): FixedAssetRow => ({
  asset_id: Number(row.asset_id),
  branch_id: Number(row.branch_id),
  asset_name: row.asset_name,
  category: row.category,
  purchase_date: row.purchase_date,
  cost: Number(row.cost || 0),
  useful_life_months: Number(row.useful_life_months || 0),
  depreciation_method: row.depreciation_method,
  status: row.status,
  notes: row.notes,
  created_by: row.created_by ? Number(row.created_by) : null,
  created_at: row.created_at,
});

export const assetsService = {
  async listFixedAssets(
    scope: BranchScope,
    filters: { search?: string; status?: string; category?: string }
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
      where.push(
        `(fa.asset_name ILIKE $${params.length} OR fa.category ILIKE $${params.length} OR COALESCE(fa.notes, '') ILIKE $${params.length})`
      );
    }

    if (filters.status) {
      params.push(filters.status.trim().toLowerCase());
      where.push(`LOWER(fa.status) = $${params.length}`);
    }

    if (filters.category) {
      params.push(filters.category.trim().toLowerCase());
      where.push(`LOWER(fa.category) = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await queryMany<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      category: string;
      purchase_date: string;
      cost: string | number;
      useful_life_months: number;
      depreciation_method: string;
      status: string;
      notes: string | null;
      created_by: number | null;
      created_at: string;
    }>(
      `SELECT
         fa.asset_id,
         fa.branch_id,
         fa.asset_name,
         fa.category,
         fa.purchase_date::text AS purchase_date,
         fa.cost::text AS cost,
         fa.useful_life_months,
         fa.depreciation_method,
         fa.status,
         fa.notes,
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
    const row = await queryOne<{
      asset_id: number;
      branch_id: number;
      asset_name: string;
      category: string;
      purchase_date: string;
      cost: string | number;
      useful_life_months: number;
      depreciation_method: string;
      status: string;
      notes: string | null;
      created_by: number | null;
      created_at: string;
    }>(
      `INSERT INTO ims.fixed_assets
         (branch_id, asset_name, category, purchase_date, cost, useful_life_months, depreciation_method, status, notes, created_by)
       VALUES
         ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
       RETURNING
         asset_id,
         branch_id,
         asset_name,
         category,
         purchase_date::text AS purchase_date,
         cost::text AS cost,
         useful_life_months,
         depreciation_method,
         status,
         notes,
         created_by,
         created_at::text AS created_at`,
      [
        branchId,
        input.assetName,
        input.category,
        input.purchaseDate,
        input.cost,
        input.usefulLifeMonths,
        input.depreciationMethod,
        input.status || 'active',
        input.notes || null,
        userId,
      ]
    );

    if (!row) {
      throw new Error('Failed to create fixed asset');
    }

    return mapRow(row);
  },

  async updateFixedAsset(
    assetId: number,
    input: UpdateFixedAssetInput,
    scope: BranchScope
  ): Promise<FixedAssetRow | null> {
    await ensureFixedAssetsSchema();

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
    if (input.usefulLifeMonths !== undefined) {
      updates.push(`useful_life_months = $${param++}`);
      values.push(input.usefulLifeMonths);
    }
    if (input.depreciationMethod !== undefined) {
      updates.push(`depreciation_method = $${param++}`);
      values.push(input.depreciationMethod);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${param++}`);
      values.push(input.status);
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${param++}`);
      values.push(input.notes ?? null);
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
        category: string;
        purchase_date: string;
        cost: string | number;
        useful_life_months: number;
        depreciation_method: string;
        status: string;
        notes: string | null;
        created_by: number | null;
        created_at: string;
      }>(
        `SELECT
           fa.asset_id,
           fa.branch_id,
           fa.asset_name,
           fa.category,
           fa.purchase_date::text AS purchase_date,
           fa.cost::text AS cost,
           fa.useful_life_months,
           fa.depreciation_method,
           fa.status,
           fa.notes,
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
      category: string;
      purchase_date: string;
      cost: string | number;
      useful_life_months: number;
      depreciation_method: string;
      status: string;
      notes: string | null;
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
          category,
          purchase_date::text AS purchase_date,
          cost::text AS cost,
          useful_life_months,
          depreciation_method,
          status,
          notes,
          created_by,
          created_at::text AS created_at`,
      params
    );

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
    const deleted = await queryOne<{ asset_id: number }>(
      `DELETE FROM ims.fixed_assets
        WHERE asset_id = $1${scopeSql}
        RETURNING asset_id`,
      params
    );

    return Boolean(deleted);
  },
};
