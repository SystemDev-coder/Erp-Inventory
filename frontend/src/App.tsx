import { BrowserRouter as Router, Routes, Route } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { useInactivityLogout } from "./hooks/useInactivityLogout";

// Section Pages
import Home from "./pages/Home/Home";
import Products from "./pages/Products/Products";
import StockPage from "./pages/Stock/StockPage";
import StockAdjustmentsPage from "./pages/Stock/StockAdjustmentsPage";
import StockRecountPage from "./pages/Stock/StockRecountPage";
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
import Support from "./pages/Support/Support";

// Auth Pages
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";

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
          <Route path="/store-management" element={<Products />} />
          <Route path="/store-management/items" element={<Products />} />
          <Route path="/store-management/categories" element={<Products />} />
          <Route path="/store-management/units" element={<Products />} />
          <Route path="/store-management/stock" element={<StockPage />} />
          <Route path="/store-management/stock/adjustments" element={<StockAdjustmentsPage />} />
          <Route path="/store-management/stock/recount" element={<StockRecountPage />} />
          <Route path="/store-management/stores" element={<StoresPage />} />
          <Route path="/items" element={<Products />} />
          <Route path="/products" element={<Products />} />
          <Route path="/purchased-items" element={<Products />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/adjustments" element={<StockAdjustmentsPage />} />
          <Route path="/stock/recount" element={<StockRecountPage />} />
          <Route path="/stock/stores" element={<StoresPage />} />
          <Route path="/inventory" element={<StockPage />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/new" element={<SaleCreate />} />
          <Route path="/sales/:id/edit" element={<SaleCreate />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchases/new" element={<PurchaseEditor />} />
          <Route path="/purchases/:id" element={<PurchaseEditor />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/finance/payroll" element={<Finance />} />
          <Route path="/finance/expense" element={<Finance />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/shifts" element={<Employees />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
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
