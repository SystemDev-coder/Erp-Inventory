import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Save, Search, XSquare } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { systemService, type RolePermission, type SystemPermission, type SystemRole } from '../../services/system.service';

type Props = {
  roles: SystemRole[];
  permissions: SystemPermission[];
  canUpdateRolePermissions: boolean;
  loadRoles: () => Promise<SystemRole[]>;
  loadPermissions: () => Promise<SystemPermission[]>;
  initialRoleId?: number | null;
  onRoleSelected?: (roleId: number | null) => void;
};

// NEW: Role privileges editor (loads data only when user selects a role)
export const RolePrivilegesTab = ({
  roles,
  permissions,
  canUpdateRolePermissions,
  loadRoles,
  loadPermissions,
  initialRoleId,
  onRoleSelected,
}: Props) => {
  const { showToast } = useToast();
  const [roleId, setRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // NEW: Load role permissions on demand (and ensure roles/permissions lists exist)
  const loadRolePermissions = useCallback(
    async (nextRoleId: number) => {
      setLoading(true);
      try {
        if (!roles.length) await loadRoles();
        if (!permissions.length) await loadPermissions();

        const res = await systemService.getRolePermissions(nextRoleId);
        if (res.success && res.data?.permissions) {
          setRolePermissions(res.data.permissions);
        } else {
          showToast('error', 'Privileges', res.error || 'Failed to load role permissions');
        }
      } finally {
        setLoading(false);
      }
    },
    [loadPermissions, loadRoles, permissions.length, roles.length, showToast]
  );

  // NEW: Allow parent to preselect a role (e.g. after creating a role or clicking a row action)
  useEffect(() => {
    if (!initialRoleId) return;
    if (roleId === initialRoleId) return;
    setRoleId(initialRoleId);
    void loadRolePermissions(initialRoleId);
  }, [initialRoleId, loadRolePermissions, roleId]);

  // NEW: Toggle permission in local state
  const togglePermission = (permId: number) => {
    setRolePermissions((prev) =>
      prev.map((p) => (p.perm_id === permId ? { ...p, has_permission: !p.has_permission } : p))
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rolePermissions;
    return rolePermissions.filter((p) => {
      const hay = `${p.perm_key} ${p.perm_name || ''} ${p.module || ''} ${p.sub_module || ''} ${p.action_type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rolePermissions, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, RolePermission[]>();
    for (const p of filtered) {
      const title = `${p.module || 'Other'}${p.sub_module ? ` / ${p.sub_module}` : ''}`;
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(p);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // NEW: Bulk toggle visible permissions
  const bulkSetVisible = (enabled: boolean) => {
    const visibleSet = new Set(filtered.map((p) => p.perm_id));
    setRolePermissions((prev) =>
      prev.map((p) => (visibleSet.has(p.perm_id) ? { ...p, has_permission: enabled } : p))
    );
  };

  // NEW: Save full permission set for role
  const save = async () => {
    if (!roleId) return;
    if (!canUpdateRolePermissions) {
      showToast('error', 'Privileges', 'You do not have permission to update role privileges');
      return;
    }
    setSaving(true);
    try {
      const permIds = rolePermissions.filter((p) => p.has_permission).map((p) => p.perm_id);
      const res = await systemService.updateRolePermissions(roleId, permIds);
      if (!res.success) {
        showToast('error', 'Privileges', res.error || 'Failed to save role privileges');
        return;
      }
      showToast('success', 'Privileges', 'Role privileges updated');
      await loadRolePermissions(roleId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Role
            <select
              className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleId ?? ''}
              onChange={async (e) => {
                const next = Number(e.target.value || 0) || null;
                setRoleId(next);
                onRoleSelected?.(next);
                if (next) await loadRolePermissions(next);
              }}
            >
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {r.role_name}
                </option>
              ))}
            </select>
          </label>

          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-72 max-w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions..."
              disabled={!roleId || loading}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            onClick={() => bulkSetVisible(true)}
            disabled={!roleId || loading}
          >
            <CheckSquare className="h-4 w-4" /> Check visible
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            onClick={() => bulkSetVisible(false)}
            disabled={!roleId || loading}
          >
            <XSquare className="h-4 w-4" /> Uncheck visible
          </button>
          {canUpdateRolePermissions && (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-60"
              onClick={save}
              disabled={!roleId || loading || saving}
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {!roleId ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Select a role to view and edit its privileges.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Loading role privileges...
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {grouped.map(([groupTitle, groupPerms]) => (
            <div key={groupTitle} className="border-b border-slate-200 last:border-b-0 dark:border-slate-800 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-white">{groupTitle}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {groupPerms.filter((p) => p.has_permission).length}/{groupPerms.length} enabled
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {groupPerms.map((p) => (
                  <label
                    key={p.perm_id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-slate-800/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!!p.has_permission}
                      onChange={() => togglePermission(p.perm_id)}
                      disabled={!canUpdateRolePermissions}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{p.perm_name || p.perm_key}</span>
                      <span className="block font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                        {p.perm_key}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400">No permissions match your search.</div>
          )}
        </div>
      )}
    </div>
  );
};
