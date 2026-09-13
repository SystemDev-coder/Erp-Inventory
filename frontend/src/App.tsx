import { BrowserRouter as Router, Routes, Route } from "react-router";
import { Suspense, lazy, type ReactNode } from "react";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { useInactivityLogout } from "./hooks/useInactivityLogout";

// Core pages (eager)
import Home from "./pages/Home/Home";
import Products from "./pages/Products/Products";
import Sales from "./pages/Sales/Sales";
import SaleCreate from "./pages/Sales/SaleCreate";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";

// Heavy sections (lazy-loaded)
const StockAdjustmentsPage = lazy(() => import("./pages/Stock/StockAdjustmentsPage"));
const StockAdjustmentCreatePage = lazy(() => import("./pages/Stock/StockAdjustmentCreatePage"));
const Purchases = lazy(() => import("./pages/Purchases/Purchases"));
const PurchaseEditor = lazy(() => import("./pages/Purchases/PurchaseEditor"));
const Returns = lazy(() => import("./pages/Returns/Returns"));
const SalesReturns = lazy(() => import("./pages/Returns/SalesReturns"));
const PurchaseReturns = lazy(() => import("./pages/Returns/PurchaseReturns"));
const Transfers = lazy(() => import("./pages/Transfers/Transfers"));
const Finance = lazy(() => import("./pages/Finance/Finance"));
const Receipts = lazy(() => import("./pages/Finance/Receipts"));
const Lock = lazy(() => import("./pages/Lock/Lock"));
const Customers = lazy(() => import("./pages/Customers/Customers"));
const Employees = lazy(() => import("./pages/Employees/Employees"));
const Reports = lazy(() => import("./pages/Reports/Reports"));
const Assets = lazy(() => import("./pages/Assets/Assets"));
const AccountsReceivableReportPage = lazy(() => import("./pages/Reports/financial/AccountsReceivableReportPage"));
const AccountsPayableReportPage = lazy(() => import("./pages/Reports/financial/AccountsPayableReportPage"));
const Settings = lazy(() => import("./pages/Settings/Settings"));
const System = lazy(() => import("./pages/System/System"));
const Support = lazy(() => import("./pages/Support/Support"));
const Trash = lazy(() => import("./pages/Trash/Trash"));

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
  </div>
);

const Lazy = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

const ComingSoonPage = ({ title }: { title: string }) => (
  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
    <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
    <p className="text-sm text-slate-600 dark:text-slate-300">Coming soon</p>
  </div>
);

function AppRoutes() {
  useInactivityLogout();

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Main Layout - protected */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index path="/" element={<ProtectedRoute permissionAny={['dashboard.view', 'home.view']}><Home /></ProtectedRoute>} />
          <Route path="/stock-management" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/stock-management/items" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/inventory/stock" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/stock-management/adjust-items" element={<ProtectedRoute><Lazy><StockAdjustmentsPage /></Lazy></ProtectedRoute>} />
          <Route path="/stock-management/adjust-items/new" element={<ProtectedRoute><Lazy><StockAdjustmentCreatePage /></Lazy></ProtectedRoute>} />
          <Route path="/return" element={<ProtectedRoute permission="sales_returns.view"><Lazy><Returns /></Lazy></ProtectedRoute>} />
          <Route path="/items" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/stock/adjustments" element={<ProtectedRoute><Lazy><StockAdjustmentsPage /></Lazy></ProtectedRoute>} />
          <Route path="/stock/adjustments/new" element={<ProtectedRoute><Lazy><StockAdjustmentCreatePage /></Lazy></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute permission="sales.view"><Sales /></ProtectedRoute>} />
          <Route path="/sales/transactions" element={<ProtectedRoute permission="sales.view"><Sales /></ProtectedRoute>} />
          <Route path="/sales/pos" element={<ProtectedRoute permission="sales.view"><ComingSoonPage title="POS" /></ProtectedRoute>} />
          <Route path="/sales/new" element={<ProtectedRoute permission="sales.create"><SaleCreate /></ProtectedRoute>} />
          <Route path="/sales/:id/edit" element={<ProtectedRoute permission="sales.update"><SaleCreate /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute><Lazy><Purchases /></Lazy></ProtectedRoute>} />
          <Route path="/purchases/list" element={<ProtectedRoute><Lazy><Purchases /></Lazy></ProtectedRoute>} />
          <Route path="/purchases/suppliers" element={<ProtectedRoute><Lazy><Purchases /></Lazy></ProtectedRoute>} />
          <Route path="/purchases/items" element={<ProtectedRoute><Lazy><Purchases /></Lazy></ProtectedRoute>} />
          <Route path="/purchases/new" element={<ProtectedRoute permission="purchases.create"><Lazy><PurchaseEditor /></Lazy></ProtectedRoute>} />
          <Route path="/purchases/:id" element={<ProtectedRoute permission="purchases.view"><Lazy><PurchaseEditor /></Lazy></ProtectedRoute>} />
          <Route path="/returns" element={<ProtectedRoute permission="sales_returns.view"><Lazy><Returns /></Lazy></ProtectedRoute>} />
          <Route path="/returns/sales/new" element={<ProtectedRoute permission="sales_returns.create"><Lazy><SalesReturns /></Lazy></ProtectedRoute>} />
          <Route path="/returns/sales/:id/edit" element={<ProtectedRoute permission="sales_returns.update"><Lazy><SalesReturns /></Lazy></ProtectedRoute>} />
          <Route path="/returns/purchases/new" element={<ProtectedRoute permission="purchase_returns.create"><Lazy><PurchaseReturns /></Lazy></ProtectedRoute>} />
          <Route path="/returns/purchases/:id/edit" element={<ProtectedRoute permission="purchase_returns.update"><Lazy><PurchaseReturns /></Lazy></ProtectedRoute>} />
          <Route path="/transfers" element={<ProtectedRoute permission="transfers.view"><Lazy><Transfers /></Lazy></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/finance/accounts" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/finance/transfers" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/finance/receipts" element={<ProtectedRoute><Lazy><Receipts /></Lazy></ProtectedRoute>} />
          <Route path="/finance/payroll" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/finance/expense" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/finance/loans" element={<ProtectedRoute><Lazy><Finance /></Lazy></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute permission="customers.view"><Lazy><Customers /></Lazy></ProtectedRoute>} />
          <Route path="/customers/:tab" element={<ProtectedRoute permission="customers.view"><Lazy><Customers /></Lazy></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute permission="employees.view"><Lazy><Employees /></Lazy></ProtectedRoute>} />
          <Route path="/employees/registration" element={<ProtectedRoute permission="employees.view"><Lazy><Employees /></Lazy></ProtectedRoute>} />
          <Route path="/employees/job" element={<ProtectedRoute permission="employees.view"><Lazy><Employees /></Lazy></ProtectedRoute>} />
          <Route path="/employees/state" element={<ProtectedRoute permission="employees.view"><Lazy><Employees /></Lazy></ProtectedRoute>} />
          <Route path="/employees/shifts" element={<ProtectedRoute permission="employees.view"><Lazy><Employees /></Lazy></ProtectedRoute>} />
          <Route
            path="/reports"
            element={
              <ProtectedRoute
                permissionAny={[
                  'reports.all',
                  'sales.reports',
                  'sales.view',
                  'inventory.reports',
                  'inventory.view',
                  'stock.view',
                  'items.view',
                  'purchases.reports',
                  'purchases.view',
                  'finance.reports',
                  'finance.balance',
                  'finance.income',
                  'finance.cashflow',
                  'hr.reports',
                  'employees.view',
                  'customers.view',
                  'customer_ledger.view',
                  'supplier_payments.view',
                  'customer_receipts.view',
                ]}
              >
                <Lazy><Reports /></Lazy>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/accounts-receivable"
            element={
              <ProtectedRoute
                permissionAny={[
                  'reports.all',
                  'finance.reports',
                  'finance.balance',
                  'finance.income',
                  'finance.cashflow',
                  'accounts.view',
                  'ledgers.view',
                  'account_transactions.view',
                ]}
              >
                <Lazy><AccountsReceivableReportPage /></Lazy>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/accounts-payable"
            element={
              <ProtectedRoute
                permissionAny={[
                  'reports.all',
                  'finance.reports',
                  'finance.balance',
                  'finance.income',
                  'finance.cashflow',
                  'accounts.view',
                  'ledgers.view',
                  'account_transactions.view',
                ]}
              >
                <Lazy><AccountsPayableReportPage /></Lazy>
              </ProtectedRoute>
            }
          />
          <Route path="/assets" element={<ProtectedRoute permission="accounts.view"><Lazy><Assets /></Lazy></ProtectedRoute>} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute
                permissionAny={[
                  'system.settings',
                  'users.view',
                  'roles.view',
                  'permissions.view',
                  'system.users.manage',
                  'system.roles.manage',
                  'system.permissions.manage',
                ]}
              >
                <Lazy><System /></Lazy>
              </ProtectedRoute>
            }
          />
          <Route path="/system" element={<ProtectedRoute permission="system.settings"><Lazy><Settings /></Lazy></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Lazy><Support /></Lazy></ProtectedRoute>} />
          <Route path="/trash" element={<ProtectedRoute permission="trash.view" roleAny={['developer']}><Lazy><Trash /></Lazy></ProtectedRoute>} />
        </Route>

        {/* Auth Layout */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/lock" element={<Lazy><Lock /></Lazy>} />

        {/* Fallback Route */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppRoutes />
      </Router>
    </ErrorBoundary>
  );
}
