import { PoolClient } from 'pg';

const toDateOnly = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

// Credit deadlines are moments, not merely calendar dates.  Date-only values
// are accepted for compatibility with older API clients and mean end of day.
const toDueDateTime = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const addDaysToDueDateTime = (baseDate: string, days: number): string => {
  const base = toDateOnly(baseDate) || new Date().toISOString().slice(0, 10);
  const dt = new Date(`${base}T23:59:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.floor(days)));
  return dt.toISOString();
};

export const addDaysToDate = (baseDate: string, days: number): string => {
  const base = toDateOnly(baseDate) || new Date().toISOString().slice(0, 10);
  const dt = new Date(`${base}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.floor(days)));
  return dt.toISOString().slice(0, 10);
};

export const resolveSaleDueDate = async (
  client: PoolClient,
  params: {
    saleType: 'cash' | 'credit';
    saleDate?: string | null;
    customerId?: number | null;
    dueDateInput?: string | null;
  }
): Promise<string | null> => {
  if (params.saleType !== 'credit') return null;

  const explicit = toDueDateTime(params.dueDateInput);
  if (explicit) return explicit;

  const baseDate = toDateOnly(params.saleDate) || new Date().toISOString().slice(0, 10);
  let creditDays = 30;

  if (params.customerId) {
    const row = await client.query<{ credit_days: number | null; credit_due_at: string | null }>(
      `SELECT credit_days, credit_due_at::text
         FROM ims.customers
        WHERE customer_id = $1
        LIMIT 1`,
      [params.customerId]
    );
    const configuredDeadline = toDueDateTime(row.rows[0]?.credit_due_at);
    if (configuredDeadline) return configuredDeadline;
    creditDays = Math.max(0, Number(row.rows[0]?.credit_days ?? 30));
  }

  return addDaysToDueDateTime(baseDate, creditDays);
};

export const resolvePurchaseDueDate = async (
  _client: PoolClient,
  params: {
    purchaseType: 'cash' | 'credit';
    purchaseDate?: string | null;
    dueDateInput?: string | null;
    defaultDays?: number;
  }
): Promise<string | null> => {
  if (params.purchaseType !== 'credit') return null;

  const explicit = toDateOnly(params.dueDateInput);
  if (explicit) return explicit;

  const baseDate = toDateOnly(params.purchaseDate) || new Date().toISOString().slice(0, 10);
  return addDaysToDate(baseDate, params.defaultDays ?? 30);
};
