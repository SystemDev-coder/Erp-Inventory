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

