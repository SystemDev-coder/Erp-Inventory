import { apiClient } from './api';
import { API } from '../config/env';

export interface TrashRow {
  id: number;
  label: string;
  deleted_at?: string | null;
  created_at?: string | null;
  table?: string | null;
}

export interface TrashModule {
  key: string;
  label: string;
}

export const trashService = {
  async listTables() {
    return apiClient.get<{ tables: string[]; modules?: TrashModule[] }>(API.TRASH.TABLES);
  },

  async listRows(params: {
    table: string;
    fromDate?: string;
    toDate?: string;
    branchId?: number;
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    qs.set('table', params.table);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.branchId) qs.set('branchId', String(params.branchId));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return apiClient.get<{ rows: TrashRow[]; total: number }>(`${API.TRASH.ROWS}?${qs.toString()}`);
  },

  async restore(table: string, id: number) {
    return apiClient.post<{ result: { success: boolean; message: string } }>(API.TRASH.RESTORE(table, id), {});
  },
};
