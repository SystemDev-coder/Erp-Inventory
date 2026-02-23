/**
 * Authentication Service
 * Handles all authentication-related API calls
 */

import { apiClient, ApiResponse } from './api';
import { API } from '../config/env';

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

export interface LoginCredentials {
  identifier: string; // Can be username or phone
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  name: string; // Full name
  username?: string;
  phone?: string;
  password: string;
  branch_id?: number;
  role_id?: number;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  message?: string;
}

export interface RegisterResponse {
  user: User;
  accessToken: string;
  message?: string;
}

export interface ForgotPasswordData {
  identifier: string; // Username or phone
}

export interface ResetPasswordData {
  identifier: string; // Username or phone
  code: string; // 6-digit reset code
  newPassword: string;
}

class AuthService {
  async hashString(value: string): Promise<string> {
    const enc = new TextEncoder().encode(value);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<ApiResponse<RegisterResponse>> {
    return apiClient.post<RegisterResponse>(API.AUTH.REGISTER, data);
  }

  /**
   * Login with credentials
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<LoginResponse>> {
    return apiClient.post<LoginResponse>(API.AUTH.LOGIN, credentials);
  }

  /**
   * Logout current user
   */
  async logout(): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API.AUTH.LOGOUT);
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return apiClient.get<{ user: User }>(API.AUTH.ME);
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<ApiResponse<{ accessToken: string }>> {
    return apiClient.post<{ accessToken: string }>(API.AUTH.REFRESH);
  }

  /**
   * Request password reset
   */
  async forgotPassword(data: ForgotPasswordData): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>(API.AUTH.FORGOT_PASSWORD, data);
  }

  /**
   * Reset password with token
   */
  async resetPassword(data: ResetPasswordData): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>(API.AUTH.RESET_PASSWORD, data);
  }

  async setLockPassword(password: string): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API.AUTH.LOCK_SET, { password });
  }

  async verifyLockPassword(password: string): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API.AUTH.LOCK_VERIFY, { password });
  }

  async clearLockPassword(): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API.AUTH.LOCK_CLEAR);
  }
}

// Export singleton instance
export const authService = new AuthService();
