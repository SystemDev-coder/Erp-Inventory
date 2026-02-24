import { ElementType, useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import {
  SpaceDashboardOutlined,
  PeopleAltOutlined,
  Inventory2Outlined,
  AssignmentReturnOutlined,
  ShoppingBagOutlined,
  ReceiptLongOutlined,
  AccountBalanceWalletOutlined,
  SettingsOutlined,
  LockOutlined,
  ChevronLeft,
  ChevronRight,
  ExpandLess,
  ExpandMore,
  StorefrontOutlined,
  BusinessCenterOutlined,
} from '@mui/icons-material';

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
  icon: ElementType;
  to?: string;
  permissionAny?: string[];
  exact?: boolean;
  expandable?: boolean;
  subItems?: SidebarSubItem[];
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar } = useSidebar();
  const { permissions, lock, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    stockManagement: false,
  });

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => {
      const willOpen = !prev[groupId];
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((key) => {
        next[key] = false;
      });
      if (willOpen) {
        next[groupId] = true;
      }
      return next;
    });
  }, []);

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

  const groups = useMemo(() => {
    const base: { title: string; items: SidebarItem[] }[] = [
      {
        title: 'Main',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: SpaceDashboardOutlined, to: '/', exact: true, permissionAny: ['dashboard.view'] },
          { id: 'customers', label: 'Customers', icon: PeopleAltOutlined, to: '/customers', permissionAny: ['customers.view'] },
        ],
      },
      {
        title: 'Operations',
        items: [
          {
            id: 'stockManagement',
            label: 'Stock Management',
            icon: Inventory2Outlined,
            permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'],
            expandable: true,
            subItems: [
              { id: 'stock-items', label: 'Items', to: '/stock-management/items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
              { id: 'adjust-items', label: 'Adjust Items', to: '/stock-management/adjust-items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
            ],
          },
          { id: 'return', label: 'Return', icon: AssignmentReturnOutlined, to: '/return', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
          { id: 'purchases', label: 'Purchases', icon: ShoppingBagOutlined, to: '/purchases', permissionAny: ['purchases.view', 'suppliers.view'] },
          { id: 'sales', label: 'Sales', icon: ReceiptLongOutlined, to: '/sales', exact: true, permissionAny: ['sales.view'] },
        ],
      },
      {
        title: 'Finance',
        items: [
          {
            id: 'finance',
            label: 'Finance',
            icon: AccountBalanceWalletOutlined,
            to: '/finance',
            exact: true,
            expandable: true,
            permissionAny: ['finance.reports', 'accounts.view', 'expenses.view', 'ledgers.view'],
            subItems: [
              { id: 'finance-accounts', label: 'Accounts', to: '/finance/accounts', exact: true, permissionAny: ['accounts.view'] },
              { id: 'finance-receipts', label: 'Receipts', to: '/finance/receipts', exact: true, permissionAny: ['accounts.view', 'sales.view', 'purchases.view'] },
              { id: 'finance-expenses', label: 'Expenses', to: '/finance/expense', exact: true, permissionAny: ['expenses.view'] },
              { id: 'finance-payroll', label: 'Payroll', to: '/finance/payroll', exact: true, permissionAny: ['payroll_lines.view', 'payroll_runs.view'] },
            ],
          },
        ],
      },
      {
        title: 'People',
        items: [{ id: 'hr', label: 'HR', icon: BusinessCenterOutlined, to: '/employees/registration', permissionAny: ['employees.view'] }],
      },
      {
        title: 'System',
        items: [
          { id: 'system', label: 'System', icon: SettingsOutlined, to: '/system', permissionAny: ['users.view', 'roles.view', 'permissions.view', 'system.users.manage', 'system.roles.manage', 'system.permissions.manage'] },
        ],
      },
    ];
    return base;
  }, []);

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items
            .map((item) => ({
              ...item,
              subItems: (item.subItems || []).filter((sub) => hasAnyPerm(sub.permissionAny)),
            }))
            .filter((item) => hasAnyPerm(item.permissionAny)),
        }))
        .filter((group) => group.items.length > 0),
    [groups, hasAnyPerm]
  );

  const showExpanded = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-white bg-gradient-to-br from-white via-[#f5f7fa] to-[#e0e0e0]/60 text-slate-800 border-r border-slate-200 h-screen transition-all duration-300 ease-in-out z-50 shadow-[0_12px_28px_-12px_rgba(26,35,126,0.35)]
        ${showExpanded ? 'w-[260px]' : 'w-[80px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-5 flex items-center gap-2 border-b border-slate-200 ${
          !showExpanded ? 'lg:justify-center px-3' : 'justify-between px-5'
        }`}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-primary-700 to-primary-500 rounded-lg flex items-center justify-center shadow-lg shadow-primary-900/25">
            <StorefrontOutlined sx={{ fontSize: 20, color: '#fff' }} />
          </div>
          {showExpanded && (
            <span className="text-lg font-semibold text-slate-900 truncate">
              {user?.branch_name || 'ERP Premium'}
            </span>
          )}
        </Link>

        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
          >
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            <span className="relative inline-flex h-5 w-9 rounded-full bg-slate-300">
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-4 bg-primary-500' : 'translate-x-0.5'
                }`}
              ></span>
            </span>
          </button>
          <button
            onClick={toggleSidebar}
            aria-label={showExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="hidden lg:flex shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-700 border border-slate-200"
          >
            {showExpanded ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <nav className={`px-2 pb-4 ${showExpanded ? 'pt-3' : 'pt-4'}`}>
          <ul className="space-y-1">
            {visibleGroups.map((group) => (
              <li key={group.title} className="mt-2">
                {showExpanded && (
                  <div className="px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                    {group.title}
                  </div>
                )}
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const hasSubs = Boolean(item.expandable && item.subItems && item.subItems.length > 0);
                    const active = item.to ? isActive(item.to, item.exact) : false;

                    if (hasSubs) {
                      const groupOpen = Boolean(openGroups[item.id]);
                      const hasActiveSub = (item.subItems || []).some((sub) => isActive(sub.to, sub.exact));
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(item.id)}
                            className={`flex items-center w-full rounded-lg px-3 py-2.5 transition-colors border-l-4 ${
                              hasActiveSub
                                ? 'bg-[#e8f0ff] text-primary-700 font-semibold border-primary-500'
                                : 'text-slate-700 hover:bg-slate-100 border-transparent'
                            } ${!showExpanded ? 'lg:justify-center px-2' : ''}`}
                          >
                            <span className={`flex items-center min-w-0 flex-1 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                              <Icon fontSize="small" />
                              {showExpanded && <span className="text-[14px] font-medium truncate">{item.label}</span>}
                            </span>
                            {showExpanded && (
                              <span className="ml-auto text-slate-500">
                                {groupOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </span>
                            )}
                          </button>
                          {showExpanded && groupOpen && (
                            <ul className="ml-5 mt-2 space-y-1 border-l border-slate-200 pl-3">
                              {(item.subItems || []).map((sub) => {
                                const subActive = isActive(sub.to, sub.exact);
                                return (
                                  <li key={sub.id}>
                                    <Link
                                      to={sub.to}
                                      className={`block rounded-lg px-3 py-2 text-sm transition-colors border-l-4 ${
                                        subActive
                                          ? 'bg-[#e8f0ff] text-primary-700 font-semibold border-primary-500'
                                          : 'text-slate-700 hover:bg-slate-100 border-transparent'
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
                          className={`flex items-center w-full rounded-lg transition-colors border-l-4 ${
                            active
                              ? 'bg-[#e8f0ff] text-primary-700 font-semibold border-primary-500'
                              : 'text-slate-700 hover:bg-slate-100 border-transparent'
                          } ${!showExpanded ? 'lg:justify-center px-2' : 'px-3'}`}
                        >
                          <span className={`flex items-center min-w-0 flex-1 py-2.5 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                            <Icon fontSize="small" />
                            {showExpanded && <span className="text-[14px] font-medium truncate">{item.label}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {showExpanded && (
        <div className="p-4 border-t border-slate-200 space-y-3">
          <button
            onClick={() => {
              lock();
              navigate('/lock');
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-primary-200 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-[#e8f0ff] transition-colors"
          >
            <LockOutlined sx={{ fontSize: 16 }} /> Lock
          </button>
          <p className="text-xs text-slate-500 text-center">
            © 2026 {user?.branch_name || 'ERP Premium'} | All rights reserved
          </p>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
