import { BrowserRouter as Router, Routes, Route } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AppLayout from "./layout/AppLayout";

// Section Pages
import Home from "./pages/Home/Home";
import Products from "./pages/Products/Products";
import Stock from "./pages/Stock/Stock";
import Sales from "./pages/Sales/Sales";
import Purchases from "./pages/Purchases/Purchases";
import Returns from "./pages/Returns/Returns";
import Transfers from "./pages/Transfers/Transfers";
import Finance from "./pages/Finance/Finance";
import Customers from "./pages/Customers/Customers";
import Employees from "./pages/Employees/Employees";
import System from "./pages/System/System";
import Settings from "./pages/Settings/Settings";

// Auth Pages
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Main Layout */}
          <Route element={<AppLayout />}>
            <Route index path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/system" element={<System />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
