import { apiClient, ApiResponse } from './api';

export interface Schedule {
  schedule_id: number;
  emp_id: number;
  branch_id: number;
  schedule_type: 'sick_leave' | 'vacation' | 'personal' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: number;
  approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  approved_by_name?: string;
}

export interface ScheduleInput {
  emp_id: number;
  schedule_type: 'sick_leave' | 'vacation' | 'personal' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  reason?: string;
  notes?: string;
}

export const scheduleService = {
  async list(filters?: { empId?: number; status?: string }): Promise<ApiResponse<{ schedules: Schedule[] }>> {
    let url = '/api/schedules';
    const params = new URLSearchParams();
    
    if (filters?.empId) params.append('empId', filters.empId.toString());
    if (filters?.status) params.append('status', filters.status);
    
    if (params.toString()) url += `?${params.toString()}`;
    
    return apiClient.get<{ schedules: Schedule[] }>(url);
  },

  async getById(id: number): Promise<ApiResponse<{ schedule: Schedule }>> {
    return apiClient.get<{ schedule: Schedule }>(`/api/schedules/${id}`);
  },

  async create(data: ScheduleInput): Promise<ApiResponse<{ schedule: Schedule }>> {
    return apiClient.post<{ schedule: Schedule }>('/api/schedules', data);
  },

  async update(id: number, data: Partial<ScheduleInput>): Promise<ApiResponse<{ schedule: Schedule }>> {
    return apiClient.put<{ schedule: Schedule }>(`/api/schedules/${id}`, data);
  },

  async updateStatus(id: number, status: 'pending' | 'approved' | 'rejected' | 'cancelled'): Promise<ApiResponse<{ schedule: Schedule }>> {
    return apiClient.patch<{ schedule: Schedule }>(`/api/schedules/${id}/status`, { status });
  },

  async delete(id: number): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/schedules/${id}`);
  },

  async getUpcoming(empId?: number, days?: number): Promise<ApiResponse<{ schedules: Schedule[] }>> {
    let url = '/api/schedules/upcoming';
    const params = new URLSearchParams();
    
    if (empId) params.append('empId', empId.toString());
    if (days) params.append('days', days.toString());
    
    if (params.toString()) url += `?${params.toString()}`;
    
    return apiClient.get<{ schedules: Schedule[] }>(url);
  },
};
