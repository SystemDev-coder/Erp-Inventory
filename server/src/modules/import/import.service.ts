import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { parseSpreadsheet } from './import.parser';
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

type ImportDefinition<T> = {
  type: ImportType;
  requiredHeaders: Array<{ field: string; aliases: string[] }>;
  parseRow: (raw: Record<string, unknown>, row: number) => ParseResult<T>;
  applyBusinessChecks: (rows: CandidateRow<T>[], branchId: number) => Promise<void>;
  insertRow: (client: PoolClient, row: T, branchId: number) => Promise<void>;
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
  is_active: boolean;
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
};

type CustomerShape = {
  balanceColumn: 'open_balance' | 'remaining_balance';
  hasGenderColumn: boolean;
  hasTypeColumn: boolean;
};

type SupplierShape = {
  nameColumn: 'name' | 'supplier_name';
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
  customerShapeCache = {
    balanceColumn: names.has('open_balance') ? 'open_balance' : 'remaining_balance',
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
  supplierShapeCache = {
    nameColumn: names.has('name') ? 'name' : 'supplier_name',
    balanceColumn: names.has('open_balance') ? 'open_balance' : 'remaining_balance',
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
  const isActiveRaw = readRawValue(raw, ['is_active', 'active', 'status']);

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
    } else {
      errors.push('customer_type must be either regular or One-time visitor');
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
  const isActive = parseBooleanLike(isActiveRaw, 'is_active', errors, true);

  const data: CustomerImportRow = {
    full_name: fullName,
    phone: phone || null,
    customer_type: customerType,
    sex: gender,
    gender,
    address: address || null,
    remaining_balance: remainingBalance,
    is_active: isActive,
  };

  return {
    data: errors.length ? undefined : data,
    errors,
    preview: data,
  };
};

const parseSupplierRow = (raw: Record<string, unknown>): ParseResult<SupplierImportRow> => {
  const errors: string[] = [];
  const supplierName =
    readString(raw, ['supplier_name', 'name', 'supplier']) || '';
  const companyName = readString(raw, ['company_name']);
  const contactPerson = readString(raw, ['contact_person']);
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

  if (!phone) {
    errors.push('phone is required');
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
  const name = readString(raw, ['name']) || '';
  const barcode = readString(raw, ['barcode', 'bar_code', 'sku']);
  const stockAlertRaw = readRawValue(raw, ['stock_alert', 'stockalert', 'reorder_level']);
  const openingBalanceRaw = readRawValue(raw, ['opening_balance', 'opening_stock', 'quantity']);
  const costPriceRaw = readRawValue(raw, ['cost_price', 'cost']);
  const sellPriceRaw = readRawValue(raw, ['sell_price', 'price']);
  const isActiveRaw = readRawValue(raw, ['is_active', 'active', 'status']);
  const storeIdRaw = readRawValue(raw, ['store_id', 'store']);
  const branchFromFile = readRawValue(raw, ['branch_id', 'branch']);

  if (!name) {
    errors.push('name is required');
  } else if (name.length > 160) {
    errors.push('name must be at most 160 characters');
  }

  if (barcode && barcode.length > 80) {
    errors.push('barcode must be at most 80 characters');
  }

  if (!isBlank(branchFromFile)) {
    errors.push('branch_id must not be provided in the file; it is derived from your session');
  }

  const stockAlert = parseNonNegativeNumber(stockAlertRaw, 'stock_alert', errors, 5);
  const openingBalance = parseNonNegativeNumber(
    openingBalanceRaw,
    'opening_balance',
    errors,
    0
  );
  const costPrice = parseNonNegativeNumber(costPriceRaw, 'cost_price', errors, 0);
  const sellPrice = parseNonNegativeNumber(sellPriceRaw, 'sell_price', errors, 0);
  const isActive = parseBooleanLike(isActiveRaw, 'is_active', errors, true);
  const storeId = parseOptionalPositiveInt(storeIdRaw, 'store_id', errors);

  const data: ItemImportRow = {
    name,
    barcode: barcode || null,
    stock_alert: stockAlert,
    opening_balance: openingBalance,
    cost_price: costPrice,
    sell_price: sellPrice,
    is_active: isActive,
    store_id: storeId,
  };

  return {
    data: errors.length ? undefined : data,
    errors,
    preview: data,
  };
};

const applyCustomerChecks = async (rows: CandidateRow<CustomerImportRow>[], branchId: number) => {
  addFileDuplicateSkips(rows, (row) => row.data.phone, 'Phone');

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

const applySupplierChecks = async (rows: CandidateRow<SupplierImportRow>[], branchId: number) => {
  addFileDuplicateSkips(rows, (row) => row.data.supplier_name, 'Supplier name');

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

const applyItemChecks = async (rows: CandidateRow<ItemImportRow>[], branchId: number) => {
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
};

const insertCustomer = async (
  client: PoolClient,
  row: CustomerImportRow,
  branchId: number
) => {
  const shape = await detectCustomerShape();

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

  columns.push('address', shape.balanceColumn, 'is_active');
  placeholders.push(`$${values.length + 1}`, `$${values.length + 2}`, `$${values.length + 3}`);
  values.push(row.address, row.remaining_balance, row.is_active);

  await client.query(
    `INSERT INTO ims.customers (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})`,
    values
  );
};

const insertSupplier = async (
  client: PoolClient,
  row: SupplierImportRow,
  branchId: number
) => {
  const shape = await detectSupplierShape();
  const locationValue =
    shape.locationColumn === 'company_name'
      ? row.company_name ?? row.location ?? null
      : row.location ?? row.company_name ?? null;

  await client.query(
    `INSERT INTO ims.suppliers (
      branch_id,
      ${shape.nameColumn},
      ${shape.locationColumn},
      phone,
      ${shape.balanceColumn},
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      branchId,
      row.supplier_name,
      locationValue,
      row.phone,
      row.remaining_balance,
      row.is_active,
    ]
  );
};

const insertItem = async (client: PoolClient, row: ItemImportRow, branchId: number) => {
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
    'is_active'
  );
  values.push(
    row.store_id,
    row.name,
    row.barcode,
    row.stock_alert,
    row.opening_balance,
    row.cost_price,
    row.sell_price,
    row.is_active
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
};

const classifyInsertError = (
  importType: ImportType,
  error: unknown
): { kind: 'skipped' | 'failed'; reason: string } => {
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
  requiredHeaders: [{ field: 'full_name', aliases: ['full_name', 'name', 'customer_name'] }],
  parseRow: (raw) => parseCustomerRow(raw),
  applyBusinessChecks: applyCustomerChecks,
  insertRow: insertCustomer,
  toPreviewData: (row) => row,
};

const suppliersDefinition: ImportDefinition<SupplierImportRow> = {
  type: 'suppliers',
  requiredHeaders: [
    { field: 'supplier_name', aliases: ['supplier_name', 'name'] },
    { field: 'phone', aliases: ['phone', 'mobile'] },
    { field: 'remaining_balance', aliases: ['remaining_balance', 'open_balance', 'balance'] },
  ],
  parseRow: (raw) => parseSupplierRow(raw),
  applyBusinessChecks: applySupplierChecks,
  insertRow: insertSupplier,
  toPreviewData: (row) => row,
};

const itemsDefinition: ImportDefinition<ItemImportRow> = {
  type: 'items',
  requiredHeaders: [{ field: 'name', aliases: ['name'] }],
  parseRow: (raw) => parseItemRow(raw),
  applyBusinessChecks: applyItemChecks,
  insertRow: insertItem,
  toPreviewData: (row) => row,
};

const getDefinition = (
  type: ImportType
): ImportDefinition<CustomerImportRow | SupplierImportRow | ItemImportRow> => {
  if (type === 'customers') return customersDefinition;
  if (type === 'suppliers') return suppliersDefinition;
  return itemsDefinition;
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
  mode: ImportMode
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

  await definition.applyBusinessChecks(candidates, branchId);

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
  if (mode === 'import' && rowsToInsert.length) {
    await withTransaction(async (client) => {
      for (const row of rowsToInsert) {
        const savepoint = trySavepointName(row.row);
        await client.query(`SAVEPOINT ${savepoint}`);

        try {
          await definition.insertRow(client, row.data, branchId);
          insertedCount += 1;
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
    file: UploadedFile;
  }): Promise<ImportSummary> {
    const definition = getDefinition(params.type);
    return executeImport(
      definition as ImportDefinition<
        CustomerImportRow | SupplierImportRow | ItemImportRow
      >,
      params.file,
      params.branchId,
      params.mode
    );
  },
};
