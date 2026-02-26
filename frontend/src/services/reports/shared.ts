import { API } from '../../config/env';
import { apiClient } from '../api';

export type ReportSelectionMode = 'all' | 'show';

export interface ReportOption {
  id: number;
  label: string;
}

export interface RowsResponse<T> {
  branchId: number;
  reportKey: string;
  rows: T[];
  fromDate?: string;
  toDate?: string;
  mode?: ReportSelectionMode;
  customerId?: number | null;
  supplierId?: number | null;
  productId?: number | null;
  storeId?: number | null;
}

export const toQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export { API, apiClient };
