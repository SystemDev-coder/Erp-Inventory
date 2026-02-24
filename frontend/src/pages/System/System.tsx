import { useCallback, useEffect, useState } from 'react';
import { History, Lock, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import {
  systemService,
  SystemAuditLog,
  SystemBranch,
  SystemPermission,
  SystemRole,
  SystemUser,
} from '../../services/system.service';

const LOGS_LIMIT = 20;

const System = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [permissions, setPermissions] = useState<SystemPermission[]>([]);
  const [branches, setBranches] = useState<SystemBranch[]>([]);
  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [usersDisplayed, setUsersDisplayed] = useState(false);
  const [rolesDisplayed, setRolesDisplayed] = useState(false);
  const [permissionsDisplayed, setPermissionsDisplayed] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<SystemRole | null>(null);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [editingPermission, setEditingPermission] = useState<SystemPermission | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    password: '',
    roleId: '',
    branchId: '',
    isActive: true,
  });
  const [roleForm, setRoleForm] = useState({
    roleName: '',
    roleCode: '',
    description: '',
  });
  const [permissionForm, setPermissionForm] = useState({
    permKey: '',
    permName: '',
    module: '',
    subModule: '',
    actionType: '',
    description: '',
  });

  const loadUsers = async () => {
    const res = await systemService.getUsers();
    if (res.success && res.data?.users) {
      setUsers(res.data.users);
      return res.data.users;
    }
    showToast('error', 'Users', res.error || 'Failed to load users');
    return [];
  };

  const loadRoles = async () => {
    const res = await systemService.getRoles();
    if (res.success && res.data?.roles) {
      setRoles(res.data.roles);
      return res.data.roles;
    }
    showToast('error', 'Roles', res.error || 'Failed to load roles');
    return [];
  };

  const loadPermissions = async () => {
    const res = await systemService.getPermissions();
    if (res.success && res.data?.permissions) {
      setPermissions(res.data.permissions);
      return res.data.permissions;
    }
    showToast('error', 'Permissions', res.error || 'Failed to load permissions');
    return [];
  };

  const displayUsers = async () => {
    setLoadingUsers(true);
    await loadUsers();
    setUsersDisplayed(true);
    setLoadingUsers(false);
  };

  const displayRoles = async () => {
    setLoadingRoles(true);
    await loadRoles();
    setRolesDisplayed(true);
    setLoadingRoles(false);
  };

  const displayPermissions = async () => {
    setLoadingPermissions(true);
    await loadPermissions();
    setPermissionsDisplayed(true);
    setLoadingPermissions(false);
  };

  const loadBranches = useCallback(async () => {
    const res = await systemService.getBranches();
    if (res.success && res.data?.branches) {
      setBranches(res.data.branches);
      return res.data.branches;
    }
    showToast('error', 'Branches', res.error || 'Failed to load branches');
    return [];
  }, [showToast]);

  const loadLogs = useCallback(async (page = 1) => {
    const res = await systemService.getLogs(page, LOGS_LIMIT);
    if (res.success && res.data?.logs) {
      setLogs(res.data.logs);
      setLogsPage(res.data.page || page);
      setLogsTotal(res.data.total || 0);
      return;
    }
    showToast('error', 'Activity Logs', res.error || 'Failed to load logs');
  }, [showToast]);

  useEffect(() => {
    void loadBranches();
    void loadLogs(1);
  }, [loadBranches, loadLogs]);

  const openCreateUser = async () => {
    const roleList = roles.length ? roles : await loadRoles();
    const branchList = branches.length ? branches : await loadBranches();
    setEditingUser(null);
    setUserForm({
      name: '',
      username: '',
      password: '',
      roleId: roleList[0] ? String(roleList[0].role_id) : '',
      branchId: branchList[0] ? String(branchList[0].branch_id) : '',
      isActive: true,
    });
    setUserModalOpen(true);
  };

  const openEditUser = async (user: SystemUser) => {
    if (!roles.length) await loadRoles();
    if (!branches.length) await loadBranches();
    setEditingUser(user);
    setUserForm({
      name: user.name,
      username: user.username,
      password: '',
      roleId: String(user.role_id),
      branchId: String(user.branch_id),
      isActive: user.is_active,
    });
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.name.trim() || !userForm.username.trim()) {
      showToast('error', 'Users', 'Name and username are required');
      return;
    }
    if (!editingUser && !userForm.password.trim()) {
      showToast('error', 'Users', 'Password is required');
      return;
    }
    if (!userForm.roleId || !userForm.branchId) {
      showToast('error', 'Users', 'Role and branch are required');
      return;
    }

    const payload = {
      name: userForm.name.trim(),
      username: userForm.username.trim(),
      password: userForm.password.trim(),
      roleId: Number(userForm.roleId),
      branchId: Number(userForm.branchId),
      isActive: userForm.isActive,
    };

    setSavingUser(true);
    const res = editingUser
      ? await systemService.updateUser(editingUser.user_id, {
          name: payload.name,
          username: payload.username,
          password: payload.password || undefined,
          roleId: payload.roleId,
          branchId: payload.branchId,
          isActive: payload.isActive,
        })
      : await systemService.createUser(payload);
    setSavingUser(false);

    if (!res.success) {
      showToast('error', 'Users', res.error || 'Save failed');
      return;
    }
    setUserModalOpen(false);
    showToast('success', 'Users', editingUser ? 'User updated' : 'User created');
    await loadUsers();
  };

  const deleteUser = async (user: SystemUser) => {
    if (!window.confirm(`Delete user "${user.username}"?`)) return;
    const res = await systemService.deleteUser(user.user_id);
    if (!res.success) return showToast('error', 'Users', res.error || 'Delete failed');
    showToast('success', 'Users', 'User deleted');
    await loadUsers();
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      roleName: '',
      roleCode: '',
      description: '',
    });
    setRoleModalOpen(true);
  };

  const openEditRole = (role: SystemRole) => {
    setEditingRole(role);
    setRoleForm({
      roleName: role.role_name || '',
      roleCode: role.role_code || '',
      description: role.description || '',
    });
    setRoleModalOpen(true);
  };

  const saveRole = async () => {
    const roleName = roleForm.roleName.trim();
    if (!roleName) {
      showToast('error', 'Roles', 'Role name is required');
      return;
    }

    const payload = {
      roleName,
      roleCode: roleForm.roleCode.trim() || undefined,
      description: roleForm.description.trim() || undefined,
    };

    setSavingRole(true);
    const res = editingRole
      ? await systemService.updateRole(editingRole.role_id, payload)
      : await systemService.createRole(payload);
    setSavingRole(false);

    if (!res.success) return showToast('error', 'Roles', res.error || 'Save failed');
    setRoleModalOpen(false);
    showToast('success', 'Roles', editingRole ? 'Role updated' : 'Role created');
    await loadRoles();
  };

  const deleteRole = async (role: SystemRole) => {
    if (!window.confirm(`Delete role "${role.role_name}"?`)) return;
    const res = await systemService.deleteRole(role.role_id);
    if (!res.success) return showToast('error', 'Roles', res.error || 'Delete failed');
    showToast('success', 'Roles', 'Role deleted');
    await loadRoles();
  };

  const openCreatePermission = () => {
    setEditingPermission(null);
    setPermissionForm({
      permKey: '',
      permName: '',
      module: '',
      subModule: '',
      actionType: '',
      description: '',
    });
    setPermissionModalOpen(true);
  };

  const openEditPermission = (permission: SystemPermission) => {
    setEditingPermission(permission);
    setPermissionForm({
      permKey: permission.perm_key || '',
      permName: permission.perm_name || '',
      module: permission.module || '',
      subModule: permission.sub_module || '',
      actionType: permission.action_type || '',
      description: permission.description || '',
    });
    setPermissionModalOpen(true);
  };

  const savePermission = async () => {
    const permKey = permissionForm.permKey.trim();
    const permName = permissionForm.permName.trim();
    const module = permissionForm.module.trim();
    if (!permKey || !permName || !module) {
      showToast('error', 'Permissions', 'Permission key, name, and module are required');
      return;
    }

    const payload = {
      permKey,
      permName,
      module,
      subModule: permissionForm.subModule.trim() || undefined,
      actionType: permissionForm.actionType.trim() || undefined,
      description: permissionForm.description.trim() || undefined,
    };

    setSavingPermission(true);
    const res = editingPermission
      ? await systemService.updatePermission(editingPermission.perm_id, payload)
      : await systemService.createPermission(payload);
    setSavingPermission(false);

    if (!res.success) return showToast('error', 'Permissions', res.error || 'Save failed');
    setPermissionModalOpen(false);
    showToast('success', 'Permissions', editingPermission ? 'Permission updated' : 'Permission created');
    await loadPermissions();
  };

  const deletePermission = async (permission: SystemPermission) => {
    if (!window.confirm(`Delete permission "${permission.perm_key}"?`)) return;
    const res = await systemService.deletePermission(permission.perm_id);
    if (!res.success) return showToast('error', 'Permissions', res.error || 'Delete failed');
    showToast('success', 'Permissions', 'Permission deleted');
    await loadPermissions();
  };

  const deleteLog = async (log: SystemAuditLog) => {
    if (!window.confirm('Delete this log?')) return;
    const res = await systemService.deleteLog(log.audit_id);
    if (!res.success) return showToast('error', 'Activity Logs', res.error || 'Delete failed');
    showToast('success', 'Activity Logs', 'Log deleted');
    await loadLogs(logsPage);
  };

  const clearLogs = async () => {
    if (!window.confirm('Clear all logs?')) return;
    const res = await systemService.clearLogs();
    if (!res.success) return showToast('error', 'Activity Logs', res.error || 'Clear failed');
    showToast('success', 'Activity Logs', 'Logs cleared');
    await loadLogs(1);
  };

  const tabs = [
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      badge: users.length,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={displayUsers} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm" disabled={loadingUsers}>
              {loadingUsers ? 'Loading...' : usersDisplayed ? 'Refresh Users' : 'Display Users'}
            </button>
            <button onClick={openCreateUser} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add User</button>
          </div>
          {usersDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {users.map((u) => <tr key={u.user_id} className="border-t border-slate-200 dark:border-slate-800"><td>{u.name}</td><td>{u.username}</td><td>{u.role_name || '-'}</td><td>{u.branch_name || u.branch_id}</td><td>{u.is_active ? 'Active' : 'Inactive'}</td><td className="space-x-2 py-2"><button onClick={() => openEditUser(u)} className="px-2 py-1 border rounded"><Pencil className="w-3 h-3 inline" /></button><button onClick={() => deleteUser(u)} className="px-2 py-1 border border-rose-300 text-rose-700 rounded"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
              </tbody></table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Click <span className="font-semibold">Display Users</span> to load users data.
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'roles',
      label: 'Roles',
      icon: Shield,
      badge: roles.length,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={displayRoles} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm" disabled={loadingRoles}>
              {loadingRoles ? 'Loading...' : rolesDisplayed ? 'Refresh Roles' : 'Display Roles'}
            </button>
            <button onClick={openCreateRole} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add Role</button>
          </div>
          {rolesDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Code</th><th>Name</th><th>Description</th><th>Permissions</th><th>Actions</th></tr></thead><tbody>
                {roles.map((r) => <tr key={r.role_id} className="border-t border-slate-200 dark:border-slate-800"><td className="font-mono text-xs">{r.role_code}</td><td>{r.role_name}</td><td>{r.description || '-'}</td><td>{r.permission_count}</td><td className="space-x-2 py-2"><button onClick={() => openEditRole(r)} className="px-2 py-1 border rounded"><Pencil className="w-3 h-3 inline" /></button><button onClick={() => deleteRole(r)} className="px-2 py-1 border border-rose-300 text-rose-700 rounded"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
              </tbody></table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Click <span className="font-semibold">Display Roles</span> to load roles data.
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: Lock,
      badge: permissions.length,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={displayPermissions} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm" disabled={loadingPermissions}>
              {loadingPermissions ? 'Loading...' : permissionsDisplayed ? 'Refresh Permissions' : 'Display Permissions'}
            </button>
            <button onClick={openCreatePermission} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add Permission</button>
          </div>
          {permissionsDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Key</th><th>Name</th><th>Module</th><th>Action</th><th>Actions</th></tr></thead><tbody>
                {permissions.map((p) => <tr key={p.perm_id} className="border-t border-slate-200 dark:border-slate-800"><td className="font-mono text-xs">{p.perm_key}</td><td>{p.perm_name}</td><td>{p.module}{p.sub_module ? ` / ${p.sub_module}` : ''}</td><td>{p.action_type || '-'}</td><td className="space-x-2 py-2"><button onClick={() => openEditPermission(p)} className="px-2 py-1 border rounded"><Pencil className="w-3 h-3 inline" /></button><button onClick={() => deletePermission(p)} className="px-2 py-1 border border-rose-300 text-rose-700 rounded"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
              </tbody></table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Click <span className="font-semibold">Display Permissions</span> to load permissions data.
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'logs',
      label: 'Activity Logs',
      icon: History,
      badge: logsTotal,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => loadLogs(1)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Refresh</button>
            <button onClick={clearLogs} className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700 text-sm">Clear All</button>
          </div>
          <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
            <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Action</th><th>Entity</th><th>User</th><th>Date</th><th>Actions</th></tr></thead><tbody>
              {logs.map((l) => <tr key={l.audit_id} className="border-t border-slate-200 dark:border-slate-800"><td>{l.action}</td><td>{l.entity || '-'}</td><td>{l.username || l.user_id || '-'}</td><td>{new Date(l.created_at).toLocaleString()}</td><td className="py-2"><button onClick={() => deleteLog(l)} className="px-2 py-1 border border-rose-300 text-rose-700 rounded"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
            </tbody></table>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>Page {logsPage} of {Math.max(1, Math.ceil(logsTotal / LOGS_LIMIT))}</span>
            <div className="space-x-2">
              <button onClick={() => loadLogs(Math.max(1, logsPage - 1))} disabled={logsPage <= 1} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
              <button onClick={() => loadLogs(logsPage + 1)} disabled={logsPage * LOGS_LIMIT >= logsTotal} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="System & Security" description="CRUD for users, roles, permissions, and logs." />
      <Tabs tabs={tabs} defaultTab="users" />

      <Modal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Name
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Username
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Password {editingUser ? '(Optional)' : ''}
            <input
              type="password"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Role
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.roleId}
              onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
            >
              <option value="">Select role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Branch
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.branchId}
              onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })}
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mt-7">
            <input
              type="checkbox"
              checked={userForm.isActive}
              onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setUserModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            onClick={saveUser}
            disabled={savingUser}
          >
            {savingUser ? 'Saving...' : editingUser ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={editingRole ? 'Edit Role' : 'Add Role'}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Role Name
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleForm.roleName}
              onChange={(e) => setRoleForm({ ...roleForm, roleName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Role Code
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
              value={roleForm.roleCode}
              onChange={(e) => setRoleForm({ ...roleForm, roleCode: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Description
            <textarea
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              rows={3}
              value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setRoleModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            onClick={saveRole}
            disabled={savingRole}
          >
            {savingRole ? 'Saving...' : editingRole ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={permissionModalOpen}
        onClose={() => setPermissionModalOpen(false)}
        title={editingPermission ? 'Edit Permission' : 'Add Permission'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Permission Key
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.permKey}
              onChange={(e) => setPermissionForm({ ...permissionForm, permKey: e.target.value })}
              placeholder="example: users.view"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Permission Name
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.permName}
              onChange={(e) => setPermissionForm({ ...permissionForm, permName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Module
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.module}
              onChange={(e) => setPermissionForm({ ...permissionForm, module: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Sub Module
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.subModule}
              onChange={(e) => setPermissionForm({ ...permissionForm, subModule: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Action Type
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.actionType}
              onChange={(e) => setPermissionForm({ ...permissionForm, actionType: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Description
            <textarea
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              rows={3}
              value={permissionForm.description}
              onChange={(e) => setPermissionForm({ ...permissionForm, description: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => setPermissionModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            onClick={savePermission}
            disabled={savingPermission}
          >
            {savingPermission ? 'Saving...' : editingPermission ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default System;
