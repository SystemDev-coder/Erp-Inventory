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
    BASE: '/api/system',
    PERMISSIONS: '/api/system/permissions',
    PERMISSION: (id: number) => `/api/system/permissions/${id}`,
    ROLES: '/api/system/roles',
    ROLE: (id: number) => `/api/system/roles/${id}`,
    ROLE_PERMISSIONS: (id: number) => `/api/system/roles/${id}/permissions`,
    BRANCHES: '/api/system/branches',
    USERS: '/api/system/users',
    USER: (id: number) => `/api/system/users/${id}`,
    LOGS: '/api/system/logs',
    LOG: (id: number) => `/api/system/logs/${id}`,
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

  REPORTS: {
    SALES_OPTIONS: '/api/reports/sales/options',
    SALES_DAILY: '/api/reports/sales/daily',
    SALES_BY_CUSTOMER: '/api/reports/sales/by-customer',
    SALES_BY_PRODUCT: '/api/reports/sales/by-product',
    SALES_TOP_ITEMS: '/api/reports/sales/top-items',
    SALES_RETURNS: '/api/reports/sales/returns',
    SALES_CASHIER_PERFORMANCE: '/api/reports/sales/cashier-performance',
    INVENTORY_OPTIONS: '/api/reports/inventory/options',
    INVENTORY_CURRENT_STOCK: '/api/reports/inventory/current-stock',
    INVENTORY_LOW_STOCK: '/api/reports/inventory/low-stock',
    INVENTORY_MOVEMENT_HISTORY: '/api/reports/inventory/movement-history',
    INVENTORY_VALUATION: '/api/reports/inventory/valuation',
    INVENTORY_EXPIRY_TRACKING: '/api/reports/inventory/expiry-tracking',
    INVENTORY_ADJUSTMENT_LOG: '/api/reports/inventory/adjustment-log',
    INVENTORY_STORE_STOCK: '/api/reports/inventory/store-stock',
    INVENTORY_STORE_WISE: '/api/reports/inventory/store-wise',
    PURCHASE_OPTIONS: '/api/reports/purchase/options',
    PURCHASE_ORDERS_SUMMARY: '/api/reports/purchase/orders-summary',
    PURCHASE_SUPPLIER_WISE: '/api/reports/purchase/supplier-wise',
    PURCHASE_RETURNS: '/api/reports/purchase/returns',
    PURCHASE_PAYMENT_STATUS: '/api/reports/purchase/payment-status',
    PURCHASE_SUPPLIER_LEDGER: '/api/reports/purchase/supplier-ledger',
    PURCHASE_BY_DATE_RANGE: '/api/reports/purchase/by-date-range',
    PURCHASE_BEST_SUPPLIERS: '/api/reports/purchase/best-suppliers',
    PURCHASE_PRICE_VARIANCE: '/api/reports/purchase/price-variance',
    FINANCIAL_OPTIONS: '/api/reports/financial/options',
    FINANCIAL_INCOME_STATEMENT: '/api/reports/financial/income-statement',
    FINANCIAL_BALANCE_SHEET: '/api/reports/financial/balance-sheet',
    FINANCIAL_CASH_FLOW: '/api/reports/financial/cash-flow',
    FINANCIAL_ACCOUNT_BALANCES: '/api/reports/financial/account-balances',
    FINANCIAL_EXPENSE_SUMMARY: '/api/reports/financial/expense-summary',
    FINANCIAL_CUSTOMER_RECEIPTS: '/api/reports/financial/customer-receipts',
    FINANCIAL_SUPPLIER_PAYMENTS: '/api/reports/financial/supplier-payments',
    FINANCIAL_ACCOUNTS_RECEIVABLE: '/api/reports/financial/accounts-receivable',
    FINANCIAL_ACCOUNTS_PAYABLE: '/api/reports/financial/accounts-payable',
    FINANCIAL_ACCOUNT_TRANSACTIONS: '/api/reports/financial/account-transactions',
    FINANCIAL_ACCOUNT_STATEMENT: '/api/reports/financial/account-statement',
    FINANCIAL_TRIAL_BALANCE: '/api/reports/financial/trial-balance',
    HR_OPTIONS: '/api/reports/hr/options',
    HR_EMPLOYEE_LIST: '/api/reports/hr/employee-list',
    HR_PAYROLL_SUMMARY: '/api/reports/hr/payroll-summary',
    HR_SALARY_PAYMENTS: '/api/reports/hr/salary-payments',
    HR_EMPLOYEE_ATTENDANCE: '/api/reports/hr/employee-attendance',
    HR_LOAN_BALANCES: '/api/reports/hr/loan-balances',
    HR_EMPLOYEE_LEDGER: '/api/reports/hr/employee-ledger',
    HR_PAYROLL_BY_MONTH: '/api/reports/hr/payroll-by-month',
    HR_EMPLOYEE_COUNT_BY_DEPARTMENT: '/api/reports/hr/employee-count-by-department',
    CUSTOMER_OPTIONS: '/api/reports/customer/options',
    CUSTOMER_LIST: '/api/reports/customer/list',
    CUSTOMER_LEDGER: '/api/reports/customer/ledger',
    CUSTOMER_OUTSTANDING_BALANCES: '/api/reports/customer/outstanding-balances',
    CUSTOMER_TOP_CUSTOMERS: '/api/reports/customer/top-customers',
    CUSTOMER_PAYMENT_HISTORY: '/api/reports/customer/payment-history',
    CUSTOMER_CREDIT_CUSTOMERS: '/api/reports/customer/credit-customers',
    CUSTOMER_NEW_CUSTOMERS: '/api/reports/customer/new-customers',
    CUSTOMER_ACTIVITY: '/api/reports/customer/activity',
  },

  RECEIPTS: {
    LIST: '/api/receipts',
    ITEM: (id: number) => `/api/receipts/${id}`,
  },

  ASSETS: {
    LIST: '/api/assets',
    ITEM: (id: number) => `/api/assets/${id}`,
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
    CUSTOMER_BALANCE: (customerId: number) => `/api/finance/receipts/customers/${customerId}/balance`,
    SUPPLIER_RECEIPTS: '/api/finance/receipts/suppliers',
    SUPPLIER_RECEIPTS_UNPAID: '/api/finance/receipts/suppliers/unpaid',
    SUPPLIER_BALANCE: (supplierId: number) => `/api/finance/receipts/suppliers/${supplierId}/balance`,
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

  IMPORT: {
    CUSTOMERS: '/api/import/customers',
    SUPPLIERS: '/api/import/suppliers',
    ITEMS: '/api/import/items',
  },

  // Health check
  HEALTH: '/api/health',
} as const;
