import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { systemService, type RolePermission, type SystemPermission, type SystemRole } from '../../services/system.service';
import {
  SIMPLE_ACTIONS,
  SIMPLE_ACTION_LABELS,
  SIMPLE_PRIVILEGE_MODULES,
  simplePermKeys,
} from '../../config/simplePrivileges';

type Props = {
  roles: SystemRole[];
  permissions: SystemPermission[];
  canUpdateRolePermissions: boolean;
  loadRoles: () => Promise<SystemRole[]>;
  loadPermissions: () => Promise<SystemPermission[]>;
  initialRoleId?: number | null;
  onRoleSelected?: (roleId: number | null) => void;
};

// Role privileges editor - a simple View/Add New/Edit/Delete grid per business area instead
// of a flat list of ~400 raw permission keys. See config/simplePrivileges.ts for why and how
// modules map to the underlying keys; anything not shown in this grid (export, void, approve,
// credit, ...) is left exactly as the role already has it - Save only ever touches the keys
// visibly checked/unchecked here.
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

  // Populate the Role dropdown as soon as this tab opens. `roles`/`permissions` are shared
  // with the separate Roles/Privileges tabs, which only load them behind their own Display
  // button - without this, arriving here directly left the dropdown showing nothing but
  // "Select role..." until the user happened to visit those other tabs first.
  useEffect(() => {
    if (!roles.length) void loadRoles();
    if (!permissions.length) void loadPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow parent to preselect a role (e.g. after creating a role or clicking a row action)
  useEffect(() => {
    if (!initialRoleId) return;
    if (roleId === initialRoleId) return;
    setRoleId(initialRoleId);
    void loadRolePermissions(initialRoleId);
  }, [initialRoleId, loadRolePermissions, roleId]);

  const byKey = useMemo(() => {
    const map = new Map<string, RolePermission>();
    for (const p of rolePermissions) map.set(p.perm_key, p);
    return map;
  }, [rolePermissions]);

  // Toggle every underlying perm_key a module+action maps to, together, to the same value -
  // e.g. "Returns" x "Edit" flips both sales_returns.update and purchase_returns.update.
  const toggleModuleAction = (keys: string[], nextValue: boolean) => {
    const keySet = new Set(keys);
    setRolePermissions((prev) =>
      prev.map((p) => (keySet.has(p.perm_key) ? { ...p, has_permission: nextValue } : p))
    );
  };

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

        {canUpdateRolePermissions && (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
            onClick={save}
            disabled={!roleId || loading || saving}
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {!roleId ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Select a role to view and edit what it can do.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Loading role privileges...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Area</th>
                {SIMPLE_ACTIONS.map((action) => (
                  <th key={action} className="px-4 py-3 text-center font-semibold">
                    {SIMPLE_ACTION_LABELS[action]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIMPLE_PRIVILEGE_MODULES.map((mod) => (
                <tr key={mod.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{mod.label}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
