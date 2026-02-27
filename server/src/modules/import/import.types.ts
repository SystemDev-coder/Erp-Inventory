export type ImportType = 'customers' | 'suppliers' | 'items';

export type ImportMode = 'preview' | 'import';

export interface ParsedSheet {
  headers: string[];
  rows: ParsedSheetRow[];
}

export interface ParsedSheetRow {
  row: number;
  raw: Record<string, unknown>;
}

export interface ImportRowError {
  row: number;
  errors: string[];
  raw: Record<string, unknown>;
}

export interface ImportRowSkip {
  row: number;
  reason: string;
  raw: Record<string, unknown>;
}

export interface PreviewRow {
  row: number;
  status: 'valid' | 'failed' | 'skipped';
  data: Record<string, unknown>;
  errors: string[];
  skip_reason?: string;
  raw: Record<string, unknown>;
}

export interface ImportSummary {
  import_type: ImportType;
  mode: ImportMode;
  total_rows: number;
  valid_count: number;
  inserted_count: number;
  failed_count: number;
  skipped_count: number;
  failed_rows: ImportRowError[];
  skipped_rows: ImportRowSkip[];
  preview_rows: PreviewRow[];
}

