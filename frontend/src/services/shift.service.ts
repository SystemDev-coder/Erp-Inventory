import { apiClient, ApiResponse } from './api';

export type ShiftStatus = 'open' | 'closed' | 'void';

export interface Shift {
  shift_id: number;
  branch_id: number;
  branch_name: string | null;
  user_id: number;
  username: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number;
  status: ShiftStatus;
  note: string | null;
}

export interface OpenShiftInput {
  branchId?: number;
  openingCash?: number;
  note?: string;
}

export interface CloseShiftInput {
  closingCash: number;
  note?: string;
}

class ShiftService {
  async list(params?: {
    status?: ShiftStatus;
    branchId?: number;
    userId?: number;
    limit?: number;
  }): Promise<ApiResponse<{ shifts: Shift[] }>> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.branchId) query.append('branchId', String(params.branchId));
    if (params?.userId) query.append('userId', String(params.userId));
    if (params?.limit) query.append('limit', String(params.limit));

    const url = query.toString() ? `/api/shifts?${query}` : '/api/shifts';
    return apiClient.get<{ shifts: Shift[] }>(url);
  }

  async open(data: OpenShiftInput): Promise<ApiResponse<{ shift: Shift }>> {
    return apiClient.post<{ shift: Shift }>('/api/shifts', data);
  }

  async close(id: number, data: CloseShiftInput): Promise<ApiResponse<{ shift: Shift }>> {
    return apiClient.patch<{ shift: Shift }>(`/api/shifts/${id}/close`, data);
  }

  async void(id: number): Promise<ApiResponse<{ shift: Shift }>> {
    return apiClient.patch<{ shift: Shift }>(`/api/shifts/${id}/void`, {});
  }
}

export const shiftService = new ShiftService();

