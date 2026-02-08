/**
 * Shared TypeScript types and interfaces
 */

export interface User {
  user_id: number;
  name: string;
  username: string;
  phone: string | null;
  role_id: number;
  role_name: string;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
