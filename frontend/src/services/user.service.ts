/**
 * User Service
 * Handles user-related API calls (permissions, preferences, sessions)
 */

import { apiClient, ApiResponse } from './api';
import { API } from '../config/env';

export interface Permission {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  description: string | null;
}

export interface UserPreferences {
  theme?: string;
  language?: string;
  timezone?: string;
  notifications?: boolean;
  [key: string]: any;
}

export interface Session {
  session_id: string;
  device_name: string;
  device_os: string;
  browser_name: string;
  ip_address: string;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: SidebarItem[];
  permission?: string;
}

class UserService {
  /**
   * Get current user's permissions
   */
  async getPermissions(): Promise<ApiResponse<{ permissions: Permission[] }>> {
    return apiClient.get<{ permissions: Permission[] }>(API.USER.PERMISSIONS);
  }

  /**
   * Get sidebar configuration for current user
   */
  async getSidebar(): Promise<ApiResponse<{ sidebar: SidebarItem[] }>> {
    return apiClient.get<{ sidebar: SidebarItem[] }>(API.USER.SIDEBAR);
  }

  /**
   * Check if user has a specific permission
   */
  async checkPermission(permKey: string): Promise<ApiResponse<{ hasPermission: boolean }>> {
    return apiClient.get<{ hasPermission: boolean }>(API.USER.CHECK_PERMISSION(permKey));
  }

  /**
   * Get user preferences
   */
  async getPreferences(): Promise<ApiResponse<{ preferences: UserPreferences }>> {
    return apiClient.get<{ preferences: UserPreferences }>(API.USER.PREFERENCES);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: Partial<UserPreferences>): Promise<ApiResponse<{ preferences: UserPreferences }>> {
    return apiClient.put<{ preferences: UserPreferences }>(API.USER.PREFERENCES, preferences);
  }

  /**
   * Get all active sessions
   */
  async getSessions(): Promise<ApiResponse<{ sessions: Session[] }>> {
    return apiClient.get<{ sessions: Session[] }>(API.USER.SESSIONS);
  }

  /**
   * Logout all other sessions except current
   */
  async logoutOtherSessions(): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>(API.USER.LOGOUT_OTHER_SESSIONS);
  }

  /**
   * Logout a specific session
   */
  async logoutSession(sessionId: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete<{ message: string }>(API.USER.LOGOUT_SESSION(sessionId));
  }
}

// Export singleton instance
export const userService = new UserService();
