import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  History,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Split,
  User as UserIcon,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { systemService, type SystemPermission, type SystemRole, type SystemUser, type UserPermission } from '../../services/system.service';
import {
  SIMPLE_ACTIONS,
  SIMPLE_ACTION_LABELS,
  SIMPLE_PRIVILEGE_MODULES,
  simplePermKeys,
  simpleSubItemKeys,
} from '../../config/simplePrivileges';
import { CompareRolesModal } from './CompareRolesModal';

type OverrideRow = { permId: number; effect: 'allow' | 'deny' };

const StatCard = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
}) => {
  const toneClasses = {
    slate: 'bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${toneClasses}`}>
      <div className="rounded-lg bg-white/70 p-2 dark:bg-black/20">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium opacity-70">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
};

const UserPrivilegesPage = () => {
  const { showToast } = useToast();
  const { user: currentUser, refreshUser } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [savedOverrideCount, setSavedOverrideCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);

  const canUpdateUserPrivileges = canAny(['system.permissions.manage', 'users.update', 'system.users.manage']);

  const selectedUser = useMemo(() => users.find((u) => u.user_id === userId) || null, [userId, users]);

  useEffect(() => {
    void systemService.getUsers().then((res) => {
      if (res.success && res.data?.users) setUsers(res.data.users);
    });
    void systemService.getRoles().then((res) => {
      if (res.success && res.data?.roles) setRoles(res.data.roles);
    });
  }, []);

  const loadUserPermissions = useCallback(
    async (nextUserId: number) => {
      setLoading(true);
      try {
        const res = await systemService.getUserPermissions(nextUserId);
        if (res.success && res.data?.permissions) {
          setPermissions(res.data.permissions);
          setSavedOverrideCount(res.data.permissions.filter((p) => p.override_effect).length);
        } else {
          showToast('error', 'User Privileges', res.error || 'Failed to load user privileges');
        }
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    const fromUrl = Number(searchParams.get('userId') || 0) || null;
    if (!fromUrl || fromUrl === userId) return;
    setUserId(fromUrl);
    void loadUserPermissions(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectUser = async (nextId: number | null) => {
    setUserId(nextId);
    setSearchParams(nextId ? { userId: String(nextId) } : {}, { replace: true });
    if (nextId) await loadUserPermissions(nextId);
  };

  const byKey = useMemo(() => {
    const map = new Map<string, UserPermission>();
    for (const p of permissions) map.set(p.perm_key, p);
    return map;
  }, [permissions]);

  const toggleModuleAction = (keys: string[], nextValue: boolean) => {
    const keySet = new Set(keys);
    setPermissions((prev) => prev.map((p) => (keySet.has(p.perm_key) ? { ...p, has_permission: nextValue } : p)));
  };

  const deriveOverrides = (rows: UserPermission[]): OverrideRow[] => {
    const overrides: OverrideRow[] = [];
    for (const p of rows) {
      const desired = !!p.has_permission;
      const inherited = !!p.inherited;
      if (desired === inherited) continue;
      overrides.push({ permId: p.perm_id, effect: desired ? 'allow' : 'deny' });
    }
    return overrides;
  };

  const pendingOverrides = deriveOverrides(permissions);
  const isDirty = pendingOverrides.length !== savedOverrideCount || permissions.some((p) => {
    const desired = !!p.has_permission;
    const wasOverridden = !!p.override_effect;
    const wasAllowed = wasOverridden ? p.override_effect === 'allow' : !!p.inherited;
    return desired !== wasAllowed;
  });

  const resetToRoleDefaults = () => {
    setPermissions((prev) => prev.map((p) => ({ ...p, has_permission: !!p.inherited })));
  };

  const save = async () => {
    if (!userId) return;
    if (!canUpdateUserPrivileges) {
      showToast('error', 'User Privileges', 'You do not have permission to update user privileges');
      return;
    }
    setSaving(true);
    try {
      const overrides = deriveOverrides(permissions);
      const res = await systemService.updateUserPermissionOverrides(userId, overrides);
      if (!res.success) {
        showToast('error', 'User Privileges', res.error || 'Failed to save user privileges');
        return;
      }
      showToast('success', 'User Privileges', 'User privileges updated');
      await loadUserPermissions(userId);
      if (currentUser?.user_id === userId) await refreshUser();
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (moduleId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const expandableModuleIds = useMemo(
    () => SIMPLE_PRIVILEGE_MODULES.filter((m) => m.subItems?.length).map((m) => m.id),
    []
  );

  const visibleModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SIMPLE_PRIVILEGE_MODULES;
    return SIMPLE_PRIVILEGE_MODULES.filter(
      (mod) =>
        mod.label.toLowerCase().includes(q) ||
        (mod.subItems || []).some((sub) => sub.label.toLowerCase().includes(q))
    );
  }, [search]);

  const stats = useMemo(() => {
    let allowed = 0;
    let overrides = 0;
    let restricted = 0;
    const countCell = (keys: string[]) => {
      const matched = keys.map((k) => byKey.get(k)).filter((p): p is UserPermission => !!p);
      if (matched.length === 0) return;
      if (matched.every((p) => p.has_permission)) allowed += 1;
      else restricted += 1;
      if (matched.some((p) => p.override_effect)) overrides += 1;
    };
    for (const mod of SIMPLE_PRIVILEGE_MODULES) {
      for (const action of SIMPLE_ACTIONS) countCell(simplePermKeys(mod, action));
      for (const sub of mod.subItems || []) {
        if (sub.kind === 'info') continue;
        for (const action of SIMPLE_ACTIONS) countCell(simpleSubItemKeys(sub, action));
      }
    }
    return { modules: SIMPLE_PRIVILEGE_MODULES.length, allowed, overrides, restricted };
  }, [byKey]);

  const userRole = roles.find((r) => r.role_name === selectedUser?.role_name);

  return (
    <div>
      <PageHeader
        title="User Privileges"
        description="Override role defaults with user-specific privileges."
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Access & Security' }, { label: 'User Privileges' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              disabled={roles.length < 2}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Split className="h-4 w-4" /> Compare Roles
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings?tab=activity-logs&entity=user_permission_overrides')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4" /> Audit Logs
            </button>
            {canUpdateUserPrivileges && (
              <button
                type="button"
                onClick={save}
                disabled={!userId || loading || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Select Operator / User
              <select
                className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={userId ?? ''}
                onChange={(e) => void selectUser(Number(e.target.value || 0) || null)}
              >
                <option value="">Select user...</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.username} ({u.role_name || 'Role'})</option>
                ))}
              </select>
            </label>
          </div>

          {selectedUser && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
                <UserIcon className="h-4 w-4" /> Editing privileges for: {selectedUser.username}
              </div>
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                Base role: {selectedUser.role_name || 'Role'}. A checkbox here only overrides that one
                action for this user - everything else still follows their role.
              </div>
            </div>
          )}
        </div>

        {userId && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Inherited from Role</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary-500" /> Custom User Override</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" /> Not Applicable</span>
              </div>
              <button type="button" onClick={resetToRoleDefaults} className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" /> Reset to Role Defaults
              </button>
            </div>

            {isDirty && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {pendingOverrides.length} custom override{pendingOverrides.length === 1 ? '' : 's'} pending - unsaved privileges will not take effect until saved.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <StatCard label="Modules" value={stats.modules} icon={Shield} tone="slate" />
              <StatCard label="Allowed" value={stats.allowed} icon={ShieldCheck} tone="emerald" />
              <StatCard label="Overrides" value={stats.overrides} icon={ShieldAlert} tone="amber" />
              <StatCard label="Restricted" value={stats.restricted} icon={ShieldOff} tone="rose" />
            </div>
          </>
        )}

        {!userId ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Select a user to view and edit their privileges.
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Loading user privileges...
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
              <label className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search modules or permissions..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(new Set(expandableModuleIds))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronsDown className="h-3.5 w-3.5" /> Expand All
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(new Set())}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronsUp className="h-3.5 w-3.5" /> Collapse All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-4 py-3 font-semibold">Area / System Module</th>
                    {SIMPLE_ACTIONS.map((action) => (
                      <th key={action} className="px-4 py-3 text-center font-semibold">{SIMPLE_ACTION_LABELS[action]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleModules.map((mod) => {
                    const hasSubItems = !!mod.subItems?.length;
                    const isExpanded = expanded.has(mod.id) || (!!search.trim() && hasSubItems);
                    return (
                      <Fragment key={mod.id}>
                        <tr className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5">
                              {hasSubItems ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(mod.id)}
                                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                  aria-label={isExpanded ? `Collapse ${mod.label}` : `Expand ${mod.label}`}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : (
                                <span className="w-5" />
                              )}
                              {mod.label}
                            </div>
                          </td>
                          {SIMPLE_ACTIONS.map((action) => {
                            const keys = simplePermKeys(mod, action);
                            const matched = keys.map((k) => byKey.get(k)).filter((p): p is UserPermission => !!p);
                            if (matched.length === 0) {
                              return <td key={action} className="px-4 py-3 text-center text-slate-300 dark:text-slate-700">—</td>;
                            }
                            const checked = matched.every((p) => p.has_permission);
                            const overridden = matched.some((p) => p.override_effect);
                            return (
                              <td key={action} className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={() => toggleModuleAction(keys, !checked)}
                                  disabled={!canUpdateUserPrivileges}
                                  aria-label={`${mod.label} - ${SIMPLE_ACTION_LABELS[action]}`}
                                  title={overridden ? 'Overridden for this user' : 'Inherited from role'}
                                />
                                {overridden && <span className="ml-1 text-[10px] text-primary-600 dark:text-primary-300">•</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {hasSubItems && isExpanded && mod.subItems!.map((sub) => (
                          <tr key={sub.id} className="border-b border-slate-100 bg-slate-50/60 last:border-b-0 dark:border-slate-800 dark:bg-slate-800/30">
                            <td className="px-4 py-2 pl-11 text-slate-600 dark:text-slate-300">
                              {sub.label}
                              {sub.kind === 'info' && (
                                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{sub.note}</span>
                              )}
                            </td>
                            {SIMPLE_ACTIONS.map((action) => {
                              if (sub.kind === 'info') {
                                return <td key={action} className="px-4 py-2 text-center text-slate-300 dark:text-slate-700">—</td>;
                              }
                              const keys = simpleSubItemKeys(sub, action);
                              const matched = keys.map((k) => byKey.get(k)).filter((p): p is UserPermission => !!p);
                              if (matched.length === 0) {
                                return <td key={action} className="px-4 py-2 text-center text-slate-300 dark:text-slate-700">—</td>;
                              }
                              const checked = matched.every((p) => p.has_permission);
                              const overridden = matched.some((p) => p.override_effect);
                              return (
                                <td key={action} className="px-4 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={checked}
                                    onChange={() => toggleModuleAction(keys, !checked)}
                                    disabled={!canUpdateUserPrivileges}
                                    aria-label={`${sub.label} - ${SIMPLE_ACTION_LABELS[action]}`}
                                    title={overridden ? 'Overridden for this user' : 'Inherited from role'}
                                  />
                                  {overridden && <span className="ml-1 text-[10px] text-primary-600 dark:text-primary-300">•</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CompareRolesModal isOpen={compareOpen} onClose={() => setCompareOpen(false)} roles={roles} initialRoleAId={userRole?.role_id ?? null} />
    </div>
  );
};

export default UserPrivilegesPage;
