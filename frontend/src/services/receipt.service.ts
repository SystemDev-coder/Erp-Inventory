import { apiClient } from './api';
import { API } from '../config/env';

export interface Receipt {
  receipt_id: number;
  charge_id: number;
  customer_id?: number | null;
  customer_name?: string | null;
  branch_id: number;
  user_id: number;
  acc_id: number;
  receipt_date: string;
  amount: number;
  reference_no?: string | null;
  note?: string | null;
}

export const receiptService = {
  async list(search?: string, branchId?: number) {
    const params: string[] = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (branchId) params.push(`branchId=${encodeURIComponent(String(branchId))}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    return apiClient.get<{ receipts: Receipt[] }>(`${API.RECEIPTS.LIST}${qs}`);
  },

  async create(data: Partial<Receipt> & { charge_id: number; acc_id: number; amount: number }) {
    return apiClient.post<{ receipt: Receipt }>(API.RECEIPTS.LIST, {
      chargeId: data.charge_id,
      customerId: data.customer_id,
      accId: data.acc_id,
      amount: data.amount,
      branchId: data.branch_id,
      referenceNo: data.reference_no,
      note: data.note,
    });
  },

  async update(id: number, data: Partial<Receipt> & { charge_id?: number; acc_id?: number }) {
    return apiClient.put<{ receipt: Receipt }>(API.RECEIPTS.ITEM(id), {
      chargeId: data.charge_id,
      customerId: data.customer_id,
      accId: data.acc_id,
      amount: data.amount,
      branchId: data.branch_id,
      referenceNo: data.reference_no,
      note: data.note,
    });
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.RECEIPTS.ITEM(id));
  },
};
