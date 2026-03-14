import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../db/query';

type SystemAccountKind = 'receivable' | 'payable';

const systemAccountCache = new Map<string, number | null>();

const namePatterns: Record<SystemAccountKind, [string, string]> = {
  receivable: ['accounts receivable%', 'account receivable%'],
  payable: ['accounts payable%', 'account payable%'],
};
const defaultNames: Record<SystemAccountKind, string> = {
  receivable: 'Accounts Receivable',
  payable: 'Accounts Payable',
};

const fetchSeedBalance = async (
  client: PoolClient | null,
  branchId: number,
  kind: SystemAccountKind
): Promise<number> => {
  if (kind === 'receivable') {
    // General rule: AR/AP must be computed from ledgers, not from stored balances.
    // If some records have no ledger history, they should contribute 0.
    const sql = `
      SELECT GREATEST(
        COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0),
        0
      )::text AS amount
      FROM ims.customer_ledger
      WHERE branch_id = $1
    `;
    const row = client
      ? (await client.query<{ amount: string }>(sql, [branchId])).rows[0]
      : await queryOne<{ amount: string }>(sql, [branchId]);
    return Number(row?.amount || 0);
  }

  const sql = `
    SELECT GREATEST(
      COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0),
      0
    )::text AS amount
    FROM ims.supplier_ledger
    WHERE branch_id = $1
  `;
  const row = client
    ? (await client.query<{ amount: string }>(sql, [branchId])).rows[0]
    : await queryOne<{ amount: string }>(sql, [branchId]);
  return Number(row?.amount || 0);
};

const fetchAccountId = async (
  client: PoolClient | null,
  branchId: number,
  kind: SystemAccountKind
): Promise<number | null> => {
  const cacheKey = `${branchId}:${kind}`;
  if (systemAccountCache.has(cacheKey)) {
    return systemAccountCache.get(cacheKey) ?? null;
  }

  const [patternA, patternB] = namePatterns[kind];
  const sql = `
    SELECT acc_id
      FROM ims.accounts
     WHERE branch_id = $1
       AND (LOWER(name) LIKE $2 OR LOWER(name) LIKE $3)
     ORDER BY acc_id
     LIMIT 1
  `;
  const row = client
    ? (await client.query<{ acc_id: number }>(sql, [branchId, patternA, patternB])).rows[0]
    : await queryOne<{ acc_id: number }>(sql, [branchId, patternA, patternB]);
  let accId = row?.acc_id ? Number(row.acc_id) : null;
  if (!accId) {
    const name = defaultNames[kind];
    const insertSql = `
      INSERT INTO ims.accounts (branch_id, name, institution, balance, account_type, is_active)
      VALUES ($1, $2, '', 0, 'asset', FALSE)
      ON CONFLICT DO NOTHING
    `;
    if (client) {
      await client.query(insertSql, [branchId, name]);
    } else {
      await queryOne(insertSql, [branchId, name]);
    }
    const retry = client
      ? (await client.query<{ acc_id: number }>(sql, [branchId, patternA, patternB])).rows[0]
      : await queryOne<{ acc_id: number }>(sql, [branchId, patternA, patternB]);
    accId = retry?.acc_id ? Number(retry.acc_id) : null;
    if (accId) {
      const seedBalance = await fetchSeedBalance(client, branchId, kind);
      if (seedBalance > 0) {
        const updateSql = `
          UPDATE ims.accounts
             SET balance = $1
           WHERE acc_id = $2
             AND branch_id = $3
        `;
        if (client) {
          await client.query(updateSql, [seedBalance, accId, branchId]);
        } else {
          await queryOne(updateSql, [seedBalance, accId, branchId]);
        }
      }
    }
  }
  systemAccountCache.set(cacheKey, accId);
  return accId;
};

export const adjustSystemAccountBalance = async (
  client: PoolClient | null,
  params: { branchId: number; kind: SystemAccountKind; delta: number }
) => {
  if (!params.delta) return;
  const accId = await fetchAccountId(client, params.branchId, params.kind);
  if (!accId) return;

  const sql = `
    UPDATE ims.accounts
       SET balance = balance + $1::numeric
     WHERE acc_id = $2
       AND branch_id = $3
  `;
  if (client) {
    await client.query(sql, [params.delta, accId, params.branchId]);
  } else {
    await queryOne(sql, [params.delta, accId, params.branchId]);
  }
};

const syncForBranch = async (branchId: number) => {
  const kinds: SystemAccountKind[] = ['receivable', 'payable'];
  for (const kind of kinds) {
    const accId = await fetchAccountId(null, branchId, kind);
    if (!accId) continue;
    const target = await fetchSeedBalance(null, branchId, kind);
    await queryOne(
      `UPDATE ims.accounts
          SET balance = $1::numeric
        WHERE acc_id = $2
          AND branch_id = $3`,
      [target, accId, branchId]
    );
  }
};

const syncForBranchWithClient = async (client: PoolClient, branchId: number) => {
  const kinds: SystemAccountKind[] = ['receivable', 'payable'];
  for (const kind of kinds) {
    const accId = await fetchAccountId(client, branchId, kind);
    if (!accId) continue;
    const target = await fetchSeedBalance(client, branchId, kind);
    await client.query(
      `UPDATE ims.accounts
          SET balance = $1::numeric
        WHERE acc_id = $2
          AND branch_id = $3`,
      [target, accId, branchId]
    );
  }
};

export const syncSystemAccountBalances = async (branchId?: number) => {
  if (branchId) {
    await syncForBranch(branchId);
    return;
  }
  const branches = await queryMany<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.branches
      WHERE is_active = TRUE`
  );
  for (const branch of branches) {
    await syncForBranch(Number(branch.branch_id));
  }
};

export const syncSystemAccountBalancesWithClient = async (client: PoolClient, branchId: number) => {
  await syncForBranchWithClient(client, branchId);
};
