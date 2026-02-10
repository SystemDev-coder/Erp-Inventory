import { useEffect, useMemo, useState } from 'react';
import { Home, Building, History, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { settingsService, CompanyInfo, Branch, AuditLog } from '../../services/settings.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';

const Settings = () => {
  const { showToast } = useToast();

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ branchName: '', location: '' });
  const [branchSaving, setBranchSaving] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const auditLimit = 20;

  const loadCompany = async () => {
    setCompanyLoading(true);
    const res = await settingsService.getCompany();
    if (res.success && res.data?.company) {
      setCompany(res.data.company);
    } else {
      showToast('error', 'Company Info', res.error || 'Failed to load company info');
    }
    setCompanyLoading(false);
  };

  const loadBranches = async () => {
    setBranchesLoading(true);
    const res = await settingsService.listBranches();
    if (res.success && res.data?.branches) {
      setBranches(res.data.branches);
    } else {
      showToast('error', 'Branches', res.error || 'Failed to load branches');
    }
    setBranchesLoading(false);
  };

  const loadAudit = async (page = 1) => {
    setAuditLoading(true);
    const res = await settingsService.listAudit(page, auditLimit);
    if (res.success && res.data?.logs) {
      setAuditLogs(res.data.logs);
      setAuditPage(res.data.page || page);
      setAuditTotal(res.data.total || 0);
    } else {
      showToast('error', 'Audit History', res.error || 'Failed to load audit history');
    }
    setAuditLoading(false);
  };

  useEffect(() => {
    loadCompany();
    loadBranches();
    loadAudit();
  }, []);

  const handleCompanySave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSavingCompany(true);
    const res = await settingsService.updateCompany({
      company_name: company.company_name || '',
      phone: company.phone || '',
      manager_name: company.manager_name || '',
      logo_img: company.logo_img || '',
      banner_img: company.banner_img || '',
    });
    setSavingCompany(false);
    if (res.success && res.data?.company) {
      setCompany(res.data.company);
      showToast('success', 'Company Info', 'Saved');
    } else {
      showToast('error', 'Company Info', res.error || 'Save failed');
    }
  };

  const openBranchModal = (branch?: Branch) => {
    setEditingBranch(branch || null);
    setBranchForm({
      branchName: branch?.branch_name || '',
      location: branch?.location || '',
    });
    setBranchModalOpen(true);
  };

  const saveBranch = async () => {
    setBranchSaving(true);
    const payload = {
      branchName: branchForm.branchName,
      location: branchForm.location,
    };
    const res = editingBranch
      ? await settingsService.updateBranch(editingBranch.branch_id, payload)
      : await settingsService.createBranch(payload);
    setBranchSaving(false);
    if (res.success) {
      showToast('success', 'Branches', editingBranch ? 'Branch updated' : 'Branch created');
      setBranchModalOpen(false);
      setEditingBranch(null);
      loadBranches();
    } else {
      showToast('error', 'Branches', res.error || 'Save failed');
    }
  };

  const deleteBranch = async (branch: Branch) => {
    if (!confirm(`Delete branch "${branch.branch_name}"?`)) return;
    const res = await settingsService.deleteBranch(branch.branch_id);
    if (res.success) {
      showToast('success', 'Branches', 'Branch deleted');
      loadBranches();
    } else {
      showToast('error', 'Branches', res.error || 'Delete failed');
    }
  };

  const companyContent = (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
      {companyLoading && <p className="text-sm text-slate-500">Loading...</p>}
      {!companyLoading && (
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCompanySave}>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Company Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={company?.company_name || ''}
              onChange={(e) => setCompany((prev) => prev ? { ...prev, company_name: e.target.value } : prev)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Phone
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={company?.phone || ''}
              onChange={(e) => setCompany((prev) => prev ? { ...prev, phone: e.target.value } : prev)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Manager Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={company?.manager_name || ''}
              onChange={(e) => setCompany((prev) => prev ? { ...prev, manager_name: e.target.value } : prev)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Logo Image URL
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={company?.logo_img || ''}
              onChange={(e) => setCompany((prev) => prev ? { ...prev, logo_img: e.target.value } : prev)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Banner Image URL
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={company?.banner_img || ''}
              onChange={(e) => setCompany((prev) => prev ? { ...prev, banner_img: e.target.value } : prev)}
            />
          </label>
          <div className="md:col-span-2 flex justify-end gap-3 mt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={savingCompany}
            >
              {savingCompany ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  const branchesContent = (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Branches</h3>
        <button
          onClick={() => openBranchModal()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" /> Add Branch
        </button>
      </div>
      {branchesLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : branches.length === 0 ? (
        <p className="text-sm text-slate-500">No branches yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.branch_id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{b.branch_name}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{b.location || '—'}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-1 rounded text-xs ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 flex gap-2">
                    <button
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => openBranchModal(b)}
                    >
                      <Pencil className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => deleteBranch(b)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={branchModalOpen} onClose={() => setBranchModalOpen(false)} title={editingBranch ? 'Edit Branch' : 'Add Branch'} size="md">
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={branchForm.branchName}
              onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Location
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={branchForm.location}
              onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              onClick={() => setBranchModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              onClick={saveBranch}
              disabled={branchSaving}
            >
              {branchSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );

  const auditContent = (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
      {auditLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : auditLogs.length === 0 ? (
        <p className="text-sm text-slate-500">No audit logs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.audit_id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{log.action}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.entity || '�'}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.user_id ?? '�'}</td>
                  <td className="py-2 pr-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center mt-4 text-sm text-slate-600">
        <span>
          Page {auditPage} � {auditTotal} total
        </span>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => loadAudit(Math.max(1, auditPage - 1))}
            disabled={auditPage <= 1}
          >
            Prev
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => loadAudit(auditPage + 1)}
            disabled={auditPage * auditLimit >= auditTotal}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  const tabs = useMemo(() => [
    { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
    { id: 'branches', label: 'Branches', icon: Building, content: branchesContent },
    { id: 'audit', label: 'Audit History', icon: History, content: auditContent },
  ], [companyContent, branchesContent, auditContent]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure how your inventory system works for your business."
      />
      <Tabs tabs={tabs} defaultTab="company" />
    </div>
  );
};

export default Settings;

