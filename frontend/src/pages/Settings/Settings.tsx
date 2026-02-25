import { useMemo, useState } from 'react';
import { History, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { settingsService, CompanyInfo, AuditLog } from '../../services/settings.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { env } from '../../config/env';

const formatAuditValue = (val: unknown): string => {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (Array.isArray(val)) {
    return val.map((entry) => formatAuditValue(entry)).join(', ');
  }
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${formatAuditValue(value)}`)
      .join(', ');
  }
  return String(val);
};

const getAuditChangedValues = (oldVal: unknown, newVal: unknown): { oldText: string; newText: string } => {
  if ((oldVal === null || oldVal === undefined) && (newVal === null || newVal === undefined)) {
    return { oldText: '-', newText: '-' };
  }

  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const keys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
    const changed = keys.filter((key) => JSON.stringify(oldVal[key]) !== JSON.stringify(newVal[key]));

    if (!changed.length) {
      return { oldText: '-', newText: '-' };
    }

    return {
      oldText: changed.map((key) => `${key}: ${formatAuditValue(oldVal[key])}`).join(', '),
      newText: changed.map((key) => `${key}: ${formatAuditValue(newVal[key])}`).join(', '),
    };
  }

  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
    return { oldText: '-', newText: '-' };
  }

  return {
    oldText: formatAuditValue(oldVal),
    newText: formatAuditValue(newVal),
  };
};

const getDeviceLabel = (userAgent?: string | null): string => {
  if (!userAgent) return '-';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('android') || ua.includes('mobile') || ua.includes('ipad')) {
    return 'Mobile';
  }
  return 'Laptop/Desktop';
};

const getAuditTableName = (log: AuditLog): string => {
  const fromMeta =
    log.meta && typeof log.meta === 'object' && 'source' in (log.meta as Record<string, unknown>)
      ? String((log.meta as Record<string, unknown>).source || '')
      : '';
  return (log.entity || fromMeta || '-').toString();
};

const getAuditActionName = (log: AuditLog): string => {
  return (log.action || '-').toString();
};

const resolveImagePath = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  if (value.startsWith('/')) return `${env.API_URL}${value}`;
  return `${env.API_URL}/${value}`;
};

const buildProxyUrl = (url: string): string =>
  `${env.API_URL}/api/media/proxy?url=${encodeURIComponent(url)}`;

const emptyCompanyForm = {
  company_name: '',
  phone: '',
  manager_name: '',
  logo_img: '',
  banner_img: '',
};

const getImageCandidates = (value?: string | null): string[] => {
  const resolved = resolveImagePath(value);
  if (!resolved) return [];

  const candidates = [resolved];
  if (resolved.includes('/image/fetch/')) {
    candidates.push(resolved.split('?')[0]);
  }
  if (resolved.includes('res.cloudinary.com')) {
    candidates.push(buildProxyUrl(resolved));
    const noQuery = resolved.split('?')[0];
    if (noQuery !== resolved) candidates.push(buildProxyUrl(noQuery));
  }

  return Array.from(new Set(candidates));
};

const CompanyImageCell = ({
  value,
  alt,
  className,
}: {
  value?: string | null;
  alt: string;
  className: string;
}) => {
  const candidates = useMemo(() => getImageCandidates(value), [value]);
  const [index, setIndex] = useState(0);

  if (candidates.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  if (index >= candidates.length) {
    return (
      <a
        href={candidates[0]}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary-600 underline"
      >
        Open image
      </a>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt={alt}
      className={className}
      onError={() => setIndex((prev) => prev + 1)}
    />
  );
};

const Settings = () => {
  const { showToast } = useToast();

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyDisplayed, setCompanyDisplayed] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [companyDeleteConfirmOpen, setCompanyDeleteConfirmOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const auditLimit = 20;

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
      !!loaded.banner_img?.trim();
    setCompany(hasValues ? loaded : null);
    setCompanyForm({
      company_name: loaded.company_name || '',
      phone: loaded.phone || '',
      manager_name: loaded.manager_name || '',
      logo_img: loaded.logo_img || '',
      banner_img: loaded.banner_img || '',
    });
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
      });
    } else {
      setCompanyForm(emptyCompanyForm);
    }
    setCompanyModalOpen(true);
  };

  const requestCompanyDelete = () => {
    if (!company) return;
    setCompanyDeleteConfirmOpen(true);
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
    setCompanyModalOpen(false);
    setCompanyDeleteConfirmOpen(false);
    showToast('success', 'Company Info', 'Deleted');
  };

  const loadAudit = async (page = 1) => {
    setAuditLoading(true);
    const res = await settingsService.listAudit(page, auditLimit);
    setAuditLoading(false);
    if (!res.success || !res.data?.logs) {
      showToast('error', 'Audit History', res.error || 'Failed to load audit history');
      return;
    }
    setAuditLogs(res.data.logs);
    setAuditPage(res.data.page || page);
    setAuditTotal(res.data.total || 0);
  };

  const handleCompanySave = async () => {
    setCompanySaving(true);
    const res = await settingsService.updateCompany({
      company_name: companyForm.company_name,
      phone: companyForm.phone,
      manager_name: companyForm.manager_name,
      logo_img: companyForm.logo_img,
      banner_img: companyForm.banner_img,
    });
    setCompanySaving(false);

    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Save failed');
      return;
    }

    const saved = res.data.company;
    setCompany(saved);
    setCompanyForm({
      company_name: saved.company_name || '',
      phone: saved.phone || '',
      manager_name: saved.manager_name || '',
      logo_img: saved.logo_img || '',
      banner_img: saved.banner_img || '',
    });
    setCompanyModalOpen(false);
    showToast('success', 'Company Info', 'Saved');
  };

  const companyContent = (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Company Info</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDisplayCompany}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={companyLoading}
          >
            Display
          </button>
          <button
            onClick={handleCompanyEdit}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> {company ? 'Edit' : 'Add'} Company
          </button>
        </div>
      </div>

      {!companyDisplayed ? (
        <p className="text-sm text-slate-500">Click Display to load company info.</p>
      ) : companyLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : !company ? (
        <p className="text-sm text-slate-500">No company profile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Manager</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Logo</th>
                <th className="py-2 pr-4">Banner</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{company.company_name || '-'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.manager_name || '-'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.phone || '-'}</td>
                <td className="py-2 pr-4">
                  <CompanyImageCell
                    value={company.logo_img}
                    alt="Company logo"
                    className="w-12 h-12 rounded-md object-cover border border-slate-200"
                  />
                </td>
                <td className="py-2 pr-4">
                  <CompanyImageCell
                    value={company.banner_img}
                    alt="Company banner"
                    className="w-24 h-12 rounded-md object-cover border border-slate-200"
                  />
                </td>
                <td className="py-2 pr-4 text-slate-500">{company.updated_at ? new Date(company.updated_at).toLocaleString() : '-'}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCompanyEdit}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={requestCompanyDelete}
                      disabled={companyDeleting}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {companyDeleting ? 'Deleting...' : 'Delete'}
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
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Company Name
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.company_name}
              onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Manager Name
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.manager_name}
              onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Phone
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Logo Path / URL
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.logo_img}
              onChange={(e) => setCompanyForm({ ...companyForm, logo_img: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Banner Path / URL
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.banner_img}
              onChange={(e) => setCompanyForm({ ...companyForm, banner_img: e.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setCompanyModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            onClick={handleCompanySave}
            disabled={companySaving}
          >
            {companySaving ? (company ? 'Updating...' : 'Saving...') : (company ? 'Update' : 'Save')}
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

  const auditContent = (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Audit History</h3>
        <button
          onClick={() => loadAudit(1)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          disabled={auditLoading}
        >
          Display
        </button>
      </div>

      {auditLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : auditLogs.length === 0 ? (
        <p className="text-sm text-slate-500">No audit logs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Table Name</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Old Value</th>
                <th className="py-2 pr-4">New Value</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => {
                const { oldText, newText } = getAuditChangedValues(log.old_value, log.new_value);
                const tableName = getAuditTableName(log);
                const actionName = getAuditActionName(log);
                return (
                  <tr key={log.audit_id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{tableName}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {actionName}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.username || log.user_id || '-'}</td>
                    <td className="py-2 pr-4 text-slate-500 max-w-xs truncate" title={log.old_value ? JSON.stringify(log.old_value) : ''}>{oldText}</td>
                    <td className="py-2 pr-4 text-slate-500 max-w-xs truncate" title={log.new_value ? JSON.stringify(log.new_value) : ''}>{newText}</td>
                    <td className="py-2 pr-4 text-slate-500">{getDeviceLabel(log.user_agent)}</td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-4 text-sm text-slate-600">
        <span>Page {auditPage} of {Math.max(1, Math.ceil(auditTotal / auditLimit))}</span>
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

  const tabs = useMemo(
    () => [
      { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
      { id: 'audit', label: 'Audit History', icon: History, content: auditContent },
    ],
    [companyContent, auditContent]
  );

  return (
    <div>
      <PageHeader title="Settings" description="Configure company profile and review audit history." />
      <Tabs tabs={tabs} defaultTab="company" />
    </div>
  );
};

export default Settings;
