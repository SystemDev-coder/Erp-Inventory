import { ApiError } from '../../utils/ApiError';
import { ParsedSheet, ParsedSheetRow } from './import.types';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
};

type SheetJs = {
  read: (data: Buffer, options: { type: 'buffer' }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: <T = any>(
      sheet: unknown,
      options?: {
        header?: 1;
        defval?: unknown;
        raw?: boolean;
        blankrows?: boolean;
      }
    ) => T[];
  };
};

let cachedSheetJs: SheetJs | null = null;

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');

const hasMeaningfulValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const loadSheetJs = (): SheetJs => {
  if (cachedSheetJs) return cachedSheetJs;

  try {
    // Lazy load keeps compile stable even before dependency installation.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('xlsx');
    cachedSheetJs = module as SheetJs;
    return cachedSheetJs;
  } catch (_error) {
    throw ApiError.internal(
      'Excel parser dependency is missing. Install it with: npm install xlsx (inside server directory)'
    );
  }
};

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(String(key));
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
};

export const parseSpreadsheet = (file: UploadedFile): ParsedSheet => {
  if (!file?.buffer?.length) {
    throw ApiError.badRequest('Uploaded file is empty');
  }

  const XLSX = loadSheetJs();
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw ApiError.badRequest('No worksheet found in uploaded file');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawHeaderRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  const firstRow = Array.isArray(rawHeaderRows[0]) ? rawHeaderRows[0] : [];
  const headers = firstRow.map((cell) => normalizeHeader(String(cell || ''))).filter(Boolean);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
    blankrows: true,
  });

  const rows: ParsedSheetRow[] = rawRows
    .map((row, index) => {
      const normalized = normalizeRow(row);
      return {
        row: index + 2,
        raw: normalized,
      };
    })
    .filter(({ raw }) => Object.values(raw).some(hasMeaningfulValue));

  return {
    headers,
    rows,
  };
};
