import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Trash2,
  Lock as LockIcon,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router';
import { settingsService } from '../services/settings.service';

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
  const { t } = useLanguage();
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    settingsService.getCompany().then((res) => {
      if (res.success && res.data?.company?.company_name) {
        setCompanyName(res.data.company.company_name);
      }
    });
  }, []);

  const brandName = companyName || 'KeydMaal ERP';
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
    const isDeveloper = (user?.role_name || '').toLowerCase() === 'developer';
    const base: { title: string; items: SidebarItem[] }[] = [
      {
        title: t('sidebar_group_main'),
          items: [
          { id: 'dashboard', label: t('nav_dashboard'), icon: LayoutDashboard, to: '/', exact: true, permissionAny: ['dashboard.view', 'home.view'] },
          { id: 'customers', label: t('nav_customers'), icon: Users, to: '/customers', permissionAny: ['customers.view'] },
        ],
      },
      {
        title: t('sidebar_group_operations'),
        items: [
          {
            id: 'stockManagement',
            label: t('nav_stock_management'),
            icon: Store,
            permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'],
            expandable: true,
            subItems: [
              { id: 'stock-items', label: t('nav_items'), to: '/stock-management/items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
              { id: 'adjust-items', label: t('nav_adjust_items'), to: '/stock-management/adjust-items', exact: true, permissionAny: ['items.view', 'products.view', 'stock.view', 'inventory.view'] },
            ],
          },
          { id: 'returns', label: t('nav_returns'), icon: FileText, to: '/returns', exact: true, permissionAny: ['returns.view', 'sales_returns.view', 'purchase_returns.view'] },
          { id: 'purchases', label: t('nav_purchases'), icon: ShoppingBag, to: '/purchases', permissionAny: ['purchases.view', 'suppliers.view'] },
          { id: 'sales', label: t('nav_sales'), icon: ReceiptText, to: '/sales', exact: true, permissionAny: ['sales.view'] },
        ],
      },
      {
        title: t('sidebar_group_finance'),
        items: [
          {
            id: 'finance',
            label: t('nav_finance'),
            icon: DollarSign,
            to: '/finance',
            exact: true,
            expandable: true,
            permissionAny: ['finance.reports', 'accounts.view', 'expenses.view', 'ledgers.view'],
            subItems: [
              { id: 'finance-accounts', label: t('nav_accounts'), to: '/finance/accounts', exact: true, permissionAny: ['accounts.view'] },
              { id: 'finance-receipts', label: t('nav_receipts'), to: '/finance/receipts', exact: true, permissionAny: ['accounts.view', 'sales.view', 'purchases.view'] },
              { id: 'finance-expenses', label: t('nav_expenses'), to: '/finance/expense', exact: true, permissionAny: ['expenses.view'] },
              // UPDATED: Allow Accountant/Finance roles to see Payroll in Finance (supports both payroll_* and finance/account permissions)
              { id: 'finance-payroll', label: t('nav_payroll'), to: '/finance/payroll', exact: true, permissionAny: ['payroll_lines.view', 'payroll_runs.view', 'payroll.process', 'payroll.pay', 'finance.reports', 'accounts.view'] },
            ],
          },
        ],
      },
      {
        title: t('sidebar_group_people'),
        items: [{ id: 'hr', label: t('nav_hr'), icon: BriefcaseBusiness, to: '/employees/registration', permissionAny: ['employees.view'] }],
      },
      {
        title: t('sidebar_group_system'),
        items: [
          { id: 'system', label: t('nav_system'), icon: Settings, to: '/system', permissionAny: ['system.settings'] },
          { id: 'setting', label: t('nav_setting'), icon: Cog, to: '/settings', permissionAny: ['system.settings', 'users.view', 'roles.view', 'permissions.view', 'system.users.manage', 'system.roles.manage', 'system.permissions.manage'] },
          { id: 'reports', label: t('nav_reports'), icon: FileText, to: '/reports', permissionAny: ['reports.all'] },
          ...(isDeveloper ? [{ id: 'trash', label: t('nav_trash'), icon: Trash2, to: '/trash', permissionAny: ['trash.view'] }] : []),
        ],
      },
    ];
    return base;
  }, [user?.role_name, t]);

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
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 left-0 bg-white text-slate-900 border-r border-slate-200 dark:bg-black dark:text-white dark:border-white/10 h-screen transition-all duration-300 ease-in-out z-50 shadow-[0_8px_26px_-12px_rgba(15,23,42,0.45)]
        ${showExpanded ? 'w-[280px]' : 'w-[80px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      aria-label="Application sidebar"
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-5 flex items-center gap-2 border-b border-slate-200 dark:border-white/10 ${
          !showExpanded ? 'lg:justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0" aria-label={brandName}>
          <div className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-black text-white flex items-center justify-center shadow-sm dark:border-white/15 dark:bg-white dark:text-black">
            <ShoppingCart className="w-5 h-5" />
          </div>
          {showExpanded && (
            <span className="text-lg font-semibold truncate">
              {brandName}
            </span>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          aria-label={showExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="hidden lg:flex shrink-0 p-1.5 rounded-lg transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
        >
          {showExpanded ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <nav className={`px-2 pb-4 ${showExpanded ? 'pt-3' : 'pt-4'}`} aria-label="Main">
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
                      aria-expanded={groupOpen}
                      aria-controls={`${item.id}-submenu`}
                      aria-label={item.label}
                      className={`flex items-center w-full min-h-11 rounded-lg px-3 py-2.5 transition-colors ${
                        hasActiveSub
                          ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/15'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
                      } ${!showExpanded ? 'lg:justify-center px-0' : ''}`}
                    >
                      <span className={`flex items-center min-w-0 flex-1 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                        <span
                          className={`flex-shrink-0 ${
                            hasActiveSub ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/60'
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
                      <ul id={`${item.id}-submenu`} className="ml-5 mt-2 space-y-1 border-l border-slate-200 pl-3 dark:border-white/10">
                        {(item.subItems || []).map((sub) => {
                          const subActive = isActive(sub.to, sub.exact);
                          return (
                            <li key={sub.id}>
                              <Link
                                to={sub.to}
                                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                                  subActive
                                    ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/15'
                                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
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
                    aria-label={item.label}
                    title={item.label}
                    className={`flex items-center w-full min-h-11 rounded-lg transition-colors ${
                      active
                        ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/15'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${!showExpanded ? 'lg:justify-center px-0' : 'px-3'}`}
                  >
                    <span className={`flex items-center min-w-0 flex-1 py-2.5 ${!showExpanded ? 'lg:justify-center' : 'gap-3'}`}>
                      <span className={`${active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/60'} flex-shrink-0`}>
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
        <div className="p-4 border-t border-slate-200 space-y-3 dark:border-white/10">
          <button
            onClick={() => {
              lock();
              navigate('/lock');
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-white/15 dark:bg-black dark:text-white dark:hover:bg-white/10"
          >
            <LockIcon className="h-4 w-4" /> {t('sidebar_lock')}
          </button>
          <p className="text-xs text-slate-500 text-center dark:text-white/50">
            © 2026 {brandName}. All rights reserved.
          </p>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
