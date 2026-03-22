import { PoolClient } from 'pg';
import { ApiError } from './ApiError';
import { ensureCoaAccount, CoaKey } from './coaDefaults';

export type GlLineInput = {
  accId: number;
  debit?: number;
  credit?: number;
  note?: string | null;
};

export type PostGlParams = {
  branchId: number;
  txnDate?: string | null; // timestamptz-compatible, defaults NOW()
  txnType?: string | null; // ims.account_txn_type_enum label, defaults 'other'
  refTable: string;
  refId: number;
  note: string;
  lines: GlLineInput[];
};

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export const ensureCoreCoa = async (client: PoolClient, branchId: number, keys: CoaKey[]) => {
  const out = {} as Record<CoaKey, number>;
  for (const key of keys) {
    out[key] = await ensureCoaAccount(client, branchId, key);
  }
  return out;
};

export const deleteGlByRef = async (client: PoolClient, params: { branchId: number; refTable: string; refId: number }) => {
  await client.query(
    `DELETE FROM ims.account_transactions
      WHERE branch_id = $1
        AND ref_table = $2
        AND ref_id = $3
        AND COALESCE(note, '') ILIKE '[GL]%'`,
    [params.branchId, params.refTable, params.refId]
  );
};

export const postGl = async (client: PoolClient, params: PostGlParams) => {
  const lines = (params.lines || [])
    .map((line) => ({
      accId: Number(line.accId),
      debit: roundMoney(line.debit || 0),
      credit: roundMoney(line.credit || 0),
      note: line.note ?? null,
    }))
    .filter((line) => (line.debit || 0) !== 0 || (line.credit || 0) !== 0);

  if (lines.length === 0) return;

  for (const line of lines) {
    if (!line.accId || !Number.isFinite(line.accId)) throw ApiError.badRequest('Invalid GL account');
    if (line.debit < 0 || line.credit < 0) throw ApiError.badRequest('GL amounts cannot be negative');
    if (line.debit > 0 && line.credit > 0) throw ApiError.badRequest('GL line cannot have both debit and credit');
  }

  const totalDebit = roundMoney(sum(lines.map((l) => l.debit)));
  const totalCredit = roundMoney(sum(lines.map((l) => l.credit)));
  const diff = roundMoney(totalDebit - totalCredit);
  if (Math.abs(diff) > 0.005) {
    throw ApiError.badRequest(`GL is not balanced (Dr ${totalDebit.toFixed(2)} != Cr ${totalCredit.toFixed(2)})`);
  }

  const txnDateSql = params.txnDate ? `$9::timestamptz` : `NOW()`;
  const txnType = (params.txnType || 'other').trim() || 'other';
  const baseNote = `[GL] ${params.note}`.trim();

  for (const line of lines) {
    await client.query(
      `INSERT INTO ims.account_transactions
         (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
       VALUES ($1, $2, $3::ims.account_txn_type_enum, $4, $5, $6, $7, ${txnDateSql}, $8)`,
      params.txnDate
        ? [
            params.branchId,
            line.accId,
            txnType,
            params.refTable,
            params.refId,
            line.debit,
            line.credit,
            baseNote,
            params.txnDate,
          ]
        : [params.branchId, line.accId, txnType, params.refTable, params.refId, line.debit, line.credit, baseNote]
    );
  }
};
