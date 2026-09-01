const toLocalIsoDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const todayDate = () => toLocalIsoDate(new Date());

export const startOfMonthDate = () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return toLocalIsoDate(monthStart);
};

export const defaultReportRange = () => ({
  fromDate: startOfMonthDate(),
  toDate: todayDate(),
});

export const defaultAsOfDate = () => todayDate();

export const ensureAsOfDateValid = (asOfDate: string, label: string) => {
  if (!asOfDate) throw new Error(`${label}: as-of date is required`);
};

export const ensureDateRangeValid = (range: { fromDate: string; toDate: string }, label: string) => {
  if (!range.fromDate || !range.toDate) throw new Error(`${label}: both start and end date are required`);
  if (range.fromDate > range.toDate) throw new Error(`${label}: start date cannot be after end date`);
};

export const formatCurrency = (value: unknown) => {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatQuantity = (value: unknown) => {
  const qty = Number(value || 0);
  return qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

export const formatDateTime = (value: unknown) => {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

export const formatDateOnly = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  const raw = String(value);
  const hasTime = /[T:\s]/.test(raw);
  const parsed = new Date(hasTime ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString();
};

export const toRecordRows = <T,>(rows: T[]): Record<string, unknown>[] =>
  rows.map((row) => {
    if (row && typeof row === 'object') {
      return { ...(row as Record<string, unknown>) };
    }
    return {};
  });
