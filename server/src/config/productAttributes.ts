// Phase 9: centralized Dynamic Product Attributes catalog. This is the one
// place new attribute keys get defined - every surface that shows or
// validates them (product form, DataTable, Sales/Purchases lines,
// barcode/search, Excel import/export) reads from here instead of
// hardcoding its own field list. Mirrored at
// frontend/src/config/productAttributes.ts (static, developer-curated
// config, same convention already used for ProductConfig/BusinessProfile
// being mirrored frontend+backend elsewhere in this codebase).
//
// Each category (ims.categories.attribute_keys) picks a subset of these
// keys - that's what lets "Mobile Phones" show Storage/RAM/IMEI while "TVs"
// shows Screen Size/Warranty under the same Electronics business profile,
// without a fixed column (or fixed field list) per business type.

export type ProductAttributeType = 'text' | 'number' | 'select' | 'date';

export type ProductAttributeDef = {
  key: string;
  label: string;
  type: ProductAttributeType;
  options?: string[];
  // When set, this attribute's value lives in this real ims.items column
  // (the Phase 11 flat-column convention) instead of the attributes JSONB
  // bag - keeps backward compatibility with General/Supermarket/Clothing/
  // Pharmacy/Perfume/Cosmetics/Other, which already read/write these
  // columns directly.
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

export const PRODUCT_ATTRIBUTE_KEYS = Object.keys(PRODUCT_ATTRIBUTE_CATALOG);

export const isKnownAttributeKey = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(PRODUCT_ATTRIBUTE_CATALOG, key);

// Default starter categories for the Electronics business profile, each
// with a sensible attribute-key subset. Seeded on request (not silently on
// every business-type switch) via productsService.seedDefaultCategories.
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

export const DEFAULT_CATEGORIES_BY_BUSINESS_TYPE: Record<string, { name: string; attributeKeys: string[] }[]> = {
  electronics: ELECTRONICS_DEFAULT_CATEGORIES,
};

export type NativeAttributeColumn = 'brand' | 'color' | 'size' | 'generic_name' | 'strength' | 'serial_number';

// Splits a raw attributes payload (any mix of catalog keys) into the
// legacy flat columns they cover and the remainder that belongs in the
// attributes JSONB bag - the one place both products.service.ts and the
// Excel importer route a value to the right storage.
export const splitAttributes = (
  attributes: Record<string, string | number | null> | undefined
): { columns: Partial<Record<NativeAttributeColumn, string>>; jsonb: Record<string, string | number> } => {
  const columns: Partial<Record<NativeAttributeColumn, string>> = {};
  const jsonb: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(attributes || {})) {
    if (!isKnownAttributeKey(key)) continue;
    if (value === null || value === '') continue;
    const def = PRODUCT_ATTRIBUTE_CATALOG[key];
    if (def.column) {
      columns[def.column] = String(value);
    } else {
      jsonb[key] = value;
    }
  }
  return { columns, jsonb };
};
