import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cog,
  DollarSign,
  FileText,
  LayoutDashboard,
  LucideIcon,
  ReceiptText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';

type SidebarSubItem = {
  id: string;
  label: string;
  to: string;
  exact?: boolean;
  permissionAny?: string[];
};

type SidebarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  permissionAny?: string[];
  exact?: boolean;
  expandable?: boolean;
  subItems?: SidebarSubItem[];
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar } = useSidebar();
  const { permissions } = useAuth();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    items: false,
    sales: false,
    finance: false,
  });

  const isActive = useCallback(
    (path: string, exact = false) => {
      const current = location.pathname.replace(/\/+$/, '') || '/';
      const target = path.replace(/\/+$/, '') || '/';
      if (target === '/') return current === '/';
      if (exact) return current === target;
      return current === target || current.startsWith(`${target}/`);
    },
    [location.pathname]
  );

  const hasAnyPerm = useCallback(
    (required?: string[]) => {
      if (!required || required.length === 0) return true;
      return required.some((perm) => permissions.includes(perm));
    },
    [permissions]
  );

  const items = useMemo<SidebarItem[]>(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/', exact: true },
      { id: 'customers', label: 'Customers', icon: Users, to: '/customers', permissionAny: ['customers.view'] },
      {
        id: 'items',
        label: 'Items',
        icon: Store,
        expandable: true,
        permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'],
        subItems: [
          { id: 'items-store', label: 'STORE', to: '/store-management', permissionAny: ['items.view', 'stock.view', 'inventory.view'] },
          { id: 'items-adjustments', label: 'ADJUSTMENT ITEMS', to: '/store-management/adjustment-items', permissionAny: ['items.view', 'stock.view', 'inventory.view'] },
        ],
      },
      { id: 'purchases', label: 'Purchases', icon: ShoppingBag, to: '/purchases', permissionAny: ['purchases.view', 'suppliers.view'] },
      {
        id: 'sales',
        label: 'Sales',
        icon: ReceiptText,
        expandable: true,
        permissionAny: ['sales.view'],
        subItems: [
          { id: 'sales-transactions', label: 'Transactions', to: '/sales', permissionAny: ['sales.view'] },
          { id: 'sales-pos', label: 'POS', to: '/sales/pos', permissionAny: ['sales.create', 'sales.view'] },
        ],
      },
      {
        id: 'finance',
        label: 'Finance',
        icon: DollarSign,
        expandable: true,
        subItems: [
          { id: 'finance-accounts', label: 'Accounts', to: '/finance/accounts' },
          { id: 'finance-payroll', label: 'Payroll', to: '/finance/payroll' },
          { id: 'finance-expense', label: 'Expense', to: '/finance/expense' },
          { id: 'finance-loans', label: 'Loans', to: '/finance/loans' },
        ],
      },
      { id: 'hr', label: 'HR', icon: BriefcaseBusiness, to: '/employees/registration', permissionAny: ['employees.view'] },
      { id: 'reports', label: 'Reports', icon: FileText, to: '/reports' },
      { id: 'system', label: 'System', icon: Settings, to: '/system' },
      { id: 'setting', label: 'Setting', icon: Cog, to: '/settings' },
    ],
    []
  );

  const visibleItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          subItems: (item.subItems || []).filter((sub) => hasAnyPerm(sub.permissionAny)),
        }))
        .filter((item) => hasAnyPerm(item.permissionAny)),
    [hasAnyPerm, items]
  );

  const showExpanded = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 h-screen transition-all duration-300 ease-in-out z-50 shadow-sm
        ${showExpanded ? 'w-[280px]' : 'w-[80px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-5 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 ${
          !showExpanded ? 'lg:justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 bg-primary-600 dark:bg-primary-500 rounded-lg flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          {showExpanded && (
            <span className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">KeydMaal MS</span>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          aria-label={showExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="hidden lg:flex shrink-0 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400"
        >
          {showExpanded ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <nav className={`px-2 pb-4 ${showExpanded ? 'pt-3' : 'pt-4'}`}>
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const hasSubs = Boolean(item.expandable && item.subItems && item.subItems.length > 0);
              const active = item.to ? isActive(item.to, item.exact) : false;

              if (hasSubs) {
                const groupOpen = Boolean(openGroups[item.id]);
                const hasActiveSub = (item.subItems || []).some((sub) => isActive(sub.to));
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [item.id]: !groupOpen }))}
                      className={`flex items-center w-full rounded-lg px-3 py-2.5 transition-colors ${
                        hasActiveSub
                          ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                      } ${!showExpanded ? 'lg:justify-center px-0' : ''}`}
                    >
                      <span className={`flex items-center min-w-0 flex-1 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                        <span className="flex-shrink-0 text-slate-600 dark:text-slate-400">
                          <Icon className="w-4 h-4" />
                        </span>
                        {showExpanded && <span className="text-sm font-medium truncate">{item.label}</span>}
                      </span>
                      {showExpanded && (
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${groupOpen ? 'rotate-0' : '-rotate-90'}`}
                        />
                      )}
                    </button>
                    {showExpanded && groupOpen && (
                      <ul className="ml-10 mt-1 space-y-1">
                        {(item.subItems || []).map((sub) => {
                          const subActive = isActive(sub.to, sub.exact);
                          return (
                            <li key={sub.id}>
                              <Link
                                to={sub.to}
                                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                                  subActive
                                    ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                                }`}
                              >
                                {sub.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <Link
                    to={item.to || '/'}
                    className={`flex items-center w-full rounded-lg transition-colors ${
                      active
                        ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                    } ${!showExpanded ? 'lg:justify-center px-0' : 'px-3'}`}
                  >
                    <span className={`flex items-center min-w-0 flex-1 py-2.5 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                      <span className="flex-shrink-0 text-slate-600 dark:text-slate-400">
                        <Icon className="w-4 h-4" />
                      </span>
                      {showExpanded && <span className="text-sm font-medium truncate">{item.label}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {showExpanded && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            (c) 2026 KeydMaal MS | All rights reserved
          </p>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
