import { API } from '../config/env';
import { apiClient } from './api';

export type ImportType = 'customers' | 'suppliers' | 'items';
export type ImportMode = 'preview' | 'import';

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

const endpointByType: Record<ImportType, string> = {
  customers: API.IMPORT.CUSTOMERS,
  suppliers: API.IMPORT.SUPPLIERS,
  items: API.IMPORT.ITEMS,
};

const submit = (type: ImportType, file: File, mode: ImportMode) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  return apiClient.post<ImportSummary>(endpointByType[type], formData);
};

export const importService = {
  preview(type: ImportType, file: File) {
    return submit(type, file, 'preview');
  },
  import(type: ImportType, file: File) {
    return submit(type, file, 'import');
  },
};

