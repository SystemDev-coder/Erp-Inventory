/**
 * Environment Configuration
 * Access environment variables with type safety
 */

interface Env {
  API_URL: string;
  ENV: string;
  isDev: boolean;
  isProd: boolean;
  COMPANY_NAME: string;
  COMPANY_AVATAR: string;
}

const getEnv = (): Env => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const env = import.meta.env.VITE_ENV || 'development';
  const companyName = import.meta.env.VITE_COMPANY_NAME || 'KeydMaal MS';
  const companyAvatar = import.meta.env.VITE_COMPANY_AVATAR || '';

  return {
    API_URL: apiUrl,
    ENV: env,
    isDev: env === 'development',
    isProd: env === 'production',
    COMPANY_NAME: companyName,
    COMPANY_AVATAR: companyAvatar,
  };
};

export const env = getEnv();

export const BRAND = {
  NAME: env.COMPANY_NAME,
  AVATAR:
    env.COMPANY_AVATAR ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(env.COMPANY_NAME)}&background=0b1a4d&color=ffffff`,
};

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
    LOCK_SET: '/api/auth/lock/set',
    LOCK_VERIFY: '/api/auth/lock/verify',
    LOCK_CLEAR: '/api/auth/lock/clear',
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
    UNITS: '/api/products/units',
    UNIT: (id: number) => `/api/products/units/${id}`,
    TAXES: '/api/products/taxes',
    TAX: (id: number) => `/api/products/taxes/${id}`,
  },

  // Customers endpoints
  CUSTOMERS: {
    LIST: '/api/customers',
    ITEM: (id: number) => `/api/customers/${id}`,
  },

  // Purchases endpoints
  PURCHASES: {
    LIST: '/api/purchases',
    ITEM: (id: number) => `/api/purchases/${id}`,
  },

  // Sales endpoints
  SALES: {
    LIST: '/api/sales',
    ITEM: (id: number) => `/api/sales/${id}`,
  },

  RECEIPTS: {
    LIST: '/api/receipts',
    ITEM: (id: number) => `/api/receipts/${id}`,
  },

  NOTIFICATIONS: {
    LIST: '/api/notifications',
    ITEM: (id: number) => `/api/notifications/${id}`,
    MARK_READ: (id: number) => `/api/notifications/${id}/read`,
    MARK_ALL_READ: '/api/notifications/read-all',
  },

  FINANCE: {
    TRANSFERS: '/api/finance/transfers',
    CUSTOMER_RECEIPTS: '/api/finance/receipts/customers',
    CUSTOMER_RECEIPTS_UNPAID: '/api/finance/receipts/customers/unpaid',
    SUPPLIER_RECEIPTS: '/api/finance/receipts/suppliers',
    SUPPLIER_RECEIPTS_UNPAID: '/api/finance/receipts/suppliers/unpaid',
    SUPPLIER_OUTSTANDING: '/api/finance/receipts/suppliers/outstanding',
    EXPENSES: '/api/finance/expenses',
    EXPENSE_CHARGES: '/api/finance/expenses/charges',
    EXPENSE_BUDGETS: '/api/finance/expenses/budgets',
    EXPENSE_PAYMENTS: '/api/finance/expenses/payments',
    PAYROLL: '/api/finance/payroll',
  },

  STORES: {
    LIST: '/api/stores',
    ITEM: (id: number) => `/api/stores/${id}`,
    ITEMS: (id: number) => `/api/stores/${id}/items`,
    ADD_ITEM: (id: number) => `/api/stores/${id}/items`,
    UPDATE_ITEM: (storeId: number, itemId: number) => `/api/stores/${storeId}/items/${itemId}`,
    REMOVE_ITEM: (storeId: number, itemId: number) => `/api/stores/${storeId}/items/${itemId}`,
  },

  // Health check
  HEALTH: '/api/health',
} as const;
