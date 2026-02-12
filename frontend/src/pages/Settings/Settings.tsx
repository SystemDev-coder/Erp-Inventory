import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Home, Building, History, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { settingsService, CompanyInfo, Branch, AuditLog } from '../../services/settings.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { DataTable } from '../../components/ui/table/DataTable';
import { userService, UserRow, RoleRow } from '../../services/user.service';
import UsersModal from './UsersModal';
import { useAuth } from '../../context/AuthContext';

const formatAuditValue = (val: any) => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map((v) => formatAuditValue(v)).join(', ');
  if (typeof val === 'object') {
    const parts = Object.entries(val).map(([k, v]) => `${k}: ${formatAuditValue(v)}`);
    return parts.join(', ');
  }
  return String(val);
};

const Settings = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role_name === 'Admin', [user]);

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    phone: '',
    manager_name: '',
    logo_img: '',
    banner_img: '',
  });

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ branchName: '', location: '' });
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const auditLimit = 20;
  const companyRows = company ? [company] : [];

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState<{ name: string; username: string; password: string; role_id: number | ''; branch_id: number | ''; is_active: boolean }>({
    name: '',
    username: '',
    password: '',
    role_id: '',
    branch_id: '',
    is_active: true,
  });
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const filteredUsers = useMemo(() => users.filter((u) => u.user_id !== user?.user_id), [users, user]);

  const companyColumns = useMemo<ColumnDef<CompanyInfo>[]>(
    () => [
      { accessorKey: 'company_name', header: 'Company Name' },
      { accessorKey: 'phone', header: 'Phone' },
      { accessorKey: 'manager_name', header: 'Manager' },
      {
        accessorKey: 'logo_img',
        header: 'Logo',
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          if (!v) return '—';
          const proxied = `/api/media/proxy?url=${encodeURIComponent(v)}`;
          return (
            <div className="flex items-center gap-2">
              <img
                src={proxied}
                alt="Logo"
                className="h-10 w-10 object-contain rounded bg-white shadow-sm border border-slate-200 dark:border-slate-700"
                loading="lazy"
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'banner_img',
        header: 'Banner',
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          if (!v) return '—';
          const proxied = `/api/media/proxy?url=${encodeURIComponent(v)}`;
          return (
            <img
              src={proxied}
              alt="Banner"
              className="h-12 w-28 object-cover rounded bg-white shadow-sm border border-slate-200 dark:border-slate-700"
              loading="lazy"
            />
          );
        },
      },
      {
        accessorKey: 'updated_at',
        header: 'Updated',
        cell: ({ getValue }) => {
          const v = getValue<string | undefined>();
          return v ? new Date(v).toLocaleString() : '�';
        },
      },
    ],
    []
  );

  const loadCompany = async () => {
    setCompanyLoading(true);
    const res = await settingsService.getCompany();
    if (res.success && res.data?.company) {
      const c = res.data.company;
      setCompany(c);
      setCompanyForm({
        company_name: c.company_name || '',
        phone: c.phone || '',
        manager_name: c.manager_name || '',
        logo_img: c.logo_img || '',
        banner_img: c.banner_img || '',
      });
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

  const loadUsers = async () => {
    const res = await userService.list();
    if (res.success && res.data?.users) setUsers(res.data.users);
  };

  const loadRoles = async () => {
    const res = await userService.listRoles();
    if (res.success && res.data?.roles) setRoles(res.data.roles);
  };

  useEffect(() => {
    loadCompany();
    loadBranches();
    loadAudit();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadRoles();
    }
  }, [isAdmin]);

  const openCompanyModal = () => {
    setCompanyModalOpen(true);
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
    if (res.success && res.data?.company) {
      setCompany(res.data.company);
      setCompanyForm({
        company_name: res.data.company.company_name || '',
        phone: res.data.company.phone || '',
        manager_name: res.data.company.manager_name || '',
        logo_img: res.data.company.logo_img || '',
        banner_img: res.data.company.banner_img || '',
      });
      setCompanyModalOpen(false);
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

  const userColumns = useMemo<ColumnDef<UserRow>[]>(() => [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'username', header: 'Username' },
    { accessorKey: 'role_name', header: 'Role' },
    { accessorKey: 'is_active', header: 'Active', cell: ({ row }) => row.original.is_active ? 'Yes' : 'No' },
  ], []);

  const openUserModal = (user?: UserRow) => {
    setEditingUser(user || null);
    setUserForm({
      name: user?.name || '',
      username: user?.username || '',
      password: '',
      role_id: user?.role_id || '',
      branch_id: user?.branch_id || '',
      is_active: user?.is_active ?? true,
    });
    setUserModalOpen(true);
  };

  const saveUser = async (formOverride?: typeof userForm) => {
    const f = formOverride || userForm;
    if (!userForm.name || !userForm.username || (!editingUser && !userForm.password) || !userForm.role_id || !userForm.branch_id) {
      showToast('error', 'Users', 'Fill required fields');
      return;
    }
    const payload = {
      name: f.name,
      username: f.username,
      password: f.password,
      role_id: Number(f.role_id),
      branch_id: Number(f.branch_id),
      is_active: f.is_active,
    };
    const res = editingUser
      ? await userService.update(editingUser.user_id, payload)
      : await userService.create(payload);
    if (res.success && res.data?.user) {
      showToast('success', 'Users', editingUser ? 'User updated' : 'User created');
      setUserModalOpen(false);
      setEditingUser(null);
      loadUsers();
    } else {
      showToast('error', 'Users', res.error || 'Save failed');
    }
  };

  const deleteUserAction = async (u: UserRow) => {
    const res = await userService.remove(u.user_id);
    if (res.success) {
      showToast('success', 'Users', 'User deleted');
      loadUsers();
    } else {
      showToast('error', 'Users', res.error || 'Delete failed');
    }
  };

  const confirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    const res = await settingsService.deleteBranch(branchToDelete.branch_id);
    if (res.success) {
      showToast('success', 'Branches', 'Branch deleted');
      setBranchToDelete(null);
      loadBranches();
    } else {
      showToast('error', 'Branches', res.error || 'Delete failed');
    }
  };

  const companyContent = (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Company Info</h3>
        <button
          onClick={openCompanyModal}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
          disabled={companyLoading}
        >
          <Plus className="w-4 h-4" /> {company ? 'Edit' : 'Add'} Company
        </button>
      </div>
      {companyLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : !company ? (
        <p className="text-sm text-slate-500">No company profile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Manager</th>
                <th className="py-2 pr-4">Logo</th>
                <th className="py-2 pr-4">Banner</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{company.company_name || '�'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.phone || '�'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.manager_name || '�'}</td>
                <td className="py-2 pr-4 text-blue-600 dark:text-blue-400 break-all">{company.logo_img || '�'}</td>
                <td className="py-2 pr-4 text-blue-600 dark:text-blue-400 break-all">{company.banner_img || '�'}</td>
                <td className="py-2 pr-4 text-slate-500">{company.updated_at ? new Date(company.updated_at).toLocaleString() : '�'}</td>
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
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={companyForm.company_name}
              onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Phone
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Manager Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={companyForm.manager_name}
              onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Logo Image URL
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={companyForm.logo_img}
              onChange={(e) => setCompanyForm({ ...companyForm, logo_img: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Banner Image URL
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={companyForm.banner_img}
              onChange={(e) => setCompanyForm({ ...companyForm, banner_img: e.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            onClick={() => setCompanyModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            onClick={handleCompanySave}
            disabled={companySaving}
          >
            {companySaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>
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
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{b.location || '�'}</td>
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
                      onClick={() => setBranchToDelete(b)}
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
      {/** helper for concise display */} 
      {/** placed here to keep file-local scope */} 
      {/** eslint-disable-next-line */} 
      {/**/}
      {auditLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : auditLogs.length === 0 ? (
        <p className="text-sm text-slate-500">No audit logs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Table</th>
                <th className="py-2 pr-4">Record ID</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Old Value</th>
                <th className="py-2 pr-4">New Value</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.audit_id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{log.entity || '—'}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.entity_id ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.username || log.user_id || '—'}</td>
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-100 capitalize">{log.action}</td>
                  <td className="py-2 pr-4 text-slate-500 max-w-xs truncate" title={log.old_value ? JSON.stringify(log.old_value) : ''}>
                    {formatAuditValue(log.old_value)}
                  </td>
                  <td className="py-2 pr-4 text-slate-500 max-w-xs truncate" title={log.new_value ? JSON.stringify(log.new_value) : ''}>
                    {formatAuditValue(log.new_value)}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{log.ip_address || '—'}</td>
                  <td className="py-2 pr-4 text-slate-500 max-w-xs truncate" title={log.user_agent || ''}>
                    {log.user_agent || '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center mt-4 text-sm text-slate-600">
        <span>
          Page {auditPage} ? {auditTotal} total
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

  const usersContent = (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-600 dark:text-slate-300">Manage system users</div>
        <button
          onClick={() => openUserModal()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 text-sm"
        >
          <Plus size={16} /> New User
        </button>
      </div>
      <DataTable
        data={filteredUsers}
        columns={userColumns}
        searchPlaceholder="Search users..."
        onEdit={openUserModal}
        onDelete={(u) => {
          if (u.user_id === user?.user_id) {
            showToast('error', 'Users', 'You cannot modify your own account here.');
            return;
          }
          setUserToDelete(u);
        }}
        showToolbarActions={false}
      />
    </div>
  );

  const tabs = useMemo(() => [
    { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
    { id: 'branches', label: 'Branches', icon: Building, content: branchesContent },
    { id: 'audit', label: 'Audit History', icon: History, content: auditContent },
    ...(isAdmin ? [{ id: 'users', label: 'Users', icon: Users, content: usersContent }] : []),
  ], [companyContent, branchesContent, auditContent, usersContent, isAdmin]);

  const handleTabChange = (tabId: string) => {
    if (tabId === 'audit') loadAudit();
    if (tabId === 'users' && isAdmin) loadUsers();
    if (tabId === 'branches') loadBranches();
    if (tabId === 'company') loadCompany();
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure how your inventory system works for your business."
      />
      <Tabs tabs={tabs} defaultTab="company" onChange={handleTabChange} />

      <UsersModal
        isOpen={userModalOpen}
        onClose={() => { setUserModalOpen(false); setEditingUser(null); }}
        onSave={(f) => { setUserForm(f); saveUser(f); }}
        form={userForm}
        setForm={setUserForm}
        roles={roles}
        branches={branches}
        editing={editingUser}
      />

      <Modal
        isOpen={!!branchToDelete}
        onClose={() => setBranchToDelete(null)}
        title="Delete Branch"
        size="sm"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to delete the branch <strong>{branchToDelete?.branch_name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            onClick={() => setBranchToDelete(null)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
            onClick={confirmDeleteBranch}
          >
            Delete
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Delete User"
        size="sm"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Delete user <strong>{userToDelete?.username}</strong>? They will lose access immediately.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            onClick={() => setUserToDelete(null)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
            onClick={() => { if (userToDelete) { deleteUserAction(userToDelete); setUserToDelete(null); } }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;




