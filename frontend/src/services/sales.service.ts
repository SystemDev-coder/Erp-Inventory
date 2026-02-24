import { API } from '../config/env';
import { apiClient } from './api';

export type SaleStatus = 'paid' | 'partial' | 'unpaid' | 'void';
export type SaleDocType = 'sale' | 'invoice' | 'quotation';

export interface SaleItem {
  sale_item_id?: number;
  product_id: number;
  product_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

export interface Sale {
  sale_id: number;
  branch_id: number;
  wh_id: number | null;
  user_id: number;
  customer_id: number | null;
  customer_name?: string | null;
  tax_id?: number | null;
  total_before_tax?: number;
  tax_amount?: number;
  sale_date: string;
  sale_type: 'cash' | 'credit';
  doc_type: SaleDocType;
  quote_valid_until?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  currency_code: string;
  fx_rate: number;
  note?: string | null;
  pay_acc_id?: number | null;
  paid_amount?: number;
  is_stock_applied?: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface SaleCreateInput {
  branchId?: number;
  customerId?: number;
  whId?: number | null;
  taxId?: number | null;
  taxRate?: number;
  saleDate?: string;
  quoteValidUntil?: string | null;
  subtotal?: number;
  discount?: number;
  total?: number;
  saleType?: 'cash' | 'credit';
  docType?: SaleDocType;
  status?: SaleStatus;
  note?: string | null;
  currencyCode?: string;
  fxRate?: number;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
  }>;
  payFromAccId?: number;
  paidAmount?: number;
}

export type SaleUpdateInput = Partial<Omit<SaleCreateInput, 'items'>> & {
  items?: SaleCreateInput['items'];
};

export interface SalesListFilters {
  search?: string;
  status?: SaleStatus | 'all';
  docType?: SaleDocType | 'all';
  branchId?: number;
  includeVoided?: boolean;
}

const makeQueryString = (filters: SalesListFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.docType && filters.docType !== 'all') params.set('docType', filters.docType);
  if (filters.branchId) params.set('branchId', String(filters.branchId));
  if (filters.includeVoided) params.set('includeVoided', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const salesService = {
  async list(filters: SalesListFilters = {}) {
    return apiClient.get<{ sales: Sale[] }>(`${API.SALES.LIST}${makeQueryString(filters)}`);
  },

  async get(id: number) {
    return apiClient.get<{ sale: Sale; items: SaleItem[] }>(API.SALES.ITEM(id));
  },

  async create(data: SaleCreateInput) {
    return apiClient.post<{ sale: Sale }>(API.SALES.LIST, data);
  },

  async update(id: number, data: SaleUpdateInput) {
    return apiClient.put<{ sale: Sale }>(`${API.SALES.LIST}/${id}`, data);
  },

  async void(id: number, reason?: string) {
    return apiClient.post<{ sale: Sale }>(`${API.SALES.LIST}/${id}/void`, { reason });
  },

  async convertQuotation(
    id: number,
    payload: {
      saleDate?: string;
      status?: SaleStatus;
      payFromAccId?: number;
      paidAmount?: number;
      note?: string;
    }
  ) {
    return apiClient.post<{ sale: Sale }>(`${API.SALES.LIST}/${id}/convert-quotation`, payload);
  },

  async remove(id: number) {
    return apiClient.delete(API.SALES.ITEM(id));
  },
};
