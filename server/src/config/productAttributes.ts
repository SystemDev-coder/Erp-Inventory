// Category Configuration Engine: the product-attribute catalog lives in
// the database (ims.attribute_definitions), not in this file - an admin
// creates a brand-new attribute type from the Category UI with no code
// change or deploy. This file keeps the shared TS type, the DB-backed
// loader (loadAttributeCatalog, branch-scoped, cached), and
// splitAttributes() - the one place that routes an attribute value to a
// real ims.items column vs the attributes JSONB bag.
//
// STARTER_ATTRIBUTE_DEFS below is NOT the runtime catalog anymore - it's
// reference data used only by productsService.seedDefaultCategories() to
// get-or-create the well-known starter-pack attributes (Brand, Model, ...)
// the first time a business clicks "Add <Type> Starter Categories", so
// that convenience feature keeps working without requiring an admin to
// have manually pre-defined every attribute first.

import { queryMany, queryOne } from '../db/query';

export type ProductAttributeType = 'text' | 'number' | 'select' | 'date';

export type ProductAttributeDef = {
  key: string;
  label: string;
  type: ProductAttributeType;
  options?: string[];
  // When set, this attribute's value lives in this real ims.items column
  // instead of the attributes JSONB bag - reserved for the 6 legacy
  // columns; never set on an admin-created attribute.
  column?: 'brand' | 'color' | 'size' | 'generic_name' | 'strength' | 'serial_number';
};

export const STARTER_ATTRIBUTE_DEFS: Record<string, ProductAttributeDef> = {
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

type AttributeDefinitionRow = {
  attribute_id: number;
  key: string;
  label: string;
  data_type: ProductAttributeType;
  options: string[] | null;
  column_name: ProductAttributeDef['column'] | null;
};

const attributeCatalogCache = new Map<number, Record<string, ProductAttributeDef>>();

// Branch-scoped, cached (invalidated by clearAttributeCatalogCache on any
// attribute_definitions write) - the DB-backed replacement for the old
// static PRODUCT_ATTRIBUTE_CATALOG. Every runtime consumer (product
// create/update, Excel import/export) calls this instead of importing a
// static object.
export const loadAttributeCatalog = async (branchId: number): Promise<Record<string, ProductAttributeDef>> => {
  const cached = attributeCatalogCache.get(branchId);
  if (cached) return cached;

  const rows = await queryMany<AttributeDefinitionRow>(
    `SELECT attribute_id, key, label, data_type, options, column_name
       FROM ims.attribute_definitions
      WHERE branch_id = $1
        AND is_active = TRUE
        AND COALESCE(is_deleted, 0) = 0`,
    [branchId]
  );

  const catalog: Record<string, ProductAttributeDef> = {};
  for (const row of rows) {
    catalog[row.key] = {
      key: row.key,
      label: row.label,
      type: row.data_type,
      options: row.options || undefined,
      column: row.column_name || undefined,
    };
  }
  attributeCatalogCache.set(branchId, catalog);
  return catalog;
};

export const clearAttributeCatalogCache = (branchId?: number): void => {
  if (branchId === undefined) {
    attributeCatalogCache.clear();
    return;
  }
  attributeCatalogCache.delete(branchId);
};

export const isKnownAttributeKey = (
  catalog: Record<string, ProductAttributeDef>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(catalog, key);

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

// Starter categories for the other business profiles. Deliberately modest:
// most of what distinguishes these profiles already comes from their
// existing legacy flag-driven fields (Pharmacy's Generic Name/Strength,
// Clothing/Perfume/Cosmetics' Size/Color/Variants) - attribute_keys are
// only added here where they add something those flags don't already
// cover (e.g. a pharmacy's medical equipment having a brand/model/serial/
// warranty, same as electronics, unlike its tablets/syrups). General and
// Other are intentionally left unseeded - a user who picked one of those
// explicitly opted out of a specific vertical, so presuming category names
// for them would be more noise than help.
const SUPERMARKET_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: 'Beverages', attributeKeys: ['size'] },
  { name: 'Snacks & Confectionery', attributeKeys: ['size'] },
  { name: 'Dairy & Eggs', attributeKeys: ['size'] },
  { name: 'Household & Cleaning', attributeKeys: ['size'] },
  { name: 'Personal Care', attributeKeys: ['size'] },
  { name: 'Frozen Foods', attributeKeys: ['size'] },
  { name: 'Bakery', attributeKeys: [] },
  { name: 'Other Grocery', attributeKeys: [] },
];

const CLOTHING_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: 'Shirts', attributeKeys: ['material'] },
  { name: 'Pants', attributeKeys: ['material'] },
  { name: 'Dresses', attributeKeys: ['material'] },
  { name: 'Outerwear', attributeKeys: ['material'] },
  { name: 'Shoes', attributeKeys: ['material'] },
  { name: 'Accessories', attributeKeys: ['material'] },
  { name: 'Kids Wear', attributeKeys: ['material'] },
  { name: 'Other Apparel', attributeKeys: [] },
];

const PHARMACY_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: 'Tablets & Capsules', attributeKeys: [] },
  { name: 'Syrups & Liquids', attributeKeys: [] },
  { name: 'Injections', attributeKeys: [] },
  { name: 'Ointments & Creams', attributeKeys: [] },
  { name: 'Medical Devices & Equipment', attributeKeys: ['brand', 'model', 'serial_number', 'warranty'] },
  { name: 'Supplements', attributeKeys: [] },
  { name: 'First Aid', attributeKeys: [] },
  { name: 'Other Pharmacy', attributeKeys: [] },
];

const PERFUME_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: "Men's Perfume", attributeKeys: [] },
  { name: "Women's Perfume", attributeKeys: [] },
  { name: 'Unisex Perfume', attributeKeys: [] },
  { name: 'Perfume Gift Sets', attributeKeys: [] },
  { name: 'Body Mist & Deodorant', attributeKeys: [] },
  { name: 'Other Fragrance', attributeKeys: [] },
];

const COSMETICS_DEFAULT_CATEGORIES: { name: string; attributeKeys: string[] }[] = [
  { name: 'Skincare', attributeKeys: [] },
  { name: 'Makeup', attributeKeys: [] },
  { name: 'Haircare', attributeKeys: [] },
  { name: 'Nail Care', attributeKeys: [] },
  { name: 'Fragrance', attributeKeys: [] },
  { name: 'Tools & Brushes', attributeKeys: ['material'] },
  { name: 'Other Cosmetics', attributeKeys: [] },
];

export const DEFAULT_CATEGORIES_BY_BUSINESS_TYPE: Record<string, { name: string; attributeKeys: string[] }[]> = {
  electronics: ELECTRONICS_DEFAULT_CATEGORIES,
  supermarket: SUPERMARKET_DEFAULT_CATEGORIES,
  clothing: CLOTHING_DEFAULT_CATEGORIES,
  pharmacy: PHARMACY_DEFAULT_CATEGORIES,
  perfume: PERFUME_DEFAULT_CATEGORIES,
  cosmetics: COSMETICS_DEFAULT_CATEGORIES,
};

export type NativeAttributeColumn = 'brand' | 'color' | 'size' | 'generic_name' | 'strength' | 'serial_number';

// Splits a raw attributes payload (any mix of catalog keys) into the
// legacy flat columns they cover and the remainder that belongs in the
// attributes JSONB bag - the one place both products.service.ts and the
// Excel importer route a value to the right storage.
export const splitAttributes = (
  catalog: Record<string, ProductAttributeDef>,
  attributes: Record<string, string | number | null> | undefined
): { columns: Partial<Record<NativeAttributeColumn, string>>; jsonb: Record<string, string | number> } => {
  const columns: Partial<Record<NativeAttributeColumn, string>> = {};
  const jsonb: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(attributes || {})) {
    if (!isKnownAttributeKey(catalog, key)) continue;
    if (value === null || value === '') continue;
    const def = catalog[key];
    if (def.column) {
      columns[def.column] = String(value);
    } else {
      jsonb[key] = value;
    }
  }
  return { columns, jsonb };
};

// The 6 legacy flat columns an attribute_definitions row can map to via
// column_name - whitelisted before being interpolated as a bare SQL
// identifier (column names can't be bound query parameters), matching the
// "resolve from the DB, then whitelist-interpolate" convention already used
// elsewhere in this codebase (e.g. products.service.ts's ${shape.nameColumn}).
const KNOWN_ATTRIBUTE_COLUMNS = new Set([
  'brand',
  'color',
  'size',
  'generic_name',
  'strength',
  'serial_number',
]);

// Reports "group by attribute value" (Sales by Attribute, Stock by
// Attribute): resolves which real SQL expression holds an attribute's
// value on ims.items, aliased `i` at every call site. Returns null if the
// key isn't a defined attribute for this branch - callers should treat
// that as "nothing to report" (empty result / 404), not build a query.
export const resolveAttributeGroupExpr = async (
  branchId: number,
  attributeKey: string
): Promise<{ expr: string; label: string } | null> => {
  const row = await queryOne<{ column_name: string | null; label: string }>(
    `SELECT column_name, label
       FROM ims.attribute_definitions
      WHERE branch_id = $1
        AND key = $2
        AND is_active = TRUE
        AND COALESCE(is_deleted, 0) = 0`,
    [branchId, attributeKey]
  );
  if (!row) return null;
  if (row.column_name && KNOWN_ATTRIBUTE_COLUMNS.has(row.column_name)) {
    return { expr: `i.${row.column_name}`, label: row.label };
  }
  // JSONB-bag attribute: the key itself came back from a parameterized
  // lookup above (never taken raw from request input), so it's safe to
  // embed as a literal here - same trust level as any other DB-resolved
  // identifier used elsewhere in this file/module.
  return { expr: `i.attributes ->> '${attributeKey.replace(/'/g, "''")}'`, label: row.label };
};
