// Phase 9: centralized Dynamic Product Attributes catalog. Mirrors
// server/src/config/productAttributes.ts (static, developer-curated
// config - the same "mirror front+back" convention already used for
// ProductConfig/BusinessProfile elsewhere in this app). Every surface that
// shows or edits these fields (product form, DataTable, Sales/Purchases
// line items, Excel import/export column labels) reads from here instead
// of hardcoding its own field list.

export type ProductAttributeType = 'text' | 'number' | 'select' | 'date';

export type ProductAttributeDef = {
  key: string;
  label: string;
  type: ProductAttributeType;
  options?: string[];
  // When set, this attribute's value lives in this real product field (the
  // Phase 11 flat-column convention: itemForm.brand/size/color/genericName/
  // strength/serialNumber) instead of the dynamic attributes bag.
  column?: 'brand' | 'color' | 'size' | 'generic_name' | 'strength' | 'serial_number';
};

export const PRODUCT_ATTRIBUTE_CATALOG: Record<string, ProductAttributeDef> = {
  brand: { key: 'brand', label: 'Brand', type: 'text', column: 'brand' },
  model: { key: 'model', label: 'Model', type: 'text' },
  color: { key: 'color', label: 'Color', type: 'text', column: 'color' },
  size: { key: 'size', label: 'Size', type: 'text', column: 'size' },
  storage: { key: 'storage', label: 'Storage', type: 'text' },
  ram: { key: 'ram', label: 'RAM', type: 'text' },
  processor: { key: 'processor', label: 'Processor', type: 'text' },
  screen_size: { key: 'screen_size', label: 'Screen Size', type: 'text' },
  battery: { key: 'battery', label: 'Battery', type: 'text' },
  connectivity: { key: 'connectivity', label: 'Connectivity', type: 'text' },
  network_type: { key: 'network_type', label: 'Network Type', type: 'select', options: ['2G', '3G', '4G', '5G', 'Wi-Fi Only'] },
  material: { key: 'material', label: 'Material', type: 'text' },
  warranty: { key: 'warranty', label: 'Warranty', type: 'text' },
  serial_number: { key: 'serial_number', label: 'Serial Number', type: 'text', column: 'serial_number' },
  imei: { key: 'imei', label: 'IMEI', type: 'text' },
  generic_name: { key: 'generic_name', label: 'Generic Name', type: 'text', column: 'generic_name' },
  strength: { key: 'strength', label: 'Strength', type: 'text', column: 'strength' },
};

export const ELECTRONICS_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: 'Mobile Phones', attributeKeys: ['brand', 'model', 'storage', 'ram', 'color', 'screen_size', 'network_type', 'imei', 'warranty'] },
  { name: 'Laptops', attributeKeys: ['brand', 'model', 'processor', 'ram', 'storage', 'screen_size', 'color', 'warranty', 'serial_number'] },
  { name: 'Smart Watches', attributeKeys: ['brand', 'model', 'color', 'connectivity', 'battery', 'warranty', 'serial_number'] },
  { name: 'TVs', attributeKeys: ['brand', 'model', 'screen_size', 'color', 'connectivity', 'warranty', 'serial_number'] },
  { name: 'Cameras', attributeKeys: ['brand', 'model', 'storage', 'color', 'warranty', 'serial_number'] },
  { name: 'Accessories', attributeKeys: ['brand', 'model', 'color', 'material', 'warranty'] },
  { name: 'Networking Devices', attributeKeys: ['brand', 'model', 'connectivity', 'network_type', 'warranty', 'serial_number'] },
  { name: 'Other Electronics', attributeKeys: ['brand', 'model', 'color', 'warranty', 'serial_number'] },
];

// Returns the label a value should be edited under: a legacy field name
// (itemForm.brand, .color, ...) when the key has a column mapping, or the
// key itself for the dynamic attributes bag.
export const attributeStorageField = (key: string): string => PRODUCT_ATTRIBUTE_CATALOG[key]?.column || key;

// Short "Model: X · Storage: Y" caption from a product's dynamic
// attributes - shared by the Products DataTable and the Sales/Purchases
// product picker, so a scanned/selected line always shows enough to tell
// two similarly-named products apart (e.g. two "iPhone 15" storage tiers).
export const attributeSummary = (
  attributes: Record<string, string | number> | undefined,
  max = 2
): string => {
  const attrs = attributes || {};
  const keys = Object.keys(attrs).filter((k) => attrs[k] !== '' && attrs[k] !== null && attrs[k] !== undefined);
  if (!keys.length) return '';
  const ordered = keys.includes('model') ? ['model', ...keys.filter((k) => k !== 'model')] : keys;
  return ordered
    .slice(0, max)
    .map((key) => `${PRODUCT_ATTRIBUTE_CATALOG[key]?.label || key}: ${attrs[key]}`)
    .join(' · ');
};
