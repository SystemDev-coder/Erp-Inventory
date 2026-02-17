import { BrowserRouter as Router, Routes, Route } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { useInactivityLogout } from "./hooks/useInactivityLogout";

// Section Pages
import Home from "./pages/Home/Home";
import Products from "./pages/Products/Products";
import StockAdjustmentsPage from "./pages/Stock/StockAdjustmentsPage";
import StoresPage from "./pages/Stock/StoresPage";
import Sales from "./pages/Sales/Sales";
import SaleCreate from "./pages/Sales/SaleCreate";
import Purchases from "./pages/Purchases/Purchases";
import PurchaseEditor from "./pages/Purchases/PurchaseEditor";
import Returns from "./pages/Returns/Returns";
import Transfers from "./pages/Transfers/Transfers";
import Finance from "./pages/Finance/Finance";
import Customers from "./pages/Customers/Customers";
import Employees from "./pages/Employees/Employees";
import Reports from "./pages/Reports/Reports";
import Settings from "./pages/Settings/Settings";
import System from "./pages/System/System";
import Support from "./pages/Support/Support";

// Auth Pages
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";

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
          <Route index path="/" element={<Home />} />
          <Route path="/store-management" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/store-management/store" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/store-management/items" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/store-management/categories" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/store-management/item-state" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/store-management/stores" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/store-management/adjustment-items" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/items" element={<ProtectedRoute permission="items.view"><Products /></ProtectedRoute>} />
          <Route path="/stock/adjustments" element={<ProtectedRoute><StockAdjustmentsPage /></ProtectedRoute>} />
          <Route path="/stock/stores" element={<ProtectedRoute><StoresPage /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute permission="sales.view"><Sales /></ProtectedRoute>} />
          <Route path="/sales/transactions" element={<ProtectedRoute permission="sales.view"><Sales /></ProtectedRoute>} />
          <Route path="/sales/pos" element={<ProtectedRoute permission="sales.view"><ComingSoonPage title="POS" /></ProtectedRoute>} />
          <Route path="/sales/new" element={<ProtectedRoute permission="sales.create"><SaleCreate /></ProtectedRoute>} />
          <Route path="/sales/:id/edit" element={<ProtectedRoute permission="sales.update"><SaleCreate /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/purchases/list" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/purchases/suppliers" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/purchases/items" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
          <Route path="/purchases/new" element={<ProtectedRoute permission="purchases.create"><PurchaseEditor /></ProtectedRoute>} />
          <Route path="/purchases/:id" element={<ProtectedRoute permission="purchases.view"><PurchaseEditor /></ProtectedRoute>} />
          <Route path="/returns" element={<ProtectedRoute permission="sales_returns.view"><Returns /></ProtectedRoute>} />
          <Route path="/transfers" element={<ProtectedRoute permission="transfers.view"><Transfers /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/finance/accounts" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/finance/payroll" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/finance/expense" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/finance/loans" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute permission="customers.view"><Customers /></ProtectedRoute>} />
          <Route path="/customers/:tab" element={<ProtectedRoute permission="customers.view"><Customers /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
          <Route path="/employees/registration" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
          <Route path="/employees/job" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
          <Route path="/employees/state" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
          <Route path="/employees/shifts" element={<ProtectedRoute permission="employees.view"><Employees /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/system" element={<ProtectedRoute><System /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        </Route>

        {/* Auth Layout */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

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
