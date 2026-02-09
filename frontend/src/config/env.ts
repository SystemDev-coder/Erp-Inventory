/**
 * Environment Configuration
 * Access environment variables with type safety
 */

interface Env {
  API_URL: string;
  ENV: string;
  isDev: boolean;
  isProd: boolean;
}

const getEnv = (): Env => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const env = import.meta.env.VITE_ENV || 'development';

  return {
    API_URL: apiUrl,
    ENV: env,
    isDev: env === 'development',
    isProd: env === 'production',
  };
};

export const env = getEnv();

// API Endpoints
export const API = {
  BASE_URL: env.API_URL,
  
  // Auth endpoints
  AUTH: {
    REGISTER: '/api/auth/register',
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me',
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    RESET_PASSWORD: '/api/auth/reset-password',
  },
  
  // User endpoints
  USER: {
    PERMISSIONS: '/api/user/permissions',
    SIDEBAR: '/api/user/sidebar',
    PREFERENCES: '/api/user/preferences',
    SESSIONS: '/api/user/sessions',
    CHECK_PERMISSION: (permKey: string) => `/api/check-permission/${permKey}`,
    LOGOUT_OTHER_SESSIONS: '/api/user/logout-other-sessions',
    LOGOUT_SESSION: (sessionId: string) => `/api/user/sessions/${sessionId}`,
  },

  // Dashboard endpoints
  DASHBOARD: '/api/dashboard',
  
  // System endpoints
  SYSTEM: {
    PERMISSIONS: '/api/system/permissions',
    ROLES: '/api/system/roles',
    ROLE: (id: number) => `/api/system/roles/${id}`,
    ROLE_PERMISSIONS: (id: number) => `/api/system/roles/${id}/permissions`,
    USERS: '/api/system/users',
    USER: (id: number) => `/api/system/users/${id}`,
    USER_PERMISSIONS: (id: number) => `/api/system/users/${id}/permissions`,
    USER_OVERRIDES: (id: number) => `/api/system/users/${id}/overrides`,
    USER_AUDIT: (id: number) => `/api/system/users/${id}/audit`,
  },

  // Products endpoints
  PRODUCTS: {
    LIST: '/api/products',
    ITEM: (id: number) => `/api/products/${id}`,
    CATEGORIES: '/api/products/categories',
    CATEGORY: (id: number) => `/api/products/categories/${id}`,
  },
  
  // Health check
  HEALTH: '/api/health',
} as const;
