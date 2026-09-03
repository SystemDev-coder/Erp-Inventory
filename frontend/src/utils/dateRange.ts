export const todayYmd = () => new Date().toISOString().slice(0, 10);

export const startOfMonthYmd = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

export const defaultDateRange = () => ({
  fromDate: startOfMonthYmd(),
  toDate: todayYmd(),
});

/** Empty range = no date filter (show all until the user sets From/To). */
export const emptyDateRange = () => ({
  fromDate: '',
  toDate: '',
});

export const optionalDateParam = (value?: string) => {
  const trimmed = String(value || '').trim();
  return trimmed || undefined;
};

