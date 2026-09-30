import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  History,
  Save,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Split,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { systemService, type RolePermission, type SystemPermission, type SystemRole } from '../../services/system.service';
import {
  SIMPLE_ACTIONS,
  SIMPLE_ACTION_LABELS,
  SIMPLE_PRIVILEGE_MODULES,
  simplePermKeys,
  simpleSubItemKeys,
} from '../../config/simplePrivileges';
import { CompareRolesModal } from './CompareRolesModal';

// Small, page-local stat tile - follows the same pattern already used in
// frontend/src/pages/Finance/Receipts.tsx, with dark-mode variants added.
const StatCard = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: 'slate' | 'emerald' | 'rose';
}) => {
  const toneClasses = {
    slate: 'bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
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

const RolePrivilegesPage = () => {
  const { showToast } = useToast();
  const { user, refreshUser } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [permissions, setPermissions] = useState<SystemPermission[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);

  const canUpdateRolePermissions = canAny(['system.roles.manage', 'roles.update']);

  useEffect(() => {
    void systemService.getRoles().then((res) => {
      if (res.success && res.data?.roles) setRoles(res.data.roles);
    });
    void systemService.getPermissions().then((res) => {
      if (res.success && res.data?.permissions) setPermissions(res.data.permissions);
    });
  }, []);

  const loadRolePermissions = useCallback(
    async (nextRoleId: number) => {
      setLoading(true);
      try {
        const res = await systemService.getRolePermissions(nextRoleId);
        if (res.success && res.data?.permissions) {
          setRolePermissions(res.data.permissions);
          setSavedSnapshot(new Map(res.data.permissions.map((p) => [p.perm_key, p.has_permission])));
        } else {
          showToast('error', 'Role Privileges', res.error || 'Failed to load role permissions');
        }
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  // Prefill from ?roleId= (e.g. navigated here from Users/Roles admin screens, or right
  // after creating a new role).
  useEffect(() => {
    const fromUrl = Number(searchParams.get('roleId') || 0) || null;
    if (!fromUrl || fromUrl === roleId) return;
    setRoleId(fromUrl);
    void loadRolePermissions(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectRole = async (nextId: number | null) => {
    setRoleId(nextId);
    setSearchParams(nextId ? { roleId: String(nextId) } : {}, { replace: true });
    if (nextId) await loadRolePermissions(nextId);
  };

  const byKey = useMemo(() => {
    const map = new Map<string, RolePermission>();
    for (const p of rolePermissions) map.set(p.perm_key, p);
    return map;
  }, [rolePermissions]);

  const toggleModuleAction = (keys: string[], nextValue: boolean) => {
    const keySet = new Set(keys);
    setRolePermissions((prev) => prev.map((p) => (keySet.has(p.perm_key) ? { ...p, has_permission: nextValue } : p)));
  };

  const isDirty = rolePermissions.some((p) => savedSnapshot.get(p.perm_key) !== p.has_permission);

  const save = async () => {
    if (!roleId) return;
    if (!canUpdateRolePermissions) {
      showToast('error', 'Role Privileges', 'You do not have permission to update role privileges');
      return;
    }
    setSaving(true);
    try {
      const permIds = rolePermissions.filter((p) => p.has_permission).map((p) => p.perm_id);
      const res = await systemService.updateRolePermissions(roleId, permIds);
      if (!res.success) {
        showToast('error', 'Role Privileges', res.error || 'Failed to save role privileges');
        return;
      }
      showToast('success', 'Role Privileges', 'Role privileges updated');
      await loadRolePermissions(roleId);
      if (user?.role_id === roleId) await refreshUser();
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
    let granted = 0;
    let restricted = 0;
    const countCell = (keys: string[]) => {
      const matched = keys.map((k) => byKey.get(k)).filter((p): p is RolePermission => !!p);
      if (matched.length === 0) return;
      if (matched.every((p) => p.has_permission)) granted += 1;
      else restricted += 1;
    };
    for (const mod of SIMPLE_PRIVILEGE_MODULES) {
      for (const action of SIMPLE_ACTIONS) countCell(simplePermKeys(mod, action));
      for (const sub of mod.subItems || []) {
        if (sub.kind === 'info') continue;
        for (const action of SIMPLE_ACTIONS) countCell(simpleSubItemKeys(sub, action));
      }
    }
    return { modules: SIMPLE_PRIVILEGE_MODULES.length, granted, restricted };
  }, [byKey]);

  return (
    <div>
      <PageHeader
        title="Role Privileges"
        description="Define what each role can see and do, area by area."
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Access & Security' }, { label: 'Role Privileges' }]}
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
              onClick={() => navigate('/settings?tab=activity-logs&entity=role_permissions')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4" /> Audit Logs
            </button>
            {canUpdateRolePermissions && (
              <button
                type="button"
                onClick={save}
                disabled={!roleId || loading || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Select Role
            <select
              className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleId ?? ''}
              onChange={(e) => void selectRole(Number(e.target.value || 0) || null)}
            >
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
              ))}
            </select>
          </label>
        </div>

        {roleId && isDirty && (
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <span>You have unsaved changes - click Save Changes to apply them.</span>
          </div>
        )}

        {roleId && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Modules" value={stats.modules} icon={Shield} tone="slate" />
            <StatCard label="Granted" value={stats.granted} icon={ShieldCheck} tone="emerald" />
            <StatCard label="Restricted" value={stats.restricted} icon={ShieldOff} tone="rose" />
          </div>
        )}

        {!roleId ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Select a role to view and edit what it can do.
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Loading role privileges...
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
                            const matched = keys.map((k) => byKey.get(k)).filter((p): p is RolePermission => !!p);
                            if (matched.length === 0) {
                              return <td key={action} className="px-4 py-3 text-center text-slate-300 dark:text-slate-700">—</td>;
                            }
                            const checked = matched.every((p) => p.has_permission);
                            return (
                              <td key={action} className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={() => toggleModuleAction(keys, !checked)}
                                  disabled={!canUpdateRolePermissions}
                                  aria-label={`${mod.label} - ${SIMPLE_ACTION_LABELS[action]}`}
                                />
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
                              const matched = keys.map((k) => byKey.get(k)).filter((p): p is RolePermission => !!p);
                              if (matched.length === 0) {
                                return <td key={action} className="px-4 py-2 text-center text-slate-300 dark:text-slate-700">—</td>;
                              }
                              const checked = matched.every((p) => p.has_permission);
                              return (
                                <td key={action} className="px-4 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={checked}
                                    onChange={() => toggleModuleAction(keys, !checked)}
                                    disabled={!canUpdateRolePermissions}
                                    aria-label={`${sub.label} - ${SIMPLE_ACTION_LABELS[action]}`}
                                  />
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

      <CompareRolesModal isOpen={compareOpen} onClose={() => setCompareOpen(false)} roles={roles} initialRoleAId={roleId} />
    </div>
  );
};

export default RolePrivilegesPage;
