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
  Lock as LockIcon,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';

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
  const { permissions, lock, user } = useAuth();
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
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/', exact: true, permissionAny: ['dashboard.view'] },
          { id: 'customers', label: 'Customers', icon: Users, to: '/customers', permissionAny: ['customers.view'] },
        ],
      },
      {
        title: 'Operations',
        items: [
          {
            id: 'stockManagement',
            label: 'Stock Management',
            icon: Store,
            permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'],
            expandable: true,
            subItems: [
              { id: 'stock-items', label: 'Items', to: '/stock-management/items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
              { id: 'adjust-items', label: 'Adjust Items', to: '/stock-management/adjust-items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
            ],
          },
          { id: 'return', label: 'Return', icon: FileText, to: '/return', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
          { id: 'purchases', label: 'Purchases', icon: ShoppingBag, to: '/purchases', permissionAny: ['purchases.view', 'suppliers.view'] },
          { id: 'sales', label: 'Sales', icon: ReceiptText, to: '/sales', exact: true, permissionAny: ['sales.view'] },
        ],
      },
      {
        title: 'Finance',
        items: [
          {
            id: 'finance',
            label: 'Finance',
            icon: DollarSign,
            to: '/finance',
            exact: true,
            expandable: true,
            permissionAny: ['finance.reports', 'accounts.view', 'expenses.view', 'ledgers.view'],
            subItems: [
              { id: 'finance-accounts', label: 'Accounts', to: '/finance/accounts', exact: true, permissionAny: ['accounts.view'] },
              { id: 'finance-receipts', label: 'Receipts', to: '/finance/receipts', exact: true, permissionAny: ['accounts.view', 'sales.view', 'purchases.view'] },
              { id: 'finance-expenses', label: 'Expenses', to: '/finance/expense', exact: true, permissionAny: ['expenses.view'] },
              { id: 'finance-payroll', label: 'Payroll', to: '/finance/payroll', exact: true, permissionAny: ['payroll_lines.view', 'payroll_runs.view'] },
              { id: 'finance-assets', label: 'Assets', to: '/assets', exact: true, permissionAny: ['accounts.view'] },
            ],
          },
        ],
      },
      {
        title: 'People',
        items: [{ id: 'hr', label: 'HR', icon: BriefcaseBusiness, to: '/employees/registration', permissionAny: ['employees.view'] }],
      },
      {
        title: 'System',
        items: [
          { id: 'system', label: 'System', icon: Settings, to: '/system', permissionAny: ['users.view', 'roles.view', 'permissions.view', 'system.users.manage', 'system.roles.manage', 'system.permissions.manage'] },
          { id: 'setting', label: 'Setting', icon: Cog, to: '/settings', permissionAny: ['system.settings'] },
          { id: 'reports', label: 'Reports', icon: FileText, to: '/reports', permissionAny: ['reports.all'] },
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
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-gradient-to-b from-[#123f5c] to-[#1b5a80] text-[#e7f2fb] border-r border-[#2c6287] h-screen transition-all duration-300 ease-in-out z-50 shadow-[0_8px_26px_-12px_rgba(15,23,42,0.45)]
        ${showExpanded ? 'w-[280px]' : 'w-[80px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-5 flex items-center gap-2 border-b border-white/20 ${
          !showExpanded ? 'lg:justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg border border-[#3e7396] bg-[#0f4f76] flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          {showExpanded && (
            <span className="text-lg font-semibold text-white truncate">
              {user?.branch_name || 'KeydMaal ERP'}
            </span>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          aria-label={showExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="hidden lg:flex shrink-0 p-1.5 hover:bg-[#0f4f76] rounded-lg transition-colors text-[#c6dceb]"
        >
          {showExpanded ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <nav className={`px-2 pb-4 ${showExpanded ? 'pt-3' : 'pt-4'}`}>
          <ul className="space-y-1">
            {visibleGroups.map((group) => (
              <li key={group.title} className="mt-2">
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
                      className={`flex items-center w-full rounded-lg px-3 py-2.5 transition-colors ${
                        hasActiveSub
                          ? 'bg-[#0f4f76] text-white ring-1 ring-[#83b2cf]'
                          : 'text-[#dbeaf6] hover:bg-[#0f4f76] hover:text-white'
                      } ${!showExpanded ? 'lg:justify-center px-0' : ''}`}
                    >
                      <span className={`flex items-center min-w-0 flex-1 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                        <span
                          className={`flex-shrink-0 ${
                            hasActiveSub ? 'text-white' : 'text-[#b5d0e4]'
                          }`}
                        >
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
                      <ul className="ml-5 mt-2 space-y-1 border-l border-[#83b2cf]/60 pl-3">
                        {(item.subItems || []).map((sub) => {
                          const subActive = isActive(sub.to, sub.exact);
                          return (
                            <li key={sub.id}>
                              <Link
                                to={sub.to}
                                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                                  subActive
                                    ? 'bg-[#0f4f76] text-white ring-1 ring-[#83b2cf]'
                                    : 'text-[#dbeaf6] hover:bg-[#0f4f76] hover:text-white'
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
                        ? 'bg-[#0f4f76] text-white ring-1 ring-[#83b2cf]'
                        : 'text-[#dbeaf6] hover:bg-[#0f4f76] hover:text-white'
                    } ${!showExpanded ? 'lg:justify-center px-0' : 'px-3'}`}
                  >
                    <span className={`flex items-center min-w-0 flex-1 py-2.5 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                      <span className={`${active ? 'text-white' : 'text-[#b5d0e4]'} flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      {showExpanded && <span className="text-sm font-medium truncate">{item.label}</span>}
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
        <div className="p-4 border-t border-[#83b2cf]/40 space-y-3">
          <button
            onClick={() => {
              lock();
              navigate('/lock');
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#83b2cf] bg-[#0f4f76] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b4061]"
          >
            <LockIcon className="h-4 w-4" /> Lock
          </button>
          <p className="text-xs text-[#c6dceb] text-center">
            (c) 2026 {user?.branch_name || 'KeydMaal ERP'} | All rights reserved
          </p>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
