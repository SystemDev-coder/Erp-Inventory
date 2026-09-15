export const formatAvailableQty = (qty?: number | null): string => {
  if (qty === undefined || qty === null || Number.isNaN(Number(qty))) return '0';
  const n = Number(qty);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

export const itemLabelWithAvailability = (itemName: string, _qty?: number | null): string => itemName;
