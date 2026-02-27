import { useEffect, useState } from 'react';
import { Boxes, LineChart, ShoppingBag, UserCheck, UserSquare, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReportModal } from '../../components/reports/ReportModal';
import { settingsService } from '../../services/settings.service';
import { CustomerReportsTab } from './customer/CustomerReportsTab';
import { FinancialReportsTab } from './financial/FinancialReportsTab';
import { HrReportsTab } from './hr/HrReportsTab';
import { InventoryReportsTab } from './inventory/InventoryReportsTab';
import { PurchaseReportsTab } from './purchase/PurchaseReportsTab';
import { SalesReportsTab } from './sales/SalesReportsTab';
import type { ModalReportState, TabId } from './types';

const reportTabs: Array<{ id: TabId; title: string; icon: LucideIcon }> = [
  { id: 'sales', title: 'Sales', icon: LineChart },
  { id: 'inventory', title: 'Inventory', icon: Boxes },
  { id: 'purchase', title: 'Purchases', icon: ShoppingBag },
  { id: 'financial', title: 'Financial', icon: Wallet },
  { id: 'hr', title: 'HR', icon: UserSquare },
  { id: 'customer', title: 'Customers', icon: UserCheck },
];

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabId>('sales');
  const [companyInfo, setCompanyInfo] = useState<{
    name?: string;
    manager?: string;
    phone?: string;
    updatedAt?: string;
  }>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReport, setModalReport] = useState<ModalReportState | null>(null);

  useEffect(() => {
    settingsService.getCompany().then((response) => {
      if (!response.success || !response.data?.company) return;
      const company = response.data.company;
      setCompanyInfo({
        name: company.company_name || undefined,
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-2 lg:px-0">
      <div className="rounded-xl border border-[#2c6287] bg-gradient-to-r from-[#123f5c] to-[#1b5a80] px-5 py-4 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] opacity-80">Inventory ERP</p>
            <h1 className="text-3xl font-bold leading-tight">Reports Control Center</h1>
            <p className="mt-1 text-sm opacity-90">Reports are organized by module tabs. Open any card to preview, print, or export.</p>
          </div>
          <div className="rounded-xl bg-white/15 px-4 py-3">
            <div className="text-xs uppercase tracking-wide opacity-80">Categories</div>
            <div className="text-2xl font-bold leading-none">{reportTabs.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#c4d0db] bg-[#f2f5f8] p-4 shadow-sm">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {reportTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                  active
                    ? 'border-[#0f4f76] bg-[#0f4f76] text-white shadow'
                    : 'border-[#b9c7d5] bg-white text-[#14344c] hover:bg-[#e9f0f6]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.title}
              </button>
            );
          })}
        </div>

        {activeTab === 'sales' && <SalesReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'inventory' && <InventoryReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'purchase' && <PurchaseReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'financial' && <FinancialReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'hr' && <HrReportsTab onOpenModal={handleOpenModal} />}
        {activeTab === 'customer' && <CustomerReportsTab onOpenModal={handleOpenModal} />}

        {activeTab !== 'sales' &&
          activeTab !== 'inventory' &&
          activeTab !== 'purchase' &&
          activeTab !== 'financial' &&
          activeTab !== 'hr' &&
          activeTab !== 'customer' && (
          <div className="rounded-lg border border-dashed border-[#b4c3d1] bg-white px-4 py-8 text-center text-[#3f5a72]">
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
        variant={modalReport?.variant || 'default'}
        fileName={modalReport?.fileName || 'report'}
      />
    </div>
  );
}
