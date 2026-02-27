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

export const formatDateOnly = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

export const toRecordRows = <T,>(rows: T[]): Record<string, unknown>[] =>
  rows.map((row) => {
    if (row && typeof row === 'object') {
      return { ...(row as Record<string, unknown>) };
    }
    return {};
  });
