import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { CheckSquare, Home, Lock, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';
import { SIDEBAR_PERMISSION_KEY_SET } from '../../config/sidebarPermissionKeys';
import {
  systemService,
  SystemBranch,
  SystemPermission,
  SystemRole,
  SystemUser,
} from '../../services/system.service';
import { settingsService, CompanyInfo } from '../../services/settings.service';
import { ImageUpload } from '../../components/common/ImageUpload';
import { imageService } from '../../services/image.service';
import { env } from '../../config/env';

const SHOW_PERMISSION_TAB = false;
const HIDDEN_USERNAMES = new Set(['isfahan']);

const emptyCompanyForm = {
  company_name: '',
  phone: '',
  manager_name: '',
  logo_img: '',
  banner_img: '',
  capital_amount: '0',
};

const formatMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// NEW: Lazy-load the privileges editor so it can't affect initial app load/hosting stability
const RolePrivilegesTab = lazy(() =>
  import('./RolePrivilegesTab').then((m) => ({ default: m.RolePrivilegesTab }))
);
// NEW: Lazy-load user privileges editor
const UserPrivilegesTab = lazy(() =>
  import('./UserPrivilegesTab').then((m) => ({ default: m.UserPrivilegesTab }))
);
type ConfirmTarget =
  | { type: 'user'; payload: SystemUser }
  | { type: 'role'; payload: SystemRole }
  | { type: 'permission'; payload: SystemPermission };

const System = () => {
  const { showToast } = useToast();
  const { permissions: currentPermissions } = useAuth();
  const allowRemoteImageUpload = true;
  const logoStorageKey = 'erp.company.logo_img';
  const bannerStorageKey = 'erp.company.banner_img';

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyDisplayed, setCompanyDisplayed] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [companyDeleteConfirmOpen, setCompanyDeleteConfirmOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const saveLocalImage = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to save image in localStorage:', error);
    }
  };

  const clearLocalImage = (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear image from localStorage:', error);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!allowRemoteImageUpload) {
      const dataUrl = await readFileAsDataUrl(file);
      setCompanyForm((prev) => ({ ...prev, logo_img: dataUrl }));
      saveLocalImage(logoStorageKey, dataUrl);
      return dataUrl;
    }
    const res = await imageService.uploadSystemLogo(file);
    if (!res.success) {
      throw new Error(res.error || 'Failed to upload logo');
    }
    const payload: any = res.data || {};
    const logoUrl =
      payload.logoUrl ||
      payload.logo_url ||
      payload.systemInfo?.logo_url ||
      payload.systemInfo?.logoUrl ||
      '';
    if (!logoUrl) {
      throw new Error('Logo upload did not return a URL');
    }
    saveLocalImage(logoStorageKey, logoUrl);
    setCompanyForm((prev) => ({ ...prev, logo_img: logoUrl }));
    return logoUrl;
  };

  const handleBannerUpload = async (file: File) => {
    if (!allowRemoteImageUpload) {
      const dataUrl = await readFileAsDataUrl(file);
      setCompanyForm((prev) => ({ ...prev, banner_img: dataUrl }));
      saveLocalImage(bannerStorageKey, dataUrl);
      return dataUrl;
    }
    const res = await imageService.uploadSystemBanner(file);
    if (!res.success) {
      throw new Error(res.error || 'Failed to upload banner');
    }
    const payload: any = res.data || {};
    const bannerUrl =
      payload.bannerImageUrl ||
      payload.banner_image_url ||
      payload.systemInfo?.banner_image_url ||
      payload.systemInfo?.bannerImageUrl ||
      '';
    if (!bannerUrl) {
      throw new Error('Banner upload did not return a URL');
    }
    saveLocalImage(bannerStorageKey, bannerUrl);
    setCompanyForm((prev) => ({ ...prev, banner_img: bannerUrl }));
    return bannerUrl;
  };

  const handleLogoDelete = async (reason: string) => {
    if (!allowRemoteImageUpload) {
      setCompanyForm((prev) => ({ ...prev, logo_img: '' }));
      clearLocalImage(logoStorageKey);
      return;
    }
    const res = await imageService.deleteSystemLogo(reason);
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete logo');
    }
    setCompanyForm((prev) => ({ ...prev, logo_img: '' }));
    clearLocalImage(logoStorageKey);
  };

  const handleBannerDelete = async (reason: string) => {
    if (!allowRemoteImageUpload) {
      setCompanyForm((prev) => ({ ...prev, banner_img: '' }));
      clearLocalImage(bannerStorageKey);
      return;
    }
    const res = await imageService.deleteSystemBanner(reason);
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete banner');
    }
    setCompanyForm((prev) => ({ ...prev, banner_img: '' }));
    clearLocalImage(bannerStorageKey);
  };

  const resolveImageUrl = (value?: string | null) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^data:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/images/') || raw === '/favicon.png') return raw;
    if (raw.startsWith('uploads/')) return `${env.API_URL}/${raw}`;
    if (raw.startsWith('/')) return `${env.API_URL}${raw}`;
    return raw;
  };

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
    const fallbackLogo =
      loaded.logo_img || window.localStorage.getItem(logoStorageKey) || '';
    const fallbackBanner =
      loaded.banner_img || window.localStorage.getItem(bannerStorageKey) || '';
    setCompanyForm({
      company_name: loaded.company_name || '',
      phone: loaded.phone || '',
      manager_name: loaded.manager_name || '',
      logo_img: fallbackLogo,
      banner_img: fallbackBanner,
      capital_amount: String(loaded.capital_amount ?? 0),
    });
    if (fallbackLogo) saveLocalImage(logoStorageKey, fallbackLogo);
    if (fallbackBanner) saveLocalImage(bannerStorageKey, fallbackBanner);
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
    const normalizeImageValue = (value: string) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('data:') || trimmed.length > 2048) {
        return '';
      }
      return trimmed;
    };
    const safeLogo = normalizeImageValue(companyForm.logo_img);
    const safeBanner = normalizeImageValue(companyForm.banner_img);
    setCompanySaving(true);
    const res = await settingsService.updateCompany({
      company_name: companyForm.company_name,
      phone: companyForm.phone,
      manager_name: companyForm.manager_name,
      logo_img: safeLogo,
      banner_img: safeBanner,
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

  const handleCompanyDelete = async (reason: string) => {
    if (!company) return;
    setCompanyDeleting(true);
    const res = await settingsService.deleteCompany(reason);
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

  const [activeTabId, setActiveTabId] = useState('company');
  const [tabsKey, setTabsKey] = useState(0);
  const [privilegesPrefillRoleId, setPrivilegesPrefillRoleId] = useState<number | null>(null);
  const [privilegesPrefillUserId, setPrivilegesPrefillUserId] = useState<number | null>(null);
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
    branchIds: [] as number[],
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
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // NEW: Permission checks for System UI (match sidebar behavior)
  const hasAnyPerm = useCallback(
    (required?: string[]) => {
      if (!required || required.length === 0) return true;
      const set = new Set(currentPermissions);
      return required.some((perm) => set.has(perm));
    },
    [currentPermissions]
  );

  // NEW: Gate actions/tabs by permissions
  const canViewUsers = hasAnyPerm(['system.users.manage', 'users.view']);
  const canCreateUsers = hasAnyPerm(['system.users.manage', 'users.create']);
  const canUpdateUsers = hasAnyPerm(['system.users.manage', 'users.update']);
  const canDeleteUsers = hasAnyPerm(['system.users.manage', 'users.delete']);

  const canViewRoles = hasAnyPerm(['system.roles.manage', 'roles.view']);
  const canCreateRoles = hasAnyPerm(['system.roles.manage', 'roles.create']);
  const canUpdateRoles = hasAnyPerm(['system.roles.manage', 'roles.update']);
  const canDeleteRoles = hasAnyPerm(['system.roles.manage', 'roles.delete']);

  const canViewPrivileges = canViewRoles && hasAnyPerm(['system.permissions.manage', 'permissions.view']);
  const canUpdateRolePermissions = hasAnyPerm(['system.roles.manage', 'roles.update']);
  const canUpdateUserPrivileges = hasAnyPerm(['system.permissions.manage', 'users.update', 'system.users.manage']);

  // NEW: Programmatic tab switch helper (Tabs is uncontrolled)
  const goToTab = (tabId: string) => {
    setActiveTabId(tabId);
    setTabsKey((k) => k + 1);
  };

  const loadUsers = async () => {
    const res = await systemService.getUsers();
    if (res.success && res.data?.users) {
      const nextUsers = res.data.users.filter(
        (u) => !HIDDEN_USERNAMES.has(String(u.username || '').trim().toLowerCase())
      );
      setUsers(nextUsers);
      return nextUsers;
    }
    showToast('error', 'Users', res.error || 'Failed to load users');
    return [];
  };

  const filteredUsers = users;

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
      branchIds: branchList[0] ? [branchList[0].branch_id] : [],
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
      branchIds: user.branch_ids && user.branch_ids.length ? user.branch_ids : [user.branch_id],
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
    if (!userForm.roleId || !userForm.branchIds.length) {
      showToast('error', 'Users', 'Role and at least one branch are required');
      return;
    }

    const payload = {
      name: userForm.name.trim(),
      username: userForm.username.trim(),
      password: userForm.password.trim(),
      roleId: Number(userForm.roleId),
      branchIds: userForm.branchIds,
      isActive: userForm.isActive,
    };

    setSavingUser(true);
    const res = editingUser
      ? await systemService.updateUser(editingUser.user_id, {
          name: payload.name,
          username: payload.username,
          password: payload.password || undefined,
          roleId: payload.roleId,
          branchIds: payload.branchIds,
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
    const nextRoles = await loadRoles();

    // NEW: After creating a role, jump to Privileges so admin can assign permissions immediately
    if (!editingRole && canViewPrivileges) {
      const createdRoleId = (res as any).data?.role?.role_id as number | undefined;
      if (createdRoleId) {
        setPrivilegesPrefillRoleId(createdRoleId);
      } else {
        // fallback: try to find by name/code
        const found = nextRoles.find((r) => (r.role_name || '').toLowerCase() === roleName.toLowerCase());
        setPrivilegesPrefillRoleId(found?.role_id ?? null);
      }
      goToTab('role-privileges');
    }
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


  const confirmAction = async (reason: string) => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    if (confirmTarget.type === 'user') {
      const res = await systemService.deleteUser(confirmTarget.payload.user_id, reason);
      if (!res.success) {
        showToast('error', 'Users', res.error || 'Delete failed');
      } else {
        showToast('success', 'Users', 'User deleted');
        await loadUsers();
      }
    } else if (confirmTarget.type === 'role') {
      const res = await systemService.deleteRole(confirmTarget.payload.role_id, reason);
      if (!res.success) {
        showToast('error', 'Roles', res.error || 'Delete failed');
      } else {
        showToast('success', 'Roles', 'Role deleted');
        await loadRoles();
      }
    } else if (confirmTarget.type === 'permission') {
      const res = await systemService.deletePermission(confirmTarget.payload.perm_id, reason);
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
                <th className="py-2 pr-4">Logo</th>
                <th className="py-2 pr-4">Banner</th>
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
                <td className="py-2 pr-4">
                  {company.logo_img ? (
                    <img
                      src={resolveImageUrl(company.logo_img)}
                      alt="Logo"
                      className="h-10 w-10 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(company.company_name || 'Company')}&background=0b1a4d&color=ffffff&bold=true&size=64`}
                      alt="Company avatar"
                      className="h-10 w-10 rounded object-cover border border-slate-200"
                    />
                  )}
                </td>
                <td className="py-2 pr-4">
                  {company.banner_img ? (
                    <img
                      src={resolveImageUrl(company.banner_img)}
                      alt="Banner"
                      className="h-10 w-24 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-10 w-24 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-semibold text-slate-500">
                      No banner
                    </div>
                  )}
                </td>
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
          <div className="md:col-span-2">
            <ImageUpload
              label="Company Logo"
              currentImage={companyForm.logo_img || null}
              aspectRatio="square"
              maxWidthClass="max-w-full"
              centered={false}
              variant="inline"
              onUpload={handleLogoUpload}
              onDelete={allowRemoteImageUpload ? handleLogoDelete : undefined}
            />
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              label="Company Banner"
              currentImage={companyForm.banner_img || null}
              aspectRatio="landscape"
              maxWidthClass="max-w-full"
              centered={false}
              variant="inline"
              onUpload={handleBannerUpload}
              onDelete={allowRemoteImageUpload ? handleBannerDelete : undefined}
            />
          </div>
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
        onConfirm={(reason) => void handleCompanyDelete(reason || '')}
        requireReason
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

  const tabs = [
    {
      id: 'company',
      label: 'Company Info',
      icon: Home,
      badge: 0,
      content: companyContent,
    },
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      badge: users.length,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-end gap-2">
            <button
              onClick={displayUsers}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              disabled={loadingUsers || !canViewUsers}
            >
              {loadingUsers ? 'Loading...' : 'Display Users'}
            </button>
            {/* UPDATED: Only users with create permission see Add User */}
            {canCreateUsers && (
              <button
                onClick={openCreateUser}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"
              >
                <Plus className="w-4 h-4" /> Add User
              </button>
            )}
          </div>
          {/* NEW: No-access hint */}
          {!canViewUsers && (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              You do not have permission to view users.
            </div>
          )}
          {usersDisplayed ? (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-300">
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Branch</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.user_id}
                      className="border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <td>{u.name}</td>
                      <td>{u.username}</td>
                      <td>{u.role_name || '-'}</td>
	                      <td>
	                        {u.branch_ids && u.branch_ids.length > 1
	                          ? `${u.branch_ids.length} branches (Global)`
	                          : branches.find((b) => b.branch_id === (u.branch_ids?.[0] ?? u.branch_id))?.branch_name ||
	                            u.branch_name ||
	                            u.branch_id}
	                      </td>
                      <td>{u.created_at ? String(u.created_at).slice(0, 10) : '-'}</td>
	                      <td>{u.is_active ? 'Active' : 'Inactive'}</td>
	                      <td className="space-x-2 py-2">
	                        {/* NEW: Jump to user privileges editor */}
	                        {canViewPrivileges && (
	                          <button
	                            onClick={async () => {
	                              if (!users.length) await loadUsers();
	                              setPrivilegesPrefillUserId(u.user_id);
	                              goToTab('privileges');
	                            }}
	                            className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
	                            title="Edit privileges"
	                          >
	                            <CheckSquare className="w-3 h-3 inline" />
	                          </button>
	                        )}
	                        {/* UPDATED: Only show actions user is allowed to perform */}
	                        {canUpdateUsers && (
	                          <button
	                            onClick={() => openEditUser(u)}
                            className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Pencil className="w-3 h-3 inline" />
                          </button>
                        )}
                        {canDeleteUsers && (
                          <button
                            onClick={() => requestDeleteUser(u)}
                            className="px-2 py-1 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3 h-3 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
	            <button onClick={displayRoles} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" disabled={loadingRoles || !canViewRoles}>
	              {loadingRoles ? 'Loading...' : 'Display Roles'}
	            </button>
	            {/* UPDATED: Only users with create permission see Add Role */}
	            {canCreateRoles && (
	              <button onClick={openCreateRole} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm"><Plus className="w-4 h-4" /> Add Role</button>
	            )}
	          </div>
	          {/* NEW: No-access hint */}
	          {!canViewRoles && (
	            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
	              You do not have permission to view roles.
	            </div>
	          )}
	          {rolesDisplayed ? (
	            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
	              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-300">
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
	                    <th>Actions</th>
	                  </tr>
	                </thead>
	                <tbody>
	                  {roles.map((r) => (
	                    <tr key={r.role_id} className="border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
	                      <td className="font-mono text-xs">{r.role_code}</td>
	                      <td>{r.role_name}</td>
	                      <td>{r.description || '-'}</td>
	                      <td className="space-x-2 py-2">
	                        {/* NEW: Jump to privileges editor for this role */}
	                        {canViewPrivileges && (
	                          <button
	                            onClick={() => {
	                              setPrivilegesPrefillRoleId(r.role_id);
	                              goToTab('role-privileges');
	                            }}
	                            className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
	                            title="Edit privileges"
	                          >
	                            <CheckSquare className="w-3 h-3 inline" />
	                          </button>
	                        )}
	                        {/* UPDATED: Only show actions user is allowed to perform */}
	                        {canUpdateRoles && (
	                          <button onClick={() => openEditRole(r)} className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"><Pencil className="w-3 h-3 inline" /></button>
	                        )}
	                        {canDeleteRoles && (
	                          <button onClick={() => requestDeleteRole(r)} className="px-2 py-1 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="w-3 h-3 inline" /></button>
	                        )}
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
	    // NEW: Privileges tab (role → permissions) is lazy-loaded for stability
	    ...(canViewPrivileges
	      ? [
	          {
	            id: 'privileges',
	            label: 'Privileges',
	            icon: CheckSquare,
	            badge: 0,
	            content: (
	              <Suspense
	                fallback={
	                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
	                    Loading privileges editor...
	                  </div>
	                }
	              >
	                <UserPrivilegesTab
	                  users={users}
	                  canUpdateUserPrivileges={canUpdateUserPrivileges}
	                  loadUsers={loadUsers}
	                  initialUserId={privilegesPrefillUserId}
	                  onUserSelected={(id) => setPrivilegesPrefillUserId(id)}
	                  // UPDATED: Show only permissions currently used in the sidebar (v1.0)
	                  allowedPermissionKeys={SIDEBAR_PERMISSION_KEY_SET}
	                />
	              </Suspense>
	            ),
	          },
	        ]
	      : []),
	    // NEW: Role Privileges tab (role → permissions) is lazy-loaded for stability
	    ...(canViewPrivileges
	      ? [
	          {
	            id: 'role-privileges',
	            label: 'Role Privileges',
	            icon: CheckSquare,
	            badge: 0,
	            content: (
	              <Suspense
	                fallback={
	                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
	                    Loading role privileges editor...
	                  </div>
	                }
	              >
	                <RolePrivilegesTab
	                  roles={roles}
	                  permissions={permissions}
	                  canUpdateRolePermissions={canUpdateRolePermissions}
	                  loadRoles={loadRoles}
	                  loadPermissions={loadPermissions}
	                  initialRoleId={privilegesPrefillRoleId}
	                  onRoleSelected={(id) => setPrivilegesPrefillRoleId(id)}
	                />
	              </Suspense>
	            ),
	          },
	        ]
	      : []),
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
      <PageHeader title="Settings" description="Configure company info, users, roles, and permissions." />
      {/* UPDATED: Use a keyed Tabs instance so we can programmatically switch tabs (e.g. Roles -> Privileges) */}
      <Tabs key={tabsKey} tabs={tabs} defaultTab={activeTabId} onChange={(id) => setActiveTabId(id)} />

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
              placeholder="Full name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Username
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              placeholder="Username"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Password {editingUser ? '(Optional)' : ''}
            <input
              type="password"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              placeholder={editingUser ? 'Leave blank to keep password' : 'Set password'}
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
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            <div className="flex items-center justify-between">
              <span>Branches</span>
              <button
                type="button"
                className="text-xs font-semibold text-primary-600 hover:underline"
                onClick={() =>
                  setUserForm((prev) => ({
                    ...prev,
                    branchIds:
                      prev.branchIds.length === branches.length ? [] : branches.map((b) => b.branch_id),
                  }))
                }
              >
                {userForm.branchIds.length === branches.length ? 'Clear all' : 'Select all (global)'}
              </button>
            </div>
            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-3">
              {branches.map((branch) => (
                <label key={branch.branch_id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <input
                    type="checkbox"
                    checked={userForm.branchIds.includes(branch.branch_id)}
                    onChange={(e) =>
                      setUserForm((prev) => ({
                        ...prev,
                        branchIds: e.target.checked
                          ? [...prev.branchIds, branch.branch_id]
                          : prev.branchIds.filter((id) => id !== branch.branch_id),
                      }))
                    }
                  />
                  <span className="truncate">{branch.branch_name}</span>
                </label>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Pick one branch for a branch-only user, or several for a global user who can work across branches.
            </span>
          </div>
          {editingUser && (
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Status
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={userForm.isActive ? 'active' : 'inactive'}
                onChange={(e) => setUserForm({ ...userForm, isActive: e.target.value === 'active' })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          )}
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
              placeholder="Role name"
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
              placeholder="Permission name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Module
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={permissionForm.module}
              onChange={(e) => setPermissionForm({ ...permissionForm, module: e.target.value })}
              placeholder="e.g. users"
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
        onConfirm={(reason) => void confirmAction(reason || '')}
        requireReason
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
