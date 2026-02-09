/**
 * API Client Service
 * Handles all HTTP requests to the backend API
 */

import { env } from '../config/env';
import { API } from '../config/env';
import { getAccessToken, setAccessToken, clearAccessToken } from './authStore';

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

class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = env.API_URL;
  }

  /**
   * Build headers including Authorization when we have a token
   */
  private buildHeaders(overrides: HeadersInit = {}): HeadersInit {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(overrides as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Try to refresh access token using cookie; returns new token or null
   */
  private async tryRefresh(): Promise<string | null> {
    const refreshRes = await fetch(`${this.baseURL}${API.AUTH.REFRESH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    let data: { success?: boolean; data?: { accessToken?: string }; message?: string };
    try {
      data = await refreshRes.json();
    } catch {
      return null;
    }
    if (refreshRes.ok && data.success && data.data?.accessToken) {
      setAccessToken(data.data.accessToken, false);
      return data.data.accessToken;
    }
    clearAccessToken();
    return null;
  }

  /**
   * Make an HTTP request (with optional 401 retry after refresh)
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: this.buildHeaders(options.headers as Record<string, string>),
      credentials: 'include',
    };

    try {
      const response = await fetch(url, config);
      let data: any;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: 'Invalid response from server',
          message: response.status === 0
            ? 'Cannot reach server. Check that the backend is running and CORS is allowed.'
            : `Request failed with status ${response.status}`,
        };
      }

      if (!response.ok) {
        if (response.status === 401 && !isRetry) {
          const newToken = await this.tryRefresh();
          if (newToken) {
            return this.request<T>(endpoint, options, true);
          }
        }
        const errorMessage =
          data?.errors?.[0]?.message ||
          data?.error ||
          data?.message ||
          'An error occurred';
        return {
          success: false,
          error: errorMessage,
          message: data?.message || `Request failed with status ${response.status}`,
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: 'Network error',
        message:
          error instanceof Error
            ? error.message
            : 'Cannot connect to server. Check the backend URL and that the server is running.',
      };
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: any,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: any,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: any,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
