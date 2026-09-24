import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { deleteGlByRef, ensureCoreCoa, postGl } from '../../utils/glPosting';
import { syncSystemAccountBalancesWithClient } from '../../utils/systemAccounts';
import { parseSpreadsheet } from './import.parser';
import { PRODUCT_ATTRIBUTE_CATALOG, splitAttributes } from '../../config/productAttributes';
import {
  ImportMode,
  ImportRowError,
  ImportRowSkip,
  ImportSummary,
  ImportType,
  PreviewRow,
} from './import.types';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type ParseResult<T> = {
  data?: T;
  errors: string[];
  preview: Record<string, unknown>;
};

type CandidateRow<T> = {
  row: number;
  raw: Record<string, unknown>;
  data: T;
  errors: string[];
  skipReason?: string;
};

type ImportExecutionOptions = {
  updateExistingBalances?: boolean;
  mode?: ImportMode;
};

type ImportDefinition<T> = {
  type: ImportType;
  requiredHeaders: Array<{ field: string; aliases: string[] }>;
  parseRow: (raw: Record<string, unknown>, row: number) => ParseResult<T>;
  applyBusinessChecks: (
    rows: CandidateRow<T>[],
    branchId: number,
    options: ImportExecutionOptions
  ) => Promise<void>;
  insertRow: (
    client: PoolClient,
    row: T,
    branchId: number,
    options: ImportExecutionOptions
  ) => Promise<'inserted' | 'updated'>;
  toPreviewData: (row: T) => Record<string, unknown>;
};

type CustomerImportRow = {
  full_name: string;
  phone: string | null;
  customer_type: 'regular' | 'one-time';
  sex: 'male' | 'female' | null;
  gender: 'male' | 'female' | null;
  address: string | null;
  remaining_balance: number;
};

type SupplierImportRow = {
  supplier_name: string;
  company_name: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  phone: string | null;
  location: string | null;
  remaining_balance: number;
  is_active: boolean;
};

type ItemImportRow = {
  name: string;
  barcode: string | null;
  stock_alert: number;
  opening_balance: number;
  cost_price: number;
  sell_price: number;
  is_active: boolean;
  store_id: number | null;
  // Raw name text from the file, resolved (and auto-created if new) to an id by
  // applyItemChecks before insertRow runs - mirrors how store_id gets defaulted.
  category_name: string | null;
  unit_name: string | null;
  category_id: number | null;
  unit_id: number | null;
  // Optional - resolved (and auto-created if new) the same way category/unit
  // are, but with no default fallback: a row with no Supplier column simply
  // gets no default supplier linked.
  supplier_name: string | null;
  supplier_id: number | null;
  // Phase 9: any Dynamic Product Attributes catalog column present in the
  // file, keyed the same way the product form/API sends them - routed to
  // the right storage (legacy column vs. attributes JSONB) by insertItem
  // via the same splitAttributes helper products.service.ts uses.
  attributes: Record<string, string>;
};

type CustomerShape = {
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
  balanceColumn: 'open_balance' | 'remaining_balance';
  hasGenderColumn: boolean;
  hasTypeColumn: boolean;
};

type SupplierShape = {
  nameColumn: 'name' | 'supplier_name';
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
  balanceColumn: 'open_balance' | 'remaining_balance';
  locationColumn: 'country' | 'location' | 'company_name';
};

type ItemShape = {
  stockAlertColumn: 'stock_alert' | 'reorder_level';
  catIdRequired: boolean;
  storesTableExists: boolean;
  storeItemsTableExists: boolean;
};

let customerShapeCache: CustomerShape | null = null;
let supplierShapeCache: SupplierShape | null = null;
let itemShapeCache: ItemShape | null = null;
const defaultCategoryByBranch = new Map<number, number>();
const defaultUnitByBranch = new Map<number, number>();

const PREVIEW_LIMIT = 200;

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const readRawValue = (raw: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(raw, alias)) {
      return raw[alias];
    }
  }
  return undefined;
};

const readString = (raw: Record<string, unknown>, aliases: string[]) => {
  const value = readRawValue(raw, aliases);
  if (isBlank(value)) return null;
  return String(value).trim();
};

const normalizeLookup = (value: string) => value.trim().toLowerCase();

const parseNonNegativeNumber = (
  value: unknown,
  field: string,
  errors: string[],
  fallback: number
) => {
  if (isBlank(value)) return fallback;
  const normalized = String(value).replace(/,/g, '').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    errors.push(`${field} must be a valid number`);
    return fallback;
  }
  if (parsed < 0) {
    errors.push(`${field} must be greater than or equal to 0`);
    return fallback;
  }
  return parsed;
};

const parseOptionalPositiveInt = (
  value: unknown,
  field: string,
  errors: string[]
): number | null => {
  if (isBlank(value)) return null;
  const normalized = String(value).replace(/,/g, '').trim();
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return parsed;
};

const parseBooleanLike = (
  value: unknown,
  field: string,
  errors: string[],
  fallback: boolean
): boolean => {
  if (isBlank(value)) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'active'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'inactive'].includes(normalized)) return false;
  errors.push(`${field} must be boolean-like (true/false/1/0/yes/no)`);
  return fallback;
};

const ensureRequiredHeaders = (
  headers: string[],
  required: Array<{ field: string; aliases: string[] }>
) => {
  const missing = required.filter(
    ({ aliases }) => !aliases.some((alias) => headers.includes(alias))
  );
  if (missing.length) {
    const names = missing.map((item) => item.field).join(', ');
    throw ApiError.badRequest(`Missing required columns: ${names}`);
  }
};

const detectCustomerShape = async (): Promise<CustomerShape> => {
  if (customerShapeCache) return customerShapeCache;
  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));
  const hasOpenBalance = names.has('open_balance');
  const hasRemainingBalance = names.has('remaining_balance');
  customerShapeCache = {
    hasOpenBalance,
    hasRemainingBalance,
    // Prefer `remaining_balance` as the live outstanding; keep `open_balance` as opening balance.
    balanceColumn: hasRemainingBalance ? 'remaining_balance' : 'open_balance',
    hasGenderColumn: names.has('gender'),
    hasTypeColumn: names.has('customer_type'),
  };
  return customerShapeCache;
};

const detectSupplierShape = async (): Promise<SupplierShape> => {
  if (supplierShapeCache) return supplierShapeCache;
  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'suppliers'`
  );
  const names = new Set(columns.map((row) => row.column_name));
  const hasOpenBalance = names.has('open_balance');
  const hasRemainingBalance = names.has('remaining_balance');
  supplierShapeCache = {
    nameColumn: names.has('name') ? 'name' : 'supplier_name',
    hasOpenBalance,
    hasRemainingBalance,
    // Prefer `remaining_balance` as the live outstanding; keep `open_balance` as opening balance.
    balanceColumn: hasRemainingBalance ? 'remaining_balance' : 'open_balance',
    locationColumn: names.has('country')
      ? 'country'
      : names.has('location')
      ? 'location'
      : 'company_name',
  };
  return supplierShapeCache;
};

const detectItemShape = async (): Promise<ItemShape> => {
  if (itemShapeCache) return itemShapeCache;

  const columns = await queryMany<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'items'`
  );
  const names = new Map(columns.map((row) => [row.column_name, row.is_nullable]));

  const storesTable = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'stores'
    ) AS exists`
  );
  const storeItemsTable = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'store_items'
    ) AS exists`
  );

  itemShapeCache = {
    stockAlertColumn: names.has('stock_alert') ? 'stock_alert' : 'reorder_level',
    catIdRequired: names.get('cat_id') === 'NO',
    storesTableExists: Boolean(storesTable?.exists),
    storeItemsTableExists: Boolean(storeItemsTable?.exists),
  };

  return itemShapeCache;
};

const ensureDefaultCategory = async (client: PoolClient, branchId: number): Promise<number> => {
  const cached = defaultCategoryByBranch.get(branchId);
  if (cached) return cached;

  const existing = await client.query<{ cat_id: number }>(
    `SELECT cat_id
       FROM ims.categories
      WHERE branch_id = $1
      ORDER BY cat_id
      LIMIT 1`,
    [branchId]
  );
  if (existing.rows[0]?.cat_id) {
    const id = Number(existing.rows[0].cat_id);
    defaultCategoryByBranch.set(branchId, id);
    return id;
  }

  const created = await client.query<{ cat_id: number }>(
    `INSERT INTO ims.categories (branch_id, cat_name, description, is_active)
     VALUES ($1, 'General', 'Auto-created default category for imports', TRUE)
     RETURNING cat_id`,
    [branchId]
  );
  const createdId = Number(created.rows[0]?.cat_id || 0);
  if (!createdId) {
    throw new Error('Failed to create default category');
  }
  defaultCategoryByBranch.set(branchId, createdId);
  return createdId;
};

const ensureDefaultUnit = async (client: PoolClient, branchId: number): Promise<number> => {
  const cached = defaultUnitByBranch.get(branchId);
  if (cached) return cached;

  const existing = await client.query<{ unit_id: number }>(
    `SELECT unit_id
       FROM ims.units
      WHERE branch_id = $1
      ORDER BY unit_id
      LIMIT 1`,
    [branchId]
  );
  if (existing.rows[0]?.unit_id) {
    const id = Number(existing.rows[0].unit_id);
    defaultUnitByBranch.set(branchId, id);
    return id;
  }

  const created = await client.query<{ unit_id: number }>(
    `INSERT INTO ims.units (branch_id, unit_name, symbol, is_active)
     VALUES ($1, 'Piece', 'pc', TRUE)
     RETURNING unit_id`,
    [branchId]
  );
  const createdId = Number(created.rows[0]?.unit_id || 0);
  if (!createdId) {
    throw new Error('Failed to create default unit');
  }
  defaultUnitByBranch.set(branchId, createdId);
  return createdId;
};

// Resolve each row's category/unit NAME (from the uploaded file) to an id, auto-creating a
// new category/unit row the first time a name is seen for this branch, and falling back to
// the branch's default when a row left the column blank - the same "never leave it unset"
// behavior store_id already has via defaultStoreId above.
const resolveItemCategoriesAndUnits = async (
  rows: CandidateRow<ItemImportRow>[],
  branchId: number,
  options: ImportExecutionOptions
) => {
  // Preview is a read-only dry run: toPreviewData shows the raw category/unit text the
  // user typed (falling back to a literal "(default)" label), never the resolved id, so
  // there is nothing for a preview to gain by resolving anything here - and doing so would
  // create real category/unit rows for a file the user hasn't actually committed yet.
  if (options.mode !== 'import') return;

  const activeRows = rows.filter((row) => !row.errors.length && !row.skipReason);
  if (!activeRows.length) return;

  const resolveMasterList = async (
    table: 'categories' | 'units' | 'suppliers',
    idColumn: 'cat_id' | 'unit_id' | 'supplier_id',
    nameColumn: 'cat_name' | 'unit_name' | 'name',
    namesByKey: Map<string, string>
  ) => {
    const map = new Map<string, number>();
    const keys = Array.from(namesByKey.keys());
    if (!keys.length) return map;
    const existing = await queryMany<{ id: number; name_key: string }>(
      `SELECT ${idColumn} AS id, LOWER(${nameColumn}) AS name_key
         FROM ims.${table}
        WHERE branch_id = $1
          AND LOWER(${nameColumn}) = ANY($2::text[])`,
      [branchId, keys]
    );
    for (const row of existing) map.set(row.name_key, Number(row.id));

    const missing = keys.filter((key) => !map.has(key));
    for (const key of missing) {
      // Insert with the original casing the user typed (e.g. "Electronics"), not the
      // lowercase lookup key, so newly auto-created rows read naturally afterward.
      const originalName = namesByKey.get(key) as string;
      const created = await queryOne<{ id: number }>(
        `INSERT INTO ims.${table} (branch_id, ${nameColumn}, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (branch_id, ${nameColumn}) DO UPDATE SET is_active = ims.${table}.is_active
         RETURNING ${idColumn} AS id`,
        [branchId, originalName]
      );
      if (created?.id) map.set(key, Number(created.id));
    }
    return map;
  };

  const collectNamesByKey = (values: string[]) => {
    const map = new Map<string, string>();
    for (const value of values) {
      const key = normalizeLookup(value);
      if (key && !map.has(key)) map.set(key, value.trim());
    }
    return map;
  };

  const categoryNamesByKey = collectNamesByKey(
    activeRows.filter((row) => row.data.category_name).map((row) => row.data.category_name as string)
  );
  const unitNamesByKey = collectNamesByKey(
    activeRows.filter((row) => row.data.unit_name).map((row) => row.data.unit_name as string)
  );

  // Unlike category/unit, supplier is optional - a row with no Supplier
  // column value simply gets no default supplier (matching how the product
  // form itself treats it), not auto-assigned to some fallback.
  const supplierNamesByKey = collectNamesByKey(
    activeRows.filter((row) => row.data.supplier_name).map((row) => row.data.supplier_name as string)
  );

  const [categoryMap, unitMap, supplierMap] = await Promise.all([
    resolveMasterList('categories', 'cat_id', 'cat_name', categoryNamesByKey),
    resolveMasterList('units', 'unit_id', 'unit_name', unitNamesByKey),
    resolveMasterList('suppliers', 'supplier_id', 'name', supplierNamesByKey),
  ]);

  let defaultCategoryId: number | null = null;
  let defaultUnitId: number | null = null;

  for (const row of activeRows) {
    if (row.data.category_name) {
      row.data.category_id = categoryMap.get(normalizeLookup(row.data.category_name)) ?? null;
    }
    if (!row.data.category_id) {
      if (defaultCategoryId === null) {
        defaultCategoryId = await withTransaction((client) => ensureDefaultCategory(client, branchId));
      }
      row.data.category_id = defaultCategoryId;
    }

    if (row.data.unit_name) {
      row.data.unit_id = unitMap.get(normalizeLookup(row.data.unit_name)) ?? null;
    }
    if (!row.data.unit_id) {
      if (defaultUnitId === null) {
        defaultUnitId = await withTransaction((client) => ensureDefaultUnit(client, branchId));
      }
      row.data.unit_id = defaultUnitId;
    }

    // No fallback here (unlike category/unit above) - a row with no
    // Supplier column value stays supplier_id = null.
    if (row.data.supplier_name) {
      row.data.supplier_id = supplierMap.get(normalizeLookup(row.data.supplier_name)) ?? null;
    }
  }
};

const uniqueLowerSet = (values: string[]) =>
  Array.from(new Set(values.map((value) => normalizeLookup(value))));

const addFileDuplicateSkips = <T>(
  rows: CandidateRow<T>[],
  getValue: (row: CandidateRow<T>) => string | null,
  label: string
) => {
  const firstSeen = new Map<string, number>();
  for (const row of rows) {
    if (row.errors.length) continue;
    const value = getValue(row);
    if (!value) continue;
    const key = normalizeLookup(value);
    const existingRow = firstSeen.get(key);
    if (existingRow) {
      if (!row.skipReason) {
        row.skipReason = `${label} "${value}" is duplicated in the uploaded file (first at row ${existingRow})`;
      }
      continue;
    }
    firstSeen.set(key, row.row);
  }
};

const parseCustomerRow = (raw: Record<string, unknown>): ParseResult<CustomerImportRow> => {
  const errors: string[] = [];
  const fullName = readString(raw, ['full_name', 'customer_name', 'name']) || '';
  const phone = readString(raw, ['phone', 'phone_number', 'mobile', 'contact_phone']);
  const customerTypeRaw = readString(raw, ['customer_type', 'type']);
  const genderRaw = readString(raw, ['gender', 'sex']);
  const address = readString(raw, ['address']);
  const remainingBalanceRaw = readRawValue(raw, [
    'remaining_balance',
    'open_balance',
    'balance',
  ]);

  if (!fullName) {
    errors.push('full_name is required');
  } else if (fullName.length > 160) {
    errors.push('full_name must be at most 160 characters');
  }

  if (phone && phone.length > 30) {
    errors.push('phone must be at most 30 characters');
  }

  let customerType: 'regular' | 'one-time' = 'regular';
  if (customerTypeRaw) {
    const normalizedType = customerTypeRaw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
    if (
      normalizedType === 'regular'
    ) {
      customerType = 'regular';
    } else if (
      normalizedType === 'one time visitor' ||
      normalizedType === 'one time'
    ) {
      customerType = 'one-time';
    }
  }

  let gender: 'male' | 'female' | null = null;
  if (genderRaw) {
    const normalized = genderRaw.toLowerCase();
    if (normalized === 'male' || normalized === 'female') {
      gender = normalized;
    } else {
      errors.push('gender/sex must be male or female');
    }
  }

  const remainingBalance = parseNonNegativeNumber(
    remainingBalanceRaw,
    'remaining_balance',
    errors,
    0
  );

  const data: CustomerImportRow = {
    full_name: fullName,
    phone: phone || null,
    customer_type: customerType,
    sex: gender,
    gender,
    address: address || null,
    remaining_balance: remainingBalance,
  };

  return {
    data: errors.length ? undefined : data,
    errors,
    preview: data,
  };
};

const parseSupplierRow = (raw: Record<string, unknown>): ParseResult<SupplierImportRow> => {
  const errors: string[] = [];
  // A bare "Name" column is ambiguous between the business name and a contact's
  // name - most uploads that have it alongside a "Company" column mean the
  // latter, so "name" is a contact_person alias, not a supplier_name one.
  // "Company"/"Company Name" still fall back to supplier_name (checked last)
  // when there's no more specific business-name column, since that's the most
  // common header for it in practice.
  const supplierName =
    readString(raw, ['supplier_name', 'supplier', 'business_name', 'company', 'company_name']) || '';
  const companyName = readString(raw, ['company_name', 'company']);
  const contactPerson = readString(raw, ['contact_person', 'contact_name', 'contact', 'name']);
  const contactPhone = readString(raw, ['contact_phone']);
  const phone = readString(raw, ['phone', 'mobile']);
  const location = readString(raw, ['location', 'country']);
  const remainingBalanceRaw = readRawValue(raw, [
    'remaining_balance',
    'open_balance',
    'balance',
  ]);
  const isActiveRaw = readRawValue(raw, ['is_active', 'active', 'status']);

  if (!supplierName) {
    errors.push('supplier_name is required');
  } else if (supplierName.length > 140) {
    errors.push('supplier_name must be at most 140 characters');
  }

  if (companyName && companyName.length > 80) {
    errors.push('company_name must be at most 80 characters');
  }

  if (contactPerson && contactPerson.length > 140) {
    errors.push('contact_person must be at most 140 characters');
  }

  if (contactPhone && contactPhone.length > 30) {
    errors.push('contact_phone must be at most 30 characters');
  }

  if (phone && phone.length > 30) {
    errors.push('phone must be at most 30 characters');
  }

  if (location && location.length > 80) {
    errors.push('location/country must be at most 80 characters');
  }

  if (isBlank(remainingBalanceRaw)) {
    errors.push('remaining_balance is required');
  }

  const remainingBalance = parseNonNegativeNumber(
    remainingBalanceRaw,
    'remaining_balance',
    errors,
    0
  );
  const isActive = parseBooleanLike(isActiveRaw, 'is_active', errors, true);

  const data: SupplierImportRow = {
    supplier_name: supplierName,
    company_name: companyName || null,
    contact_person: contactPerson || null,
    contact_phone: contactPhone || null,
    phone: phone || null,
    location: location || null,
    remaining_balance: remainingBalance,
    is_active: isActive,
  };

  return {
    data: errors.length ? undefined : data,
    errors,
    preview: data,
  };
};

const parseItemRow = (raw: Record<string, unknown>): ParseResult<ItemImportRow> => {
  const errors: string[] = [];
  const name = readString(raw, ['name', 'item']) || '';
  const barcode = readString(raw, ['barcode', 'bar_code', 'sku']);
  const stockAlertRaw = readRawValue(raw, ['stock_alert', 'stockalert', 'reorder_level']);
  const openingBalanceRaw = readRawValue(raw, ['opening_balance', 'opening_stock', 'quantity']);
  const costPriceRaw = readRawValue(raw, ['cost_price', 'cost']);
  const sellPriceRaw = readRawValue(raw, ['sell_price', 'price']);
  const isActiveRaw = readRawValue(raw, ['is_active', 'active', 'status']);
  const storeIdRaw = readRawValue(raw, ['store_id', 'store']);
  const branchFromFile = readRawValue(raw, ['branch_id', 'branch']);
  const categoryName = readString(raw, ['category', 'category_name']);
  const unitName = readString(raw, ['unit', 'unit_name']);
  const supplierName = readString(raw, ['supplier', 'supplier_name']);

  if (!name) {
    errors.push('item is required');
  } else if (name.length > 160) {
    errors.push('item must be at most 160 characters');
  }

  if (barcode && barcode.length > 80) {
    errors.push('barcode must be at most 80 characters');
  }

  if (!isBlank(branchFromFile)) {
    errors.push('branch_id must not be provided in the file; it is derived from your session');
  }

  if (isBlank(openingBalanceRaw)) {
    errors.push('quantity is required');
  }
  if (isBlank(costPriceRaw)) {
    errors.push('cost_price is required');
  }
  if (isBlank(sellPriceRaw)) {
    errors.push('sell_price is required');
  }

  const stockAlert = parseNonNegativeNumber(stockAlertRaw, 'stock_alert', errors, 5);
  const openingBalance = parseNonNegativeNumber(
    openingBalanceRaw,
    'quantity',
    errors,
    0
  );
  const costPrice = parseNonNegativeNumber(costPriceRaw, 'cost_price', errors, 0);
  const sellPrice = parseNonNegativeNumber(sellPriceRaw, 'sell_price', errors, 0);
  const isActive = parseBooleanLike(isActiveRaw, 'is_active', errors, true);
  const storeId = parseOptionalPositiveInt(storeIdRaw, 'store_id', errors);

  // Phase 9: any catalog column present in this row's file (matched by its
  // key, e.g. "Screen Size" -> screen_size, same as every other header
  // here) - whatever isn't present is simply omitted, never an error, so
  // every business profile's template (which lists every possible
  // attribute column) works for every other profile too.
  const attributes: Record<string, string> = {};
  for (const def of Object.values(PRODUCT_ATTRIBUTE_CATALOG)) {
    const value = readString(raw, [def.key]);
    if (value) attributes[def.key] = value;
  }

  const data: ItemImportRow = {
    name,
    barcode: barcode || null,
    stock_alert: stockAlert,
    opening_balance: openingBalance,
    cost_price: costPrice,
    sell_price: sellPrice,
    is_active: isActive,
    store_id: storeId,
    category_name: categoryName || null,
    unit_name: unitName || null,
    category_id: null,
    unit_id: null,
    supplier_name: supplierName || null,
    supplier_id: null,
    attributes,
  };

  return {
    data: errors.length ? undefined : data,
    errors,
    preview: data,
  };
};

const applyCustomerChecks = async (
  rows: CandidateRow<CustomerImportRow>[],
  branchId: number,
  options: ImportExecutionOptions
) => {
  addFileDuplicateSkips(rows, (row) => row.data.phone, 'Phone');

  if (options.updateExistingBalances) return;

  const phones = uniqueLowerSet(
    rows
      .filter((row) => !row.errors.length && !row.skipReason && row.data.phone)
      .map((row) => row.data.phone as string)
  );

  if (!phones.length) return;

  const existing = await queryMany<{ phone_key: string }>(
    `SELECT LOWER(phone) AS phone_key
       FROM ims.customers
      WHERE branch_id = $1
        AND phone IS NOT NULL
        AND LOWER(phone) = ANY($2::text[])`,
    [branchId, phones]
  );
  const existingSet = new Set(existing.map((row) => row.phone_key));

  for (const row of rows) {
    if (row.errors.length || row.skipReason || !row.data.phone) continue;
    if (existingSet.has(normalizeLookup(row.data.phone))) {
      row.skipReason = `Phone "${row.data.phone}" already exists in this branch`;
    }
  }
};

const applySupplierChecks = async (
  rows: CandidateRow<SupplierImportRow>[],
  branchId: number,
  options: ImportExecutionOptions
) => {
  addFileDuplicateSkips(rows, (row) => row.data.supplier_name, 'Supplier name');

  if (options.updateExistingBalances) return;

  const supplierNames = uniqueLowerSet(
    rows
      .filter((row) => !row.errors.length && !row.skipReason)
      .map((row) => row.data.supplier_name)
  );
  if (!supplierNames.length) return;

  const shape = await detectSupplierShape();
  const existing = await queryMany<{ name_key: string }>(
    `SELECT LOWER(${shape.nameColumn}) AS name_key
       FROM ims.suppliers
      WHERE branch_id = $1
        AND LOWER(${shape.nameColumn}) = ANY($2::text[])`,
    [branchId, supplierNames]
  );
  const existingSet = new Set(existing.map((row) => row.name_key));

  for (const row of rows) {
    if (row.errors.length || row.skipReason) continue;
    if (existingSet.has(normalizeLookup(row.data.supplier_name))) {
      row.skipReason = `Supplier "${row.data.supplier_name}" already exists in this branch`;
    }
  }
};

const applyItemChecks = async (
  rows: CandidateRow<ItemImportRow>[],
  branchId: number,
  options: ImportExecutionOptions
) => {
  addFileDuplicateSkips(rows, (row) => row.data.name, 'Item name');
  addFileDuplicateSkips(
    rows,
    (row) => row.data.barcode,
    'Barcode'
  );

  const names = uniqueLowerSet(
    rows
      .filter((row) => !row.errors.length && !row.skipReason)
      .map((row) => row.data.name)
  );
  if (names.length) {
    const existingByName = await queryMany<{ name_key: string }>(
      `SELECT LOWER(name) AS name_key
         FROM ims.items
        WHERE branch_id = $1
          AND LOWER(name) = ANY($2::text[])`,
      [branchId, names]
    );
    const existingNameSet = new Set(existingByName.map((row) => row.name_key));
    for (const row of rows) {
      if (row.errors.length || row.skipReason) continue;
      if (existingNameSet.has(normalizeLookup(row.data.name))) {
        row.skipReason = `Item name "${row.data.name}" already exists in this branch`;
      }
    }
  }

  const barcodes = uniqueLowerSet(
    rows
      .filter((row) => !row.errors.length && !row.skipReason && row.data.barcode)
      .map((row) => row.data.barcode as string)
  );
  if (barcodes.length) {
    const existingByBarcode = await queryMany<{ barcode_key: string }>(
      `SELECT LOWER(barcode) AS barcode_key
         FROM ims.items
        WHERE branch_id = $1
          AND barcode IS NOT NULL
          AND LOWER(barcode) = ANY($2::text[])`,
      [branchId, barcodes]
    );
    const existingBarcodeSet = new Set(existingByBarcode.map((row) => row.barcode_key));
    for (const row of rows) {
      if (row.errors.length || row.skipReason || !row.data.barcode) continue;
      if (existingBarcodeSet.has(normalizeLookup(row.data.barcode))) {
        row.skipReason = `Barcode "${row.data.barcode}" already exists in this branch`;
      }
    }
  }

  const shape = await detectItemShape();
  if (!shape.storesTableExists) return;

  // Ensure branch has at least Main Store, then require/assign store_id for every item row.
  let defaultStoreId = 0;
  const existingAny = await queryOne<{ store_id: number }>(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
      ORDER BY CASE WHEN LOWER(store_name) = 'main store' THEN 0 ELSE 1 END, store_id
      LIMIT 1`,
    [branchId]
  );
  defaultStoreId = Number(existingAny?.store_id || 0);
  if (!defaultStoreId) {
    const created = await queryOne<{ store_id: number }>(
      `INSERT INTO ims.stores (branch_id, store_name, store_code, is_active)
       VALUES ($1::bigint, 'Main Store', 'MAIN-' || LPAD($1::bigint::text, 3, '0'), TRUE)
       ON CONFLICT (branch_id, store_name)
       DO UPDATE SET is_active = TRUE
       RETURNING store_id`,
      [branchId]
    );
    defaultStoreId = Number(created?.store_id || 0);
  }

  if (!defaultStoreId) {
    for (const row of rows) {
      if (row.errors.length || row.skipReason) continue;
      row.errors.push('Could not create or resolve a default store for this branch');
    }
    return;
  }

  for (const row of rows) {
    if (row.errors.length || row.skipReason) continue;
    if (!row.data.store_id) {
      row.data.store_id = defaultStoreId;
    }
  }

  const storeIds = Array.from(
    new Set(
      rows
        .filter((row) => !row.errors.length && row.data.store_id)
        .map((row) => Number(row.data.store_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  if (!storeIds.length) return;

  const existingStores = await queryMany<{ store_id: number }>(
    `SELECT store_id
       FROM ims.stores
      WHERE branch_id = $1
        AND store_id = ANY($2::bigint[])`,
    [branchId, storeIds]
  );
  const storeSet = new Set(existingStores.map((row) => Number(row.store_id)));

  for (const row of rows) {
    if (row.errors.length || !row.data.store_id) continue;
    if (!storeSet.has(row.data.store_id)) {
      row.errors.push(`store_id ${row.data.store_id} does not exist in this branch`);
    }
  }

  await resolveItemCategoriesAndUnits(rows, branchId, options);
};

const hasCustomerNonOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.customer_ledger
        WHERE branch_id = $1
          AND customer_id = $2
          AND NOT (entry_type = 'opening' AND ref_table = 'opening_balance')
     ) AS exists`,
    [branchId, customerId]
  );
  return Boolean(result.rows[0]?.exists);
};

const upsertCustomerOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number,
  amount: number
) => {
  await client.query(
    `DELETE FROM ims.customer_ledger
      WHERE branch_id = $1
        AND customer_id = $2
        AND entry_type = 'opening'
        AND ref_table = 'opening_balance'`,
    [branchId, customerId]
  );

  const coa = await ensureCoreCoa(client, branchId, ['accountsReceivable', 'openingBalanceEquity']);
  // H4 fix: reverse this ref's previous Opening Balance Equity contribution
  // to accounts.balance before the old GL rows are deleted below - it was
  // never mirrored into accounts.balance at all (same gap fixed in
  // customers.service.ts#upsertCustomerOpeningLedger). Accounts Receivable
  // is deliberately left out here; it's resynced from the ledger below.
  const priorObeRows = await client.query<{ debit: string; credit: string }>(
    `SELECT debit, credit FROM ims.account_transactions
      WHERE branch_id = $1 AND ref_table = 'opening_balance' AND ref_id = $2
        AND acc_id = $3 AND COALESCE(is_deleted, 0) = 0`,
    [branchId, customerId, coa.openingBalanceEquity]
  );
  for (const row of priorObeRows.rows) {
    const delta = -(Number(row.credit) - Number(row.debit));
    if (delta) {
      await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
        delta,
        coa.openingBalanceEquity,
        branchId,
      ]);
    }
  }

  // Same GL sync the manual customer opening-balance edit uses (see
  // customers.service.ts#upsertCustomerOpeningLedger): replace any prior
  // opening-balance journal entry for this customer, then re-post it if the
  // new amount is non-zero, so Accounts Receivable never drifts from what
  // the imported subsidiary ledger shows. deleteGlByRef matches on
  // (branchId, refTable, refId), which also makes this safe to re-run for
  // the same customer without creating duplicate GL entries.
  await deleteGlByRef(client, { branchId, refTable: 'opening_balance', refId: customerId });

  if (!amount) return;

  await client.query(
    `INSERT INTO ims.customer_ledger
      (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
     VALUES
      ($1, $2, 'opening', 'opening_balance', $2, NULL, $3, 0, NOW() - INTERVAL '1 second', $4)`,
    [branchId, customerId, amount, '[OPENING BALANCE] Imported from spreadsheet']
  );

  await postGl(client, {
    branchId,
    refTable: 'opening_balance',
    refId: customerId,
    note: 'Customer opening balance (import)',
    lines: [
      { accId: coa.accountsReceivable, debit: amount, credit: 0, note: 'Customer receivable (imported opening balance)' },
      { accId: coa.openingBalanceEquity, debit: 0, credit: amount, note: 'Opening balance equity' },
    ],
  });
  // H4 fix: Opening Balance Equity credit above was never mirrored into
  // accounts.balance. Equity - credit increases it.
  await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
    amount,
    coa.openingBalanceEquity,
    branchId,
  ]);

  // Keep the cached Accounts Receivable system-account balance in sync in the
  // same transaction, matching the manual flow - the Balance Sheet reads that
  // stored balance directly rather than re-deriving it from account_transactions.
  await syncSystemAccountBalancesWithClient(client, branchId);
};

const insertCustomer = async (
  client: PoolClient,
  row: CustomerImportRow,
  branchId: number,
  options: ImportExecutionOptions
): Promise<'inserted' | 'updated'> => {
  const shape = await detectCustomerShape();

  const phoneKey = row.phone ? normalizeLookup(row.phone) : null;
  const existing = phoneKey
    ? await client.query<{ customer_id: number }>(
        `SELECT customer_id
           FROM ims.customers
          WHERE branch_id = $1
            AND phone IS NOT NULL
            AND LOWER(phone) = $2
          LIMIT 1`,
        [branchId, phoneKey]
      )
    : null;
  const existingId = Number(existing?.rows?.[0]?.customer_id || 0) || null;

  if (existingId && options.updateExistingBalances) {
    if (await hasCustomerNonOpeningLedger(client, branchId, existingId)) {
      throw new ImportSkipError(
        `Customer "${row.full_name}" has transactions; cannot update opening balance`
      );
    }

    const updates: string[] = ['full_name = $2'];
    const values: unknown[] = [branchId, row.full_name];
    let p = 3;

    updates.push(`phone = $${p++}`);
    values.push(row.phone);

    updates.push(`sex = $${p++}::ims.sex_enum`);
    values.push(row.sex);

    if (shape.hasGenderColumn) {
      updates.push(`gender = $${p++}`);
      values.push(row.gender);
    }

    if (shape.hasTypeColumn) {
      updates.push(`customer_type = $${p++}`);
      values.push(row.customer_type);
    }

    updates.push(`address = $${p++}`);
    values.push(row.address);

    // If the schema has `remaining_balance`, treat it as the single source-of-truth for outstanding/opening balance.
    // Do NOT also populate `open_balance` (legacy) because "Prepare Accounts" migrations would double-count it.
    if (shape.hasRemainingBalance) {
      updates.push(`remaining_balance = $${p++}`);
      values.push(row.remaining_balance);
      if (shape.hasOpenBalance) {
        updates.push(`open_balance = 0`);
      }
    } else if (shape.hasOpenBalance) {
      updates.push(`open_balance = $${p++}`);
      values.push(row.remaining_balance);
    } else {
      updates.push(`${shape.balanceColumn} = $${p++}`);
      values.push(row.remaining_balance);
    }

    updates.push(`is_active = TRUE`);

    await client.query(
      `UPDATE ims.customers
          SET ${updates.join(', ')}
        WHERE branch_id = $1
          AND customer_id = $${p}`,
      [...values, existingId]
    );

    if (shape.hasOpenBalance || shape.hasRemainingBalance) {
      await upsertCustomerOpeningLedger(client, branchId, existingId, row.remaining_balance);
    }

    return 'updated';
  }

  const columns: string[] = ['branch_id', 'full_name', 'phone', 'sex'];
  const placeholders: string[] = ['$1', '$2', '$3', '$4::ims.sex_enum'];
  const values: unknown[] = [branchId, row.full_name, row.phone, row.sex];

  if (shape.hasGenderColumn) {
    columns.push('gender');
    placeholders.push(`$${values.length + 1}`);
    values.push(row.gender);
  }
  if (shape.hasTypeColumn) {
    columns.push('customer_type');
    placeholders.push(`$${values.length + 1}`);
    values.push(row.customer_type);
  }

  columns.push('address');
  placeholders.push(`$${values.length + 1}`);
  values.push(row.address);

   if (shape.hasRemainingBalance) {
     columns.push('remaining_balance');
     placeholders.push(`$${values.length + 1}`);
     values.push(row.remaining_balance);
     if (shape.hasOpenBalance) {
       columns.push('open_balance');
       placeholders.push(`$${values.length + 1}`);
       values.push(0);
     }
   } else if (shape.hasOpenBalance) {
     columns.push('open_balance');
     placeholders.push(`$${values.length + 1}`);
     values.push(row.remaining_balance);
   } else {
     columns.push(shape.balanceColumn);
     placeholders.push(`$${values.length + 1}`);
     values.push(row.remaining_balance);
   }

  columns.push('is_active');
  placeholders.push(`$${values.length + 1}`);
  // Customer imports always default to active status.
  values.push(true);

  const inserted = await client.query<{ customer_id: number }>(
    `INSERT INTO ims.customers (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING customer_id`,
    values
  );

  const customerId = Number(inserted.rows[0]?.customer_id || 0);
  if (!customerId) {
    throw new Error('Failed to insert customer');
  }

  if (shape.hasOpenBalance || shape.hasRemainingBalance) {
    await upsertCustomerOpeningLedger(client, branchId, customerId, row.remaining_balance);
  }

  return 'inserted';
};

const hasSupplierNonOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  supplierId: number
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.supplier_ledger
        WHERE branch_id = $1
          AND supplier_id = $2
          AND NOT (entry_type = 'opening' AND ref_table = 'opening_balance')
     ) AS exists`,
    [branchId, supplierId]
  );
  return Boolean(result.rows[0]?.exists);
};

const upsertSupplierOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  supplierId: number,
  amount: number
) => {
  await client.query(
    `DELETE FROM ims.supplier_ledger
      WHERE branch_id = $1
        AND supplier_id = $2
        AND entry_type = 'opening'
        AND ref_table = 'opening_balance'`,
    [branchId, supplierId]
  );

  const coa = await ensureCoreCoa(client, branchId, ['accountsPayable', 'openingBalanceEquity']);
  // H4 fix: reverse this ref's previous Opening Balance Equity contribution
  // to accounts.balance before the old GL rows are deleted below - it was
  // never mirrored into accounts.balance at all (same gap fixed in
  // suppliers.service.ts#upsertSupplierOpeningLedger). Accounts Payable is
  // deliberately left out here; it's resynced from the ledger below.
  const priorObeRows = await client.query<{ debit: string; credit: string }>(
    `SELECT debit, credit FROM ims.account_transactions
      WHERE branch_id = $1 AND ref_table = 'opening_balance' AND ref_id = $2
        AND acc_id = $3 AND COALESCE(is_deleted, 0) = 0`,
    [branchId, supplierId, coa.openingBalanceEquity]
  );
  for (const row of priorObeRows.rows) {
    const delta = -(Number(row.credit) - Number(row.debit));
    if (delta) {
      await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
        delta,
        coa.openingBalanceEquity,
        branchId,
      ]);
    }
  }

  // Same GL sync the manual supplier opening-balance edit uses (see
  // suppliers.service.ts#upsertSupplierOpeningLedger): replace any prior
  // opening-balance journal entry for this supplier, then re-post it if the
  // new amount is non-zero, so Accounts Payable never drifts from what the
  // imported subsidiary ledger shows. deleteGlByRef matches on (branchId,
  // refTable, refId), which also makes this safe to re-run for the same
  // supplier without creating duplicate GL entries.
  await deleteGlByRef(client, { branchId, refTable: 'opening_balance', refId: supplierId });

  if (!amount) return;

  await client.query(
    `INSERT INTO ims.supplier_ledger
      (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
     VALUES
      ($1, $2, 'opening', 'opening_balance', $2, NULL, 0, $3, NOW() - INTERVAL '1 second', $4)`,
    [branchId, supplierId, amount, '[OPENING BALANCE] Imported from spreadsheet']
  );

  await postGl(client, {
    branchId,
    refTable: 'opening_balance',
    refId: supplierId,
    note: 'Supplier opening balance (import)',
    lines: [
      { accId: coa.openingBalanceEquity, debit: amount, credit: 0, note: 'Opening balance equity' },
      { accId: coa.accountsPayable, debit: 0, credit: amount, note: 'Supplier payable (imported opening balance)' },
    ],
  });
  // H4 fix: Opening Balance Equity debit above was never mirrored into
  // accounts.balance. Equity - debit decreases it.
  await client.query(`UPDATE ims.accounts SET balance = balance - $1 WHERE acc_id = $2 AND branch_id = $3`, [
    amount,
    coa.openingBalanceEquity,
    branchId,
  ]);

  // Keep the cached Accounts Payable system-account balance in sync in the
  // same transaction, matching the manual flow.
  await syncSystemAccountBalancesWithClient(client, branchId);
};

const insertSupplier = async (
  client: PoolClient,
  row: SupplierImportRow,
  branchId: number,
  options: ImportExecutionOptions
): Promise<'inserted' | 'updated'> => {
  const shape = await detectSupplierShape();
  const locationValue =
    shape.locationColumn === 'company_name'
      ? row.company_name ?? row.location ?? null
      : row.location ?? row.company_name ?? null;

  const existing = await client.query<{ supplier_id: number }>(
    `SELECT supplier_id
       FROM ims.suppliers
      WHERE branch_id = $1
        AND LOWER(${shape.nameColumn}) = LOWER($2)
      LIMIT 1`,
    [branchId, row.supplier_name]
  );
  const existingId = Number(existing.rows[0]?.supplier_id || 0) || null;

  if (existingId && options.updateExistingBalances) {
    if (await hasSupplierNonOpeningLedger(client, branchId, existingId)) {
      throw new ImportSkipError(
        `Supplier "${row.supplier_name}" has transactions; cannot update opening balance`
      );
    }

    const updates: string[] = [
      `${shape.nameColumn} = $2`,
      `${shape.locationColumn} = $3`,
      `phone = $4`,
      `is_active = $5`,
    ];
    const values: unknown[] = [branchId, row.supplier_name, locationValue, row.phone, row.is_active];
    let p = 6;

    // If `remaining_balance` exists, keep it as the only balance column and do not also set `open_balance`.
    if (shape.hasRemainingBalance) {
      updates.push(`remaining_balance = $${p++}`);
      values.push(row.remaining_balance);
      if (shape.hasOpenBalance) {
        updates.push(`open_balance = 0`);
      }
    } else if (shape.hasOpenBalance) {
      updates.push(`open_balance = $${p++}`);
      values.push(row.remaining_balance);
    } else {
      updates.push(`${shape.balanceColumn} = $${p++}`);
      values.push(row.remaining_balance);
    }

    await client.query(
      `UPDATE ims.suppliers
          SET ${updates.join(', ')}
        WHERE branch_id = $1
          AND supplier_id = $${p}`,
      [...values, existingId]
    );

    if (shape.hasOpenBalance || shape.hasRemainingBalance) {
      await upsertSupplierOpeningLedger(client, branchId, existingId, row.remaining_balance);
    }

    return 'updated';
  }

  const columns: string[] = [
    'branch_id',
    shape.nameColumn,
    shape.locationColumn,
    'phone',
  ];
  const placeholders: string[] = ['$1', '$2', '$3', '$4'];
  const values: unknown[] = [branchId, row.supplier_name, locationValue, row.phone];

  if (shape.hasRemainingBalance) {
    columns.push('remaining_balance');
    placeholders.push(`$${values.length + 1}`);
    values.push(row.remaining_balance);
    if (shape.hasOpenBalance) {
      columns.push('open_balance');
      placeholders.push(`$${values.length + 1}`);
      values.push(0);
    }
  } else if (shape.hasOpenBalance) {
    columns.push('open_balance');
    placeholders.push(`$${values.length + 1}`);
    values.push(row.remaining_balance);
  } else {
    columns.push(shape.balanceColumn);
    placeholders.push(`$${values.length + 1}`);
    values.push(row.remaining_balance);
  }

  columns.push('is_active');
  placeholders.push(`$${values.length + 1}`);
  values.push(row.is_active);

  const inserted = await client.query<{ supplier_id: number }>(
    `INSERT INTO ims.suppliers (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING supplier_id`,
    values
  );

  const supplierId = Number(inserted.rows[0]?.supplier_id || 0);
  if (!supplierId) {
    throw new Error('Failed to insert supplier');
  }

  if (shape.hasOpenBalance || shape.hasRemainingBalance) {
    await upsertSupplierOpeningLedger(client, branchId, supplierId, row.remaining_balance);
  }

  return 'inserted';
};

// Same opening-stock GL posting the manual product-creation flow already does
// (see products.service.ts#rewriteItemOpeningStockGl) - opening stock
// (opening_balance * cost_price) must be reflected in the GL as an Inventory
// asset, or the Balance Sheet's Inventory figure silently omits whatever
// stock an imported item started with. deleteGlByRef first makes this safe
// to re-run for the same item without creating duplicate GL entries.
const postItemOpeningStockGl = async (
  client: PoolClient,
  params: { branchId: number; itemId: number; itemName: string; openingBalance: number; costPrice: number }
) => {
  await deleteGlByRef(client, { branchId: params.branchId, refTable: 'items', refId: params.itemId });

  const value = Math.round(
    (Number(params.openingBalance || 0) * Number(params.costPrice || 0) + Number.EPSILON) * 100
  ) / 100;
  if (value <= 0) return;

  const coa = await ensureCoreCoa(client, params.branchId, ['inventory', 'openingBalanceEquity']);
  await postGl(client, {
    branchId: params.branchId,
    refTable: 'items',
    refId: params.itemId,
    note: `Opening stock: ${params.itemName}`,
    lines: [
      { accId: coa.inventory, debit: value, note: 'Opening stock' },
      { accId: coa.openingBalanceEquity, credit: value, note: 'Opening stock' },
    ],
  });

  // Keep the cached Inventory system-account balance in sync in the same
  // transaction, matching rewriteItemOpeningStockGl's own approach.
  await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
    value,
    coa.inventory,
    params.branchId,
  ]);
  // H4 fix: the Opening Balance Equity credit above was never mirrored into
  // accounts.balance. Equity - credit increases it. No reversal-before-delete
  // is needed here: this function is only ever called from insertItem's plain
  // INSERT, so itemId is always a brand-new ref with no prior GL to reverse.
  await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2 AND branch_id = $3`, [
    value,
    coa.openingBalanceEquity,
    params.branchId,
  ]);
};

const insertItem = async (
  client: PoolClient,
  row: ItemImportRow,
  branchId: number,
  _options: ImportExecutionOptions
): Promise<'inserted' | 'updated'> => {
  const shape = await detectItemShape();
  const values: unknown[] = [branchId];
  const columns: string[] = ['branch_id'];

  if (shape.catIdRequired) {
    const categoryId = await ensureDefaultCategory(client, branchId);
    columns.push('cat_id');
    values.push(categoryId);
  }

  columns.push(
    'store_id',
    'name',
    'barcode',
    shape.stockAlertColumn,
    'opening_balance',
    'cost_price',
    'sell_price',
    'is_active',
    'category_id',
    'unit_id'
  );
  values.push(
    row.store_id,
    row.name,
    row.barcode,
    row.stock_alert,
    row.opening_balance,
    row.cost_price,
    row.sell_price,
    row.is_active,
    row.category_id,
    row.unit_id
  );

  const placeholders = values.map((_, index) => `$${index + 1}`);
  const inserted = await client.query<{ item_id: number }>(
    `INSERT INTO ims.items (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING item_id`,
    values
  );
  const itemId = Number(inserted.rows[0]?.item_id || 0);
  if (!itemId) {
    throw new Error('Failed to insert item');
  }

  if (shape.storeItemsTableExists && row.store_id) {
    await client.query(
      `INSERT INTO ims.store_items (store_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (store_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [row.store_id, itemId, row.opening_balance]
    );
  }

  if (Object.keys(row.attributes).length) {
    const { columns: attrColumns, jsonb: attrJsonb } = splitAttributes(row.attributes);
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of Object.entries(attrColumns)) {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
    if (Object.keys(attrJsonb).length) {
      values.push(JSON.stringify(attrJsonb));
      setClauses.push(`attributes = $${values.length}::jsonb`);
    }
    if (setClauses.length) {
      values.push(itemId);
      await client.query(`UPDATE ims.items SET ${setClauses.join(', ')} WHERE item_id = $${values.length}`, values);
    }
  }

  if (row.supplier_id) {
    // Mirrors products.service.ts#setDefaultSupplier - a freshly-inserted item
    // has no prior item_suppliers rows to clear, so this is a plain insert.
    await client.query(
      `INSERT INTO ims.item_suppliers (branch_id, item_id, supplier_id, is_default)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (branch_id, item_id, supplier_id) DO UPDATE SET is_default = TRUE`,
      [branchId, itemId, row.supplier_id]
    );
  }

  await postItemOpeningStockGl(client, {
    branchId,
    itemId,
    itemName: row.name,
    openingBalance: row.opening_balance,
    costPrice: row.cost_price,
  });

  return 'inserted';
};

class ImportSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportSkipError';
  }
}

const classifyInsertError = (
  importType: ImportType,
  error: unknown
): { kind: 'skipped' | 'failed'; reason: string } => {
  if (error instanceof ImportSkipError) {
    return { kind: 'skipped', reason: error.message };
  }

  const pgError = error as {
    code?: string;
    constraint?: string;
    detail?: string;
    message?: string;
  };

  if (pgError?.code === '23505') {
    if (importType === 'items' && pgError.constraint === 'uq_items_branch_name') {
      return { kind: 'skipped', reason: 'Item name already exists in this branch' };
    }
    if (importType === 'items' && pgError.constraint === 'uq_items_branch_barcode') {
      return { kind: 'skipped', reason: 'Item barcode already exists in this branch' };
    }
    if (importType === 'suppliers') {
      return { kind: 'skipped', reason: 'Supplier already exists in this branch' };
    }
    if (importType === 'customers') {
      return { kind: 'skipped', reason: 'Customer already exists in this branch' };
    }
    return { kind: 'skipped', reason: 'Duplicate value violates a unique constraint' };
  }

  if (pgError?.code === '23503') {
    return { kind: 'failed', reason: 'Referenced record does not exist (foreign key violation)' };
  }

  return {
    kind: 'failed',
    reason: pgError?.message || 'Unexpected database error while importing row',
  };
};

const customersDefinition: ImportDefinition<CustomerImportRow> = {
  type: 'customers',
  requiredHeaders: [
    { field: 'full_name', aliases: ['full_name', 'name', 'customer_name'] },
    { field: 'remaining_balance', aliases: ['remaining_balance', 'open_balance', 'balance'] },
  ],
  parseRow: (raw, _row) => parseCustomerRow(raw),
  applyBusinessChecks: applyCustomerChecks,
  insertRow: insertCustomer,
  toPreviewData: (row) => row,
};

const suppliersDefinition: ImportDefinition<SupplierImportRow> = {
  type: 'suppliers',
  requiredHeaders: [
    { field: 'supplier_name', aliases: ['supplier_name', 'supplier', 'business_name', 'company', 'company_name'] },
    { field: 'remaining_balance', aliases: ['remaining_balance', 'open_balance', 'balance'] },
  ],
  parseRow: (raw, _row) => parseSupplierRow(raw),
  applyBusinessChecks: applySupplierChecks,
  insertRow: insertSupplier,
  toPreviewData: (row) => row,
};

const itemsDefinition: ImportDefinition<ItemImportRow> = {
  type: 'items',
  requiredHeaders: [
    { field: 'item', aliases: ['item', 'name'] },
    { field: 'quantity', aliases: ['quantity', 'opening_balance', 'opening_stock'] },
    { field: 'cost_price', aliases: ['cost_price', 'cost'] },
    { field: 'sell_price', aliases: ['sell_price', 'price'] },
    // store_id, category, and unit are all optional in the file - if omitted, import
    // auto-assigns Main Store / the branch's default category / the branch's default unit.
    // A category or unit name that doesn't exist yet gets created automatically.
  ],
  parseRow: (raw, _row) => parseItemRow(raw),
  applyBusinessChecks: applyItemChecks,
  insertRow: insertItem,
  toPreviewData: (row) => {
    const quantity = Number(row.opening_balance || 0);
    const costPrice = Number(row.cost_price || 0);
    return {
      item: row.name,
      quantity,
      cost_price: costPrice,
      amount: quantity * costPrice,
      sell_price: Number(row.sell_price || 0),
      store_id: row.store_id,
      barcode: row.barcode,
      stock_alert: Number(row.stock_alert || 0),
      category: row.category_name || '(default)',
      unit: row.unit_name || '(default)',
      supplier: row.supplier_name || '',
      ...row.attributes,
    };
  },
};

const getDefinition = (
  type: ImportType
): ImportDefinition<CustomerImportRow | SupplierImportRow | ItemImportRow> => {
  if (type === 'customers') {
    return customersDefinition as ImportDefinition<
      CustomerImportRow | SupplierImportRow | ItemImportRow
    >;
  }
  if (type === 'suppliers') {
    return suppliersDefinition as ImportDefinition<
      CustomerImportRow | SupplierImportRow | ItemImportRow
    >;
  }
  return itemsDefinition as ImportDefinition<
    CustomerImportRow | SupplierImportRow | ItemImportRow
  >;
};

const ensureFileHasRows = (rowsCount: number) => {
  if (!rowsCount) {
    throw ApiError.badRequest('No data rows found in file');
  }
};

const createPreviewRow = (
  row: number,
  status: PreviewRow['status'],
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
  errors: string[],
  skipReason?: string
): PreviewRow => ({
  row,
  status,
  data,
  raw,
  errors,
  ...(skipReason ? { skip_reason: skipReason } : {}),
});

const trySavepointName = (row: number) => `import_row_${row}`;

const executeImport = async <
  T extends CustomerImportRow | SupplierImportRow | ItemImportRow
>(
  definition: ImportDefinition<T>,
  file: UploadedFile,
  branchId: number,
  mode: ImportMode,
  options: ImportExecutionOptions
): Promise<ImportSummary> => {
  const parsed = parseSpreadsheet(file);
  ensureFileHasRows(parsed.rows.length);
  ensureRequiredHeaders(parsed.headers, definition.requiredHeaders);

  const failedRows: ImportRowError[] = [];
  const skippedRows: ImportRowSkip[] = [];
  const previewMap = new Map<number, PreviewRow>();
  const candidates: CandidateRow<T>[] = [];

  for (const sourceRow of parsed.rows) {
    const parsedRow = definition.parseRow(sourceRow.raw, sourceRow.row);
    if (!parsedRow.data || parsedRow.errors.length) {
      failedRows.push({
        row: sourceRow.row,
        errors: parsedRow.errors.length ? parsedRow.errors : ['Row is invalid'],
        raw: sourceRow.raw,
      });
      previewMap.set(
        sourceRow.row,
        createPreviewRow(
          sourceRow.row,
          'failed',
          parsedRow.preview,
          sourceRow.raw,
          parsedRow.errors.length ? parsedRow.errors : ['Row is invalid']
        )
      );
      continue;
    }

    candidates.push({
      row: sourceRow.row,
      raw: sourceRow.raw,
      data: parsedRow.data,
      errors: [],
    });
  }

  await definition.applyBusinessChecks(candidates, branchId, { ...options, mode });

  const rowsToInsert: CandidateRow<T>[] = [];
  for (const row of candidates) {
    const previewData = definition.toPreviewData(row.data);
    if (row.errors.length) {
      failedRows.push({
        row: row.row,
        errors: row.errors,
        raw: row.raw,
      });
      previewMap.set(
        row.row,
        createPreviewRow(row.row, 'failed', previewData, row.raw, row.errors)
      );
      continue;
    }

    if (row.skipReason) {
      skippedRows.push({
        row: row.row,
        reason: row.skipReason,
        raw: row.raw,
      });
      previewMap.set(
        row.row,
        createPreviewRow(row.row, 'skipped', previewData, row.raw, [], row.skipReason)
      );
      continue;
    }

    rowsToInsert.push(row);
    previewMap.set(row.row, createPreviewRow(row.row, 'valid', previewData, row.raw, []));
  }

  let insertedCount = 0;
  let updatedCount = 0;
  if (mode === 'import' && rowsToInsert.length) {
    await withTransaction(async (client) => {
      for (const row of rowsToInsert) {
        const savepoint = trySavepointName(row.row);
        await client.query(`SAVEPOINT ${savepoint}`);

        try {
          const action = await definition.insertRow(client, row.data, branchId, options);
          if (action === 'updated') {
            updatedCount += 1;
          } else {
            insertedCount += 1;
          }
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          const classified = classifyInsertError(definition.type, error);
          if (classified.kind === 'skipped') {
            skippedRows.push({
              row: row.row,
              reason: classified.reason,
              raw: row.raw,
            });
            previewMap.set(
              row.row,
              createPreviewRow(
                row.row,
                'skipped',
                definition.toPreviewData(row.data),
                row.raw,
                [],
                classified.reason
              )
            );
          } else {
            failedRows.push({
              row: row.row,
              errors: [classified.reason],
              raw: row.raw,
            });
            previewMap.set(
              row.row,
              createPreviewRow(
                row.row,
                'failed',
                definition.toPreviewData(row.data),
                row.raw,
                [classified.reason]
              )
            );
          }
        }
      }
    });
  }

  const previewRows = Array.from(previewMap.values())
    .sort((left, right) => left.row - right.row)
    .slice(0, PREVIEW_LIMIT);

  return {
    import_type: definition.type,
    mode,
    total_rows: parsed.rows.length,
    valid_count: rowsToInsert.length,
    inserted_count: mode === 'import' ? insertedCount : 0,
    updated_count: mode === 'import' ? updatedCount : 0,
    failed_count: failedRows.length,
    skipped_count: skippedRows.length,
    failed_rows: failedRows.sort((left, right) => left.row - right.row),
    skipped_rows: skippedRows.sort((left, right) => left.row - right.row),
    preview_rows: previewRows,
  };
};

export const importService = {
  async processImport(params: {
    type: ImportType;
    mode: ImportMode;
    branchId: number;
    updateExistingBalances?: boolean;
    file: UploadedFile;
  }): Promise<ImportSummary> {
    const definition = getDefinition(params.type);
    return executeImport(
      definition as ImportDefinition<
        CustomerImportRow | SupplierImportRow | ItemImportRow
      >,
      params.file,
      params.branchId,
      params.mode,
      { updateExistingBalances: params.updateExistingBalances }
    );
  },
};
