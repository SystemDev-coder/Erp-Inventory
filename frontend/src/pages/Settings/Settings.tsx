import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CircleDollarSign, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { settingsService, CompanyInfo, CapitalContribution } from '../../services/settings.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Assets from '../Assets/Assets';
import { useAuth } from '../../context/AuthContext';

const emptyCompanyForm = {
  company_name: '',
  phone: '',
  manager_name: '',
  logo_img: '',
  banner_img: '',
  capital_amount: '0',
};

const today = () => new Date().toISOString().slice(0, 10);

const formatMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Settings = () => {
  const { showToast } = useToast();
  const { permissions } = useAuth();

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyDisplayed, setCompanyDisplayed] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [companyDeleteConfirmOpen, setCompanyDeleteConfirmOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);

  const [capitalRows, setCapitalRows] = useState<CapitalContribution[]>([]);
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [capitalPage, setCapitalPage] = useState(1);
  const [capitalLimit] = useState(10);
  const [capitalTotal, setCapitalTotal] = useState(0);
  const [capitalSearch, setCapitalSearch] = useState('');
  const [capitalDisplayed, setCapitalDisplayed] = useState(false);

  const [capitalModalOpen, setCapitalModalOpen] = useState(false);
  const [capitalSaving, setCapitalSaving] = useState(false);
  const [editingCapital, setEditingCapital] = useState<CapitalContribution | null>(null);
  const [capitalDeleteId, setCapitalDeleteId] = useState<number | null>(null);
  const [capitalDeleteLoading, setCapitalDeleteLoading] = useState(false);

  const [capitalForm, setCapitalForm] = useState({
    ownerName: '',
    amount: '',
    date: today(),
    note: '',
  });

  const totalCapitalPages = Math.max(1, Math.ceil(capitalTotal / capitalLimit));

  const loadCompany = async () => {
    setCompanyLoading(true);
    const res = await settingsService.getCompany();
    setCompanyLoading(false);
    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Failed to load company info');
      return;
    }
    const loaded = res.data.company;
    const hasValues =
      !!loaded.company_name?.trim() ||
      !!loaded.phone?.trim() ||
      !!loaded.manager_name?.trim() ||
      !!loaded.logo_img?.trim() ||
      !!loaded.banner_img?.trim() ||
      Number(loaded.capital_amount || 0) > 0;
    setCompany(hasValues ? loaded : null);
    setCompanyForm({
      company_name: loaded.company_name || '',
      phone: loaded.phone || '',
      manager_name: loaded.manager_name || '',
      logo_img: loaded.logo_img || '',
      banner_img: loaded.banner_img || '',
      capital_amount: String(loaded.capital_amount ?? 0),
    });
  };

  const loadCapital = async (page = 1) => {
    setCapitalLoading(true);
    const res = await settingsService.listCapital({ page, limit: capitalLimit, search: capitalSearch || undefined });
    setCapitalLoading(false);
    if (!res.success || !res.data) {
      showToast('error', 'Capital', res.error || 'Failed to load capital records');
      return;
    }
    setCapitalRows(res.data.rows || []);
    setCapitalPage(res.data.page || page);
    setCapitalTotal(res.data.total || 0);
    setCapitalDisplayed(true);
  };

  const handleDisplayCompany = async () => {
    setCompanyDisplayed(true);
    await loadCompany();
  };

  const handleCompanyEdit = () => {
    if (company) {
      setCompanyForm({
        company_name: company.company_name || '',
        phone: company.phone || '',
        manager_name: company.manager_name || '',
        logo_img: company.logo_img || '',
        banner_img: company.banner_img || '',
        capital_amount: String(company.capital_amount ?? 0),
      });
    } else {
      setCompanyForm(emptyCompanyForm);
    }
    setCompanyModalOpen(true);
  };

  const handleCompanySave = async () => {
    const capitalAmount = Number(companyForm.capital_amount || 0);
    if (!Number.isFinite(capitalAmount) || capitalAmount < 0) {
      showToast('error', 'Company Info', 'Capital must be zero or greater');
      return;
    }
    setCompanySaving(true);
    const res = await settingsService.updateCompany({
      company_name: companyForm.company_name,
      phone: companyForm.phone,
      manager_name: companyForm.manager_name,
      logo_img: companyForm.logo_img,
      banner_img: companyForm.banner_img,
      capital_amount: capitalAmount,
    });
    setCompanySaving(false);

    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Save failed');
      return;
    }

    setCompany(res.data.company);
    setCompanyModalOpen(false);
    showToast('success', 'Company Info', 'Saved');
    await loadCompany();
  };

  const handleCompanyDelete = async () => {
    if (!company) return;
    setCompanyDeleting(true);
    const res = await settingsService.deleteCompany();
    setCompanyDeleting(false);
    if (!res.success) {
      showToast('error', 'Company Info', res.error || 'Delete failed');
      return;
    }
    setCompany(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyDeleteConfirmOpen(false);
    showToast('success', 'Company Info', 'Deleted');
  };

  const openCreateCapital = () => {
    setEditingCapital(null);
    setCapitalForm({ ownerName: '', amount: '', date: today(), note: '' });
    setCapitalModalOpen(true);
  };

  const openEditCapital = (row: CapitalContribution) => {
    setEditingCapital(row);
    setCapitalForm({
      ownerName: row.owner_name,
      amount: String(row.amount),
      date: row.date,
      note: row.note || '',
    });
    setCapitalModalOpen(true);
  };

  const submitCapital = async () => {
    const amount = Number(capitalForm.amount);
    if (!capitalForm.ownerName.trim()) {
      showToast('error', 'Capital', 'Owner name is required');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Capital', 'Amount must be greater than 0');
      return;
    }
    if (!capitalForm.date) {
      showToast('error', 'Capital', 'Date is required');
      return;
    }

    setCapitalSaving(true);
    const payload = {
      ownerName: capitalForm.ownerName.trim(),
      amount,
      date: capitalForm.date,
      note: capitalForm.note.trim(),
    };

    const res = editingCapital
      ? await settingsService.updateCapital(editingCapital.capital_id, payload)
      : await settingsService.createCapital(payload);
    setCapitalSaving(false);

    if (!res.success) {
      showToast('error', 'Capital', res.error || (editingCapital ? 'Failed to update capital' : 'Failed to create capital'));
      return;
    }

    setCapitalModalOpen(false);
    showToast('success', 'Capital', editingCapital ? 'Capital updated' : 'Capital created');
    await loadCapital(capitalPage);
  };

  const confirmDeleteCapital = async () => {
    if (!capitalDeleteId) return;
    setCapitalDeleteLoading(true);
    const res = await settingsService.deleteCapital(capitalDeleteId);
    setCapitalDeleteLoading(false);
    if (!res.success) {
      showToast('error', 'Capital', res.error || 'Delete failed');
      return;
    }
    setCapitalDeleteId(null);
    showToast('success', 'Capital', 'Capital deleted');
    await loadCapital(capitalPage);
  };

  const companyContent = (
    <div className="bg-white border border-black rounded-xl p-6 space-y-4 text-black">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Company Info</h3>
        <div className="flex gap-2">
          <button
            onClick={handleDisplayCompany}
            className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
            disabled={companyLoading}
          >
            {companyLoading ? 'Loading...' : 'Display'}
          </button>
          <button
            onClick={handleCompanyEdit}
            className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {company ? 'Edit' : 'Add'} Company
          </button>
        </div>
      </div>

      {!companyDisplayed ? (
        <p className="text-sm">Click Display to load company info.</p>
      ) : !company ? (
        <p className="text-sm">No company profile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-black">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Manager</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Capital</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-4">{company.company_name || '-'}</td>
                <td className="py-2 pr-4">{company.manager_name || '-'}</td>
                <td className="py-2 pr-4">{company.phone || '-'}</td>
                <td className="py-2 pr-4">{formatMoney(Number(company.capital_amount || 0))}</td>
                <td className="py-2 pr-4">{company.updated_at ? new Date(company.updated_at).toLocaleString() : '-'}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button onClick={handleCompanyEdit} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setCompanyDeleteConfirmOpen(true)}
                      disabled={companyDeleting}
                      className="px-2 py-1 rounded border border-black inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={companyModalOpen} onClose={() => setCompanyModalOpen(false)} title={`${company ? 'Edit' : 'Add'} Company`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm font-medium flex flex-col gap-1">
            Company Name
            <input className="rounded border border-black px-3 py-2" value={companyForm.company_name} onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Manager Name
            <input className="rounded border border-black px-3 py-2" value={companyForm.manager_name} onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Phone
            <input className="rounded border border-black px-3 py-2" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Capital
            <input type="number" min="0" step="0.01" className="rounded border border-black px-3 py-2" value={companyForm.capital_amount} onChange={(e) => setCompanyForm({ ...companyForm, capital_amount: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Logo URL / Path
            <input className="rounded border border-black px-3 py-2" value={companyForm.logo_img} onChange={(e) => setCompanyForm({ ...companyForm, logo_img: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1 md:col-span-2">
            Banner URL / Path
            <input className="rounded border border-black px-3 py-2" value={companyForm.banner_img} onChange={(e) => setCompanyForm({ ...companyForm, banner_img: e.target.value })} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button className="px-4 py-2 rounded border border-black" onClick={() => setCompanyModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded border border-black bg-black text-white" onClick={handleCompanySave} disabled={companySaving}>
            {companySaving ? 'Saving...' : company ? 'Update' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={companyDeleteConfirmOpen}
        onClose={() => setCompanyDeleteConfirmOpen(false)}
        onConfirm={handleCompanyDelete}
        title="Delete Company Profile?"
        highlightedName={company?.company_name || undefined}
        message="This action will permanently remove company profile data."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={companyDeleting}
      />
    </div>
  );

  const assetsContent = <Assets embedded />;

  const capitalContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-2 justify-between">
          <div className="flex items-end gap-2">
            <label className="text-sm font-medium flex flex-col gap-1">
              Search
              <input
                value={capitalSearch}
                onChange={(e) => setCapitalSearch(e.target.value)}
                placeholder="Owner / note"
                className="rounded border border-black px-3 py-2 w-64"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadCapital(1)}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={capitalLoading}
            >
              {capitalLoading ? 'Loading...' : 'Display Capital'}
            </button>
            <button onClick={openCreateCapital} className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Capital
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-black rounded-xl p-4">
        {!capitalDisplayed ? (
          <p className="text-sm">Click Display Capital to load records.</p>
        ) : capitalRows.length === 0 ? (
          <p className="text-sm">No capital records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Note</th>
                  <th className="py-2 pr-4">Created By</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {capitalRows.map((row) => (
                  <tr key={row.capital_id} className="border-b border-zinc-200">
                    <td className="py-2 pr-4">{row.date}</td>
                    <td className="py-2 pr-4">{row.owner_name}</td>
                    <td className="py-2 pr-4">{formatMoney(row.amount)}</td>
                    <td className="py-2 pr-4">{row.note || '-'}</td>
                    <td className="py-2 pr-4">{row.created_by_name || '-'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEditCapital(row)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => setCapitalDeleteId(row.capital_id)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-sm">
          <span>Page {capitalPage} of {totalCapitalPages}</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded border border-black disabled:opacity-50" disabled={capitalPage <= 1 || capitalLoading} onClick={() => void loadCapital(Math.max(1, capitalPage - 1))}>Prev</button>
            <button className="px-3 py-1 rounded border border-black disabled:opacity-50" disabled={capitalPage >= totalCapitalPages || capitalLoading} onClick={() => void loadCapital(Math.min(totalCapitalPages, capitalPage + 1))}>Next</button>
          </div>
        </div>
      </div>

      <Modal isOpen={capitalModalOpen} onClose={() => setCapitalModalOpen(false)} title={editingCapital ? 'Edit Capital' : 'Add Capital'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm font-medium flex flex-col gap-1">
            Owner Name *
            <input className="rounded border border-black px-3 py-2" value={capitalForm.ownerName} onChange={(e) => setCapitalForm({ ...capitalForm, ownerName: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Amount *
            <input type="number" min="0" step="0.01" className="rounded border border-black px-3 py-2" value={capitalForm.amount} onChange={(e) => setCapitalForm({ ...capitalForm, amount: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Date *
            <input type="date" className="rounded border border-black px-3 py-2" value={capitalForm.date} onChange={(e) => setCapitalForm({ ...capitalForm, date: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1 md:col-span-2">
            Note
            <textarea className="rounded border border-black px-3 py-2" rows={3} value={capitalForm.note} onChange={(e) => setCapitalForm({ ...capitalForm, note: e.target.value })} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button className="px-4 py-2 rounded border border-black" onClick={() => setCapitalModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded border border-black bg-black text-white" onClick={submitCapital} disabled={capitalSaving}>
            {capitalSaving ? 'Saving...' : editingCapital ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={capitalDeleteId !== null}
        onClose={() => setCapitalDeleteId(null)}
        onConfirm={confirmDeleteCapital}
        title="Delete Capital Entry?"
        message="This will reverse and remove linked accounting records."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={capitalDeleteLoading}
      />
    </div>
  );

  const tabs = useMemo(() => {
    const canManageAssets = permissions.includes('accounts.view') || permissions.includes('reports.all');
    const result = [
      { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
      { id: 'capital', label: 'Capital', icon: CircleDollarSign, content: capitalContent },
    ];
    if (canManageAssets) {
      result.splice(1, 0, { id: 'assets', label: 'Assets', icon: BriefcaseBusiness, content: assetsContent });
    }
    return result;
  }, [permissions, companyContent, capitalContent, assetsContent]);

  return (
    <div>
      <PageHeader title="Settings" description="Configure company profile and manage assets and owner capital." />
      <Tabs tabs={tabs} defaultTab="company" />
    </div>
  );
};

export default Settings;
