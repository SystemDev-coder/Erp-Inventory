import { attributeSummary } from '../config/productAttributes';

export const formatAvailableQty = (qty?: number | null): string => {
  if (qty === undefined || qty === null || Number.isNaN(Number(qty))) return '0';
  const n = Number(qty);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

// Phase 9: appends a short attribute caption (e.g. "iPhone 15 - Model:
// iPhone 15 - Storage: 128GB") when the item has any Dynamic Product
// Attributes set, so a Sales/Purchases line picker or a Store Transfer
// product dropdown can tell two similarly-named products apart.
export const itemLabelWithAvailability = (
  itemName: string,
  _qty?: number | null,
  attributes?: Record<string, string | number>
): string => {
  const summary = attributeSummary(attributes);
  return summary ? `${itemName} - ${summary}` : itemName;
};
