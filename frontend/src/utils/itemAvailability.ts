export const formatAvailableQty = (qty?: number | null): string => {
  if (qty === undefined || qty === null || Number.isNaN(Number(qty))) return '0';
  return Number(qty)
    .toFixed(3)
    .replace(/\.?0+$/, '');
};

export const itemLabelWithAvailability = (itemName: string, _qty?: number | null): string => itemName;
