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
  private buildHeaders(
    overrides: HeadersInit = {},
    options?: { includeJsonContentType?: boolean }
  ): Record<string, string> {
    const token = getAccessToken();
    const includeJsonContentType = options?.includeJsonContentType ?? true;
    const headers: Record<string, string> = {
      ...(overrides as Record<string, string>),
    };
    // Only set JSON content type for non-FormData requests.
    if (includeJsonContentType && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
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

    // Don't set Content-Type for FormData (browser sets multipart boundary automatically).
    const isFormData = options.body instanceof FormData;
    const headers = this.buildHeaders(options.headers as Record<string, string>, {
      includeJsonContentType: !isFormData,
    });

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store',
    };

    try {
      const response = await fetch(url, config);
      let data: any;
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = text ? { message: text } : {};
        }
      } catch {
        const fallbackText = await response.text().catch(() => '');
        return {
          success: false,
          error: 'Invalid response from server',
          message: fallbackText || (response.status === 0
            ? 'Cannot reach server. Check that the backend is running and CORS is allowed.'
            : `Request failed with status ${response.status}`),
        };
      }

      if (!response.ok) {
        if (response.status === 304) {
          return (data || { success: true }) as ApiResponse<T>;
        }
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

      return data || { success: true } as ApiResponse<T>;
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
    const isFormData = body instanceof FormData;
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
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
