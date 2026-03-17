import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import {
  systemService,
  SystemBranch,
  SystemPermission,
  SystemRole,
  SystemUser,
} from '../../services/system.service';

const SHOW_PERMISSION_TAB = false;
type ConfirmTarget =
  | { type: 'user'; payload: SystemUser }
  | { type: 'role'; payload: SystemRole }
  | { type: 'permission'; payload: SystemPermission };

const System = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [permissions, setPermissions] = useState<SystemPermission[]>([]);
  const [branches, setBranches] = useState<SystemBranch[]>([]);
  const [usersDisplayed, setUsersDisplayed] = useState(false);
  const [rolesDisplayed, setRolesDisplayed] = useState(false);
  const [permissionsDisplayed, setPermissionsDisplayed] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
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
    monthlySalary: '0',
  });
  const [permissionForm, setPermissionForm] = useState({
    permKey: '',
    permName: '',
    module: '',
    subModule: '',
    actionType: '',
    description: '',
  });
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

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


  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

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

  const requestDeleteUser = (user: SystemUser) => setConfirmTarget({ type: 'user', payload: user });

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      roleName: '',
      roleCode: '',
      description: '',
      monthlySalary: '0',
    });
    setRoleModalOpen(true);
  };

  const openEditRole = (role: SystemRole) => {
    setEditingRole(role);
    setRoleForm({
      roleName: role.role_name || '',
      roleCode: role.role_code || '',
      description: role.description || '',
      monthlySalary: String(role.monthly_salary ?? 0),
    });
    setRoleModalOpen(true);
  };

  const saveRole = async () => {
    const roleName = roleForm.roleName.trim();
    if (!roleName) {
      showToast('error', 'Roles', 'Role name is required');
      return;
    }
    const monthlySalary = Number(roleForm.monthlySalary || 0);
    if (Number.isNaN(monthlySalary) || monthlySalary < 0) {
      showToast('error', 'Roles', 'Monthly salary must be zero or positive');
      return;
    }

    const payload = {
      roleName,
      roleCode: roleForm.roleCode.trim() || undefined,
      description: roleForm.description.trim() || undefined,
      monthlySalary,
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

  const requestDeleteRole = (role: SystemRole) => setConfirmTarget({ type: 'role', payload: role });

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

  const requestDeletePermission = (permission: SystemPermission) =>
    setConfirmTarget({ type: 'permission', payload: permission });


  const confirmAction = async () => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    if (confirmTarget.type === 'user') {
      const res = await systemService.deleteUser(confirmTarget.payload.user_id);
      if (!res.success) {
        showToast('error', 'Users', res.error || 'Delete failed');
      } else {
        showToast('success', 'Users', 'User deleted');
        await loadUsers();
      }
    } else if (confirmTarget.type === 'role') {
      const res = await systemService.deleteRole(confirmTarget.payload.role_id);
      if (!res.success) {
        showToast('error', 'Roles', res.error || 'Delete failed');
      } else {
        showToast('success', 'Roles', 'Role deleted');
        await loadRoles();
      }
    } else if (confirmTarget.type === 'permission') {
      const res = await systemService.deletePermission(confirmTarget.payload.perm_id);
      if (!res.success) {
        showToast('error', 'Permissions', res.error || 'Delete failed');
      } else {
        showToast('success', 'Permissions', 'Permission deleted');
        await loadPermissions();
      }
    }
    setConfirmLoading(false);
    setConfirmTarget(null);
  };

  const confirmTitle = (() => {
    if (!confirmTarget) return '';
    if (confirmTarget.type === 'user') return 'Delete User?';
    if (confirmTarget.type === 'role') return 'Delete Role?';
    if (confirmTarget.type === 'permission') return 'Delete Permission?';
    return '';
  })();

  const confirmMessage = (() => {
    if (!confirmTarget) return '';
    if (confirmTarget.type === 'user') return 'This user account and related assignments may stop working.';
    if (confirmTarget.type === 'role') return 'Users mapped to this role may lose access.';
    if (confirmTarget.type === 'permission') return 'This permission will be removed from role mappings.';
    return '';
  })();

  const confirmHighlightedName = (() => {
    if (!confirmTarget) return undefined;
    if (confirmTarget.type === 'user') return confirmTarget.payload.username;
    if (confirmTarget.type === 'role') return confirmTarget.payload.role_name || String(confirmTarget.payload.role_id);
    if (confirmTarget.type === 'permission') return confirmTarget.payload.perm_key;
    return undefined;
  })();

  const tabs = [
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      badge: users.length,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={displayUsers} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" disabled={loadingUsers}>
              {loadingUsers ? 'Loading...' : 'Display Users'}
            </button>
            <button onClick={openCreateUser} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add User</button>
          </div>
          {usersDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500 dark:text-slate-300"><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {users.map((u) => <tr key={u.user_id} className="border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"><td>{u.name}</td><td>{u.username}</td><td>{u.role_name || '-'}</td><td>{u.branch_name || u.branch_id}</td><td>{u.is_active ? 'Active' : 'Inactive'}</td><td className="space-x-2 py-2"><button onClick={() => openEditUser(u)} className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"><Pencil className="w-3 h-3 inline" /></button><button onClick={() => requestDeleteUser(u)} className="px-2 py-1 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
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
            <button onClick={displayRoles} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" disabled={loadingRoles}>
              {loadingRoles ? 'Loading...' : 'Display Roles'}
            </button>
            <button onClick={openCreateRole} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add Role</button>
          </div>
          {rolesDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-300">
                    <th>Code</th>
                    <th>Name</th>
                    <th>Monthly Salary</th>
                    <th>Description</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.role_id} className="border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                      <td className="font-mono text-xs">{r.role_code}</td>
                      <td>{r.role_name}</td>
                      <td>${Number(r.monthly_salary || 0).toFixed(2)}</td>
                      <td>{r.description || '-'}</td>
                      <td>{r.permission_count}</td>
                      <td className="space-x-2 py-2">
                        <button onClick={() => openEditRole(r)} className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"><Pencil className="w-3 h-3 inline" /></button>
                        <button onClick={() => requestDeleteRole(r)} className="px-2 py-1 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="w-3 h-3 inline" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Click <span className="font-semibold">Display Roles</span> to load roles data.
            </div>
          )}
        </div>
      ),
    },
    ...(SHOW_PERMISSION_TAB
      ? [
          {
            id: 'permissions',
            label: 'Permissions',
            icon: Lock,
            badge: permissions.length,
            content: (
              <div className="space-y-3">
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={displayPermissions} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" disabled={loadingPermissions}>
                    {loadingPermissions ? 'Loading...' : 'Display Permissions'}
                  </button>
                  <button onClick={openCreatePermission} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add Permission</button>
                </div>
                {permissionsDisplayed ? (
                  <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
                    <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500 dark:text-slate-300"><th>Key</th><th>Name</th><th>Module</th><th>Action</th><th>Actions</th></tr></thead><tbody>
                      {permissions.map((p) => <tr key={p.perm_id} className="border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"><td className="font-mono text-xs">{p.perm_key}</td><td>{p.perm_name}</td><td>{p.module}{p.sub_module ? ` / ${p.sub_module}` : ''}</td><td>{p.action_type || '-'}</td><td className="space-x-2 py-2"><button onClick={() => openEditPermission(p)} className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"><Pencil className="w-3 h-3 inline" /></button><button onClick={() => requestDeletePermission(p)} className="px-2 py-1 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="w-3 h-3 inline" /></button></td></tr>)}
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
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title="System & Security" description="CRUD for users, roles, and logs." />
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
            Monthly Salary
            <input
              type="number"
              min="0"
              step="0.01"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleForm.monthlySalary}
              onChange={(e) => setRoleForm({ ...roleForm, monthlySalary: e.target.value })}
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

      <ConfirmDialog
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmAction}
        title={confirmTitle}
        highlightedName={confirmHighlightedName}
        message={confirmMessage}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={confirmLoading}
      />
    </div>
  );
};

export default System;
