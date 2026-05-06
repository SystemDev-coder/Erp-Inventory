import { useEffect, useMemo, useState } from 'react';
import { Boxes, LineChart, ShoppingBag, TrendingUp, Truck, UserCheck, UserSquare, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReportModal } from '../../components/reports/ReportModal';
import { settingsService } from '../../services/settings.service';
import { CustomerReportsTab } from './customer/CustomerReportsTab';
import { FinancialReportsTab } from './financial/FinancialReportsTab';
import { HrReportsTab } from './hr/HrReportsTab';
import { InventoryReportsTab } from './inventory/InventoryReportsTab';
import { PurchaseReportsTab } from './purchase/PurchaseReportsTab';
import { SalesReportsTab } from './sales/SalesReportsTab';
import { SupplierReportsTab } from './supplier/SupplierReportsTab';
import { ProfitReportsTab } from './profit/ProfitReportsTab';
import type { ModalReportState, TabId } from './types';
import { env } from '../../config/env';
import { useAuth } from '../../context/AuthContext';

const reportTabs: Array<{ id: TabId; title: string; icon: LucideIcon }> = [
  { id: 'sales', title: 'Sales', icon: LineChart },
  { id: 'inventory', title: 'Inventory', icon: Boxes },
  { id: 'purchase', title: 'Purchases', icon: ShoppingBag },
  { id: 'financial', title: 'Financial', icon: Wallet },
  { id: 'profit', title: 'Profit', icon: TrendingUp },
  { id: 'hr', title: 'HR', icon: UserSquare },
  { id: 'customer', title: 'Customers', icon: UserCheck },
  { id: 'supplier', title: 'Suppliers', icon: Truck },
];

// UPDATED: Treat your DB system roles (Administrator, Viewer) as full-access for report tabs
const isAdminLikeRole = (roleName?: string | null) => {
  const normalized = (roleName || '').toLowerCase();
  return normalized === 'administrator' || normalized === 'viewer';
};

// NEW: Role-based tab allowlist using your exact DB `role_name` values
const roleTabAllowlist: Record<string, TabId[]> = {
  administrator: ['sales', 'inventory', 'purchase', 'financial', 'profit', 'hr', 'customer', 'supplier'],
  viewer: ['sales', 'inventory', 'purchase', 'financial', 'profit', 'hr', 'customer', 'supplier'],
  'store manager': ['sales', 'inventory', 'purchase', 'customer', 'supplier', 'profit'],
  'sales associate': ['sales', 'customer'],
  'inventory clerk': ['inventory'],
  'purchasing agent': ['purchase', 'supplier'],
  accountant: ['financial', 'profit'],
  'hr manager': ['hr'],
};

const expandPermissionKeys = (permKey: string): string[] => {
  if (permKey.startsWith('items.')) {
    return [permKey, permKey.replace('items.', 'products.')];
  }
  if (permKey.startsWith('products.')) {
    return [permKey, permKey.replace('products.', 'items.')];
  }
  if (permKey === 'stock.view') {
    return [permKey, 'warehouse_stock.view'];
  }
  if (permKey === 'warehouse_stock.view') {
    return [permKey, 'stock.view'];
  }
  return [permKey];
};

const hasAnyPermission = (userPermissions: string[], required: string[]) => {
  if (!required.length) return true;
  const permSet = new Set(userPermissions);
  return required.some((perm) => expandPermissionKeys(perm).some((key) => permSet.has(key)));
};

const tabPermissionAny: Record<TabId, string[]> = {
  sales: ['reports.all', 'sales.view', 'sales.reports'],
  inventory: ['reports.all', 'inventory.view', 'inventory.reports', 'stock.view', 'items.view'],
  purchase: ['reports.all', 'purchases.view', 'purchases.reports', 'suppliers.view'],
  financial: [
    'reports.all',
    'finance.reports',
    'finance.balance',
    'finance.income',
    'finance.cashflow',
    'ledgers.view',
    'accounts.view',
    'account_transactions.view',
    'expenses.view',
    'customer_receipts.view',
    'supplier_payments.view',
  ],
  profit: [
    'reports.all',
    'finance.reports',
    'finance.income',
    'sales.view',
    'sales.reports',
  ],
  hr: [
    'reports.all',
    'hr.reports',
    'employees.view',
    'employee_shift_assignments.view',
    'employee_loans.view',
    'loan_payments.view',
    'payroll_runs.view',
    'payroll_lines.view',
    'employee_payments.view',
  ],
  customer: [
    'reports.all',
    'customers.view',
    'customer_receipts.view',
    'sales.view',
    'sales_returns.view',
    'customer_ledger.view',
  ],
  supplier: [
    'reports.all',
    'suppliers.view',
    'purchases.view',
    'supplier_payments.view',
  ],
};

export default function Reports() {
  const { user, permissions } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('sales');
  const [companyInfo, setCompanyInfo] = useState<{
    name?: string;
    logoUrl?: string;
    bannerUrl?: string;
    manager?: string;
    phone?: string;
    updatedAt?: string;
  }>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReport, setModalReport] = useState<ModalReportState | null>(null);

  const resolveImageUrl = (value?: string | null) => {
    const raw = (value || '').trim();
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('uploads/')) return `${env.API_URL}/${raw}`;
    if (raw.startsWith('/')) return `${env.API_URL}${raw}`;
    return raw;
  };

  useEffect(() => {
    settingsService.getCompany().then((response) => {
      if (!response.success || !response.data?.company) return;
      const company = response.data.company;
      setCompanyInfo({
        name: company.company_name || undefined,
        logoUrl: resolveImageUrl(company.logo_img),
        bannerUrl: resolveImageUrl(company.banner_img),
        manager: company.manager_name || undefined,
        phone: company.phone || undefined,
        updatedAt: company.updated_at ? new Date(company.updated_at).toLocaleString() : undefined,
      });
    });
  }, []);

  const handleOpenModal = (payload: ModalReportState) => {
    setModalReport(payload);
    setModalOpen(true);
  };

  // UPDATED: Filter tabs by DB role first, then permissions as a safety net (prevents broken/forbidden tabs)
  const visibleTabs = useMemo(() => {
    const roleName = (user?.role_name || '').toLowerCase();
    const allowedByRole = isAdminLikeRole(user?.role_name)
      ? reportTabs
      : reportTabs.filter((tab) => (roleTabAllowlist[roleName] || []).includes(tab.id));

    return allowedByRole.filter((tab) => hasAnyPermission(permissions, tabPermissionAny[tab.id] || []));
  }, [permissions, user?.role_name]);

  // NEW: Ensure active tab is always a visible one
  useEffect(() => {
    if (!visibleTabs.length) return;
    const activeStillVisible = visibleTabs.some((t) => t.id === activeTab);
    if (!activeStillVisible) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-2 lg:px-0">
      <div className="rounded-xl border border-zinc-300 bg-white px-5 py-4 text-black shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-500">Inventory ERP</p>
            <h1 className="text-3xl font-bold leading-tight">Reports Control Center</h1>
            <p className="mt-1 text-sm text-zinc-700">Reports are organized by module tabs. Open any card to preview, print, or export.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                  active
                    ? 'border-black bg-black text-white shadow'
                    : 'border-zinc-300 bg-white text-black hover:bg-zinc-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.title}
              </button>
            );
          })}
        </div>

        {/* NEW: Friendly message if user has no report permissions */}
        {visibleTabs.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-zinc-700">
            <p className="text-lg font-semibold">No reports available</p>
            <p className="mt-1 text-sm">Your role does not have access to any report tabs.</p>
          </div>
        )}

        {activeTab === 'sales' && <SalesReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'inventory' && <InventoryReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'purchase' && <PurchaseReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'financial' && <FinancialReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'profit' && <ProfitReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'hr' && <HrReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'customer' && <CustomerReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'supplier' && <SupplierReportsTab onOpenModal={handleOpenModal} />}

        {activeTab !== 'sales' &&
          activeTab !== 'inventory' &&
          activeTab !== 'purchase' &&
          activeTab !== 'financial' &&
          activeTab !== 'profit' &&
          activeTab !== 'hr' &&
          activeTab !== 'customer' &&
          activeTab !== 'supplier' && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-zinc-700">
            <p className="text-lg font-semibold">{reportTabs.find((tab) => tab.id === activeTab)?.title} reports tab</p>
            <p className="mt-1 text-sm">This tab is ready for modular implementation in its own report subfolder.</p>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalReport?.title || 'Report'}
        subtitle={modalReport?.subtitle}
        companyInfo={companyInfo}
        data={modalReport?.data || []}
        columns={modalReport?.columns || []}
        filters={modalReport?.filters || {}}
        totals={modalReport?.totals || []}
        tableTotals={modalReport?.tableTotals}
        variant={modalReport?.variant || 'default'}
        fileName={modalReport?.fileName || 'report'}
      />
    </div>
  );
}
