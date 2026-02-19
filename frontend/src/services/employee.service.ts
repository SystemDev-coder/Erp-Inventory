/**
 * Employee Service
 * Handles all employee-related API operations
 */

import { apiClient, ApiResponse } from './api';
import { RoleRow } from './user.service';

export interface Employee {
  emp_id: number;
  branch_id: number;
  user_id: number | null;
  role_id: number | null;
  full_name: string;
  phone: string | null;
  address: string | null;
  gender?: 'male' | 'female' | null;
  salary_type?: 'Hourly' | 'Monthly' | 'hourly' | 'monthly' | null;
  shift_type?: 'Morning' | 'Night' | 'Evening' | null;
  hire_date: string;
  status: 'active' | 'inactive' | 'terminated';
  created_at?: string;
  // Related data from joins
  username?: string;
  role_name?: string;
  basic_salary?: number;
}

export interface EmployeeInput {
  name: string;
  phone?: string;
  address?: string;
  gender?: 'male' | 'female';
  role_id?: number;
  salary?: number;
  salary_type?: 'Hourly' | 'Monthly';
  shift_type?: 'Morning' | 'Night' | 'Evening';
  hire_date?: string;
  status?: 'active' | 'inactive' | 'terminated';
  user_id?: number;
}

export interface EmployeePayment {
  payment_id: number;
  emp_id: number;
  employee_name?: string;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'check' | 'bank_transfer' | 'mobile_money';
  notes: string | null;
  created_at?: string;
}

export interface EmployeePaymentInput {
  emp_id: number;
  amount: number;
  payment_date?: string;
  payment_method?: 'cash' | 'check' | 'bank_transfer' | 'mobile_money';
  notes?: string;
}

export interface EmployeeLoan {
  loan_id: number;
  emp_id: number;
  employee_name?: string;
  amount: number;
  loan_date: string;
  status: 'active' | 'paid' | 'cancelled';
  notes: string | null;
  created_at?: string;
}

export interface EmployeeLoanInput {
  emp_id: number;
  amount: number;
  loan_date?: string;
  notes?: string;
}

export interface ShiftAssignment {
  assignment_id: number;
  branch_id: number;
  emp_id: number;
  employee_name: string;
  shift_type: 'Morning' | 'Night' | 'Evening';
  effective_date: string;
  is_active: boolean;
  created_at: string;
}

class EmployeeService {
  async listRoles(): Promise<ApiResponse<{ roles: RoleRow[] }>> {
    return apiClient.get<{ roles: RoleRow[] }>('/api/employees/roles');
  }

  /**
   * List all employees
   */
  async list(params?: { search?: string; status?: string }): Promise<ApiResponse<{ employees: Employee[] }>> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    
    const url = query.toString() ? `/api/employees?${query}` : '/api/employees';
    return apiClient.get<{ employees: Employee[] }>(url);
  }

  /**
   * Get employee by ID
   */
  async getById(id: number): Promise<ApiResponse<{ employee: Employee }>> {
    return apiClient.get<{ employee: Employee }>(`/api/employees/${id}`);
  }

  /**
   * Create new employee
   */
  async create(data: EmployeeInput): Promise<ApiResponse<{ employee: Employee }>> {
    return apiClient.post<{ employee: Employee }>('/api/employees', data);
  }

  /**
   * Update employee
   */
  async update(id: number, data: Partial<EmployeeInput>): Promise<ApiResponse<{ employee: Employee }>> {
    return apiClient.put<{ employee: Employee }>(`/api/employees/${id}`, data);
  }

  /**
   * Delete employee
   */
  async delete(id: number): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`/api/employees/${id}`);
  }

  /**
   * List employee payments (salary payments)
   */
  async listPayments(empId?: number): Promise<ApiResponse<{ payments: EmployeePayment[] }>> {
    const url = empId ? `/api/employees/payments?empId=${empId}` : '/api/employees/payments';
    return apiClient.get<{ payments: EmployeePayment[] }>(url);
  }

  /**
   * Create employee payment
   */
  async createPayment(data: EmployeePaymentInput): Promise<ApiResponse<{ payment: EmployeePayment }>> {
    return apiClient.post<{ payment: EmployeePayment }>('/api/employees/payments', data);
  }

  /**
   * List employee loans
   */
  async listLoans(empId?: number): Promise<ApiResponse<{ loans: EmployeeLoan[] }>> {
    const url = empId ? `/api/employees/loans?empId=${empId}` : '/api/employees/loans';
    return apiClient.get<{ loans: EmployeeLoan[] }>(url);
  }

  /**
   * Create employee loan
   */
  async createLoan(data: EmployeeLoanInput): Promise<ApiResponse<{ loan: EmployeeLoan }>> {
    return apiClient.post<{ loan: EmployeeLoan }>('/api/employees/loans', data);
  }

  /**
   * Get employee statistics
   */
  async getStats(): Promise<ApiResponse<{
    total: number;
    active: number;
    inactive: number;
    totalSalaries: number;
  }>> {
    return apiClient.get('/api/employees/stats');
  }

  async updateState(data: {
    targetType: 'employee' | 'customer' | 'item';
    targetId: number;
    status: 'active' | 'inactive';
  }): Promise<ApiResponse<void>> {
    return apiClient.patch<void>('/api/employees/state', data);
  }

  async listShiftAssignments(): Promise<ApiResponse<{ assignments: ShiftAssignment[] }>> {
    return apiClient.get<{ assignments: ShiftAssignment[] }>('/api/employees/shift-assignments');
  }

  async createShiftAssignment(data: {
    emp_id: number;
    shift_type: 'Morning' | 'Night' | 'Evening';
    effective_date?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<{ assignment: ShiftAssignment }>> {
    return apiClient.post<{ assignment: ShiftAssignment }>('/api/employees/shift-assignments', data);
  }

  async updateShiftAssignment(
    id: number,
    data: Partial<{
      emp_id: number;
      shift_type: 'Morning' | 'Night' | 'Evening';
      effective_date: string;
      is_active: boolean;
    }>
  ): Promise<ApiResponse<{ assignment: ShiftAssignment }>> {
    return apiClient.put<{ assignment: ShiftAssignment }>(`/api/employees/shift-assignments/${id}`, data);
  }

  async deleteShiftAssignment(id: number): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`/api/employees/shift-assignments/${id}`);
  }
}

export const employeeService = new EmployeeService();
