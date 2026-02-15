import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Home, History, Plus, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { settingsService, CompanyInfo, Branch, AuditLog } from '../../services/settings.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { DataTable } from '../../components/ui/table/DataTable';
import { userService, UserRow, RoleRow } from '../../services/user.service';
import UsersModal from './UsersModal';
import GenerateUsersListModal from './GenerateUsersListModal';
import { useAuth } from '../../context/AuthContext';

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

const Settings = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = useMemo(() => (user?.role_name || '').toLowerCase() === 'admin', [user?.role_name]);

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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const auditLimit = 20;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [generateUserModalOpen, setGenerateUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState<{
    name: string;
    username: string;
    password: string;
    role_id: number | '';
    branch_id: number | '';
    is_active: boolean;
  }>({
    name: '',
    username: '',
    password: '',
    role_id: '',
    branch_id: '',
    is_active: true,
  });

  const filteredUsers = useMemo(
    () => users.filter((row) => row.user_id !== user?.user_id && row.emp_id), // Only show users linked to employees
    [users, user?.user_id]
  );

  const userColumns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      { 
        accessorKey: 'name', 
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-900 dark:text-white">{row.original.name}</div>
            {row.original.emp_name && (
              <div className="text-xs text-slate-500 dark:text-slate-400">Employee: {row.original.emp_name}</div>
            )}
          </div>
        ),
      },
      { accessorKey: 'username', header: 'Username' },
      { accessorKey: 'role_name', header: 'Role' },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive'),
      },
    ],
    []
  );

  const loadCompany = async () => {
    setCompanyLoading(true);
    const res = await settingsService.getCompany();
    setCompanyLoading(false);
    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Failed to load company info');
      return;
    }
    const loaded = res.data.company;
    setCompany(loaded);
    setCompanyForm({
      company_name: loaded.company_name || '',
      phone: loaded.phone || '',
      manager_name: loaded.manager_name || '',
      logo_img: loaded.logo_img || '',
      banner_img: loaded.banner_img || '',
    });
  };

  const loadBranches = async () => {
    const res = await settingsService.listBranches();
    if (res.success && res.data?.branches) {
      setBranches(res.data.branches);
      return;
    }
    showToast('error', 'Branches', res.error || 'Failed to load branches');
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

  const loadUsers = async () => {
    const res = await userService.list();
    if (res.success && res.data?.users) {
      setUsers(res.data.users);
      return;
    }
    showToast('error', 'Users', res.error || 'Failed to load users');
  };

  const loadRoles = async () => {
    const res = await userService.listRoles();
    if (res.success && res.data?.roles) {
      setRoles(res.data.roles);
      return;
    }
    showToast('error', 'Users', res.error || 'Failed to load roles');
  };

  const openCompanyModal = () => setCompanyModalOpen(true);

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

  const openUserModal = (row?: UserRow) => {
    if (!roles.length) void loadRoles();
    if (!branches.length) void loadBranches();
    setEditingUser(row || null);
    setUserForm({
      name: row?.name || '',
      username: row?.username || '',
      password: '',
      role_id: row?.role_id || '',
      branch_id: row?.branch_id || '',
      is_active: row?.is_active ?? true,
    });
    setUserModalOpen(true);
  };

  const saveUser = async (
    formOverride?: {
      name: string;
      username: string;
      password: string;
      role_id: number | '';
      branch_id: number | '';
      is_active: boolean;
    }
  ) => {
    const form = formOverride || userForm;
    if (!form.name || !form.username || !form.role_id || !form.branch_id || (!editingUser && !form.password)) {
      showToast('error', 'Users', 'Fill required fields');
      return;
    }

    const payload = {
      name: form.name,
      username: form.username,
      password: form.password,
      role_id: Number(form.role_id),
      branch_id: Number(form.branch_id),
      is_active: form.is_active,
    };

    const res = editingUser
      ? await userService.update(editingUser.user_id, payload)
      : await userService.create(payload as { password: string } & Partial<UserRow>);

    if (!res.success) {
      showToast('error', 'Users', res.error || 'Save failed');
      return;
    }

    showToast('success', 'Users', editingUser ? 'User updated' : 'User created');
    setUserModalOpen(false);
    setEditingUser(null);
    loadUsers();
  };

  const deleteUserAction = async (target: UserRow) => {
    const res = await userService.remove(target.user_id);
    if (!res.success) {
      showToast('error', 'Users', res.error || 'Delete failed');
      return;
    }
    showToast('success', 'Users', 'User deleted');
    loadUsers();
  };

  const companyContent = (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Company Info</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCompany}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={companyLoading}
          >
            Display
          </button>
          <button
            onClick={openCompanyModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> {company ? 'Edit' : 'Add'} Company
          </button>
        </div>
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
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{company.company_name || '-'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.phone || '-'}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{company.manager_name || '-'}</td>
                <td className="py-2 pr-4 text-slate-500">{company.updated_at ? new Date(company.updated_at).toLocaleString() : '-'}</td>
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
            Phone
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.phone}
              onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
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
            Logo Image URL
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={companyForm.logo_img}
              onChange={(e) => setCompanyForm({ ...companyForm, logo_img: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Banner Image URL
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
            {companySaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>
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
                <th className="py-2 pr-4">Table</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Old Value</th>
                <th className="py-2 pr-4">New Value</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => {
                const { oldText, newText } = getAuditChangedValues(log.old_value, log.new_value);
                return (
                  <tr key={log.audit_id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{log.entity || '-'}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{log.username || log.user_id || '-'}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-100 capitalize">{log.action}</td>
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

  const handleGenerateUserSuccess = () => {
    loadUsers(); // Reload users after generating new ones
  };

  const usersContent = (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
        <p className="font-medium mb-1">👥 Employee-Based User Management</p>
        <p className="text-xs">All system users must be linked to employees. Use "Generate User" to create login accounts for employees.</p>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Showing {filteredUsers.length} employee-linked users
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadUsers();
              loadRoles();
              loadBranches();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
          <button
            onClick={() => setGenerateUserModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 text-sm shadow-sm"
          >
            <Plus size={16} /> Generate User from Employee
          </button>
        </div>
      </div>
      <DataTable
        data={filteredUsers}
        columns={userColumns}
        searchPlaceholder="Search users..."
        onEdit={openUserModal}
        onDelete={(target) => {
          if (target.user_id === user?.user_id) {
            showToast('error', 'Users', 'You cannot modify your own account here.');
            return;
          }
          setUserToDelete(target);
        }}
        showToolbarActions={false}
      />
    </div>
  );

  const tabs = useMemo(
    () => [
      { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
      { id: 'audit', label: 'Audit History', icon: History, content: auditContent },
      ...(isAdmin ? [{ id: 'users', label: 'Users', icon: Users, content: usersContent }] : []),
    ],
    [companyContent, auditContent, usersContent, isAdmin]
  );

  return (
    <div>
      <PageHeader title="Settings" description="Configure how your inventory system works for your business." />
      <Tabs tabs={tabs} defaultTab="company" />

      <UsersModal
        isOpen={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setEditingUser(null);
        }}
        onSave={(form) => {
          setUserForm(form);
          saveUser(form);
        }}
        form={userForm}
        setForm={setUserForm}
        roles={roles}
        branches={branches}
        editing={editingUser}
      />

      <GenerateUsersListModal
        isOpen={generateUserModalOpen}
        onClose={() => setGenerateUserModalOpen(false)}
        onSuccess={handleGenerateUserSuccess}
      />

      <Modal isOpen={!!userToDelete} onClose={() => setUserToDelete(null)} title="Delete User" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Delete user <strong>{userToDelete?.username}</strong>? They will lose access immediately.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
            onClick={() => setUserToDelete(null)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              if (!userToDelete) return;
              deleteUserAction(userToDelete);
              setUserToDelete(null);
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
