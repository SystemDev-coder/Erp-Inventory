import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, User } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { systemService, type SystemUser, type UserPermission } from '../../services/system.service';
import {
  SIMPLE_ACTIONS,
  SIMPLE_ACTION_LABELS,
  SIMPLE_PRIVILEGE_MODULES,
  simplePermKeys,
} from '../../config/simplePrivileges';

type OverrideRow = { permId: number; effect: 'allow' | 'deny' };

type Props = {
  users: SystemUser[];
  canUpdateUserPrivileges: boolean;
  loadUsers: () => Promise<SystemUser[]>;
  initialUserId?: number | null;
  onUserSelected?: (userId: number | null) => void;
};

// User privileges editor (saves to ims.user_permission_overrides only) - same simplified
// View/Add New/Edit/Delete grid as Role Privileges. Only the keys visibly checked/unchecked
// here are ever compared against the role's inherited value and possibly overridden; every
// other permission is left exactly as the role grants it (see deriveOverrides below).
export const UserPrivilegesTab = ({
  users,
  canUpdateUserPrivileges,
  loadUsers,
  initialUserId,
  onUserSelected,
}: Props) => {
  const { showToast } = useToast();
  const [userId, setUserId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((u) => u.user_id === userId) || null,
    [userId, users]
  );

  const loadUserPermissions = useCallback(
    async (nextUserId: number) => {
      setLoading(true);
      try {
        if (!users.length) await loadUsers();
        const res = await systemService.getUserPermissions(nextUserId);
        if (res.success && res.data?.permissions) {
          setPermissions(res.data.permissions);
        } else {
          showToast('error', 'Privileges', res.error || 'Failed to load user privileges');
        }
      } finally {
        setLoading(false);
      }
    },
    [loadUsers, showToast, users.length]
  );

  // Populate the User dropdown as soon as this tab opens. `users` is shared with the
  // separate Users tab, which only loads it behind its own Display button - without this,
  // arriving here directly left the dropdown showing nothing but "Select user..." until the
  // user happened to visit the Users tab first.
  useEffect(() => {
    if (!users.length) void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill selection from parent
  useEffect(() => {
    if (!initialUserId) return;
    if (userId === initialUserId) return;
    setUserId(initialUserId);
    void loadUserPermissions(initialUserId);
  }, [initialUserId, loadUserPermissions, userId]);

  const byKey = useMemo(() => {
    const map = new Map<string, UserPermission>();
    for (const p of permissions) map.set(p.perm_key, p);
    return map;
  }, [permissions]);

  const toggleModuleAction = (keys: string[], nextValue: boolean) => {
    const keySet = new Set(keys);
    setPermissions((prev) =>
      prev.map((p) => (keySet.has(p.perm_key) ? { ...p, has_permission: nextValue } : p))
    );
  };

  // Derive overrides by comparing desired effective state with inherited state - only
  // permissions the grid actually touched can differ from `inherited`, so this naturally
  // only ever overrides what was visibly checked/unchecked.
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

  const save = async () => {
    if (!userId) return;
    if (!canUpdateUserPrivileges) {
      showToast('error', 'Privileges', 'You do not have permission to update user privileges');
      return;
    }
    setSaving(true);
    try {
      const overrides = deriveOverrides(permissions);
      const res = await systemService.updateUserPermissionOverrides(userId, overrides);
      if (!res.success) {
        showToast('error', 'Privileges', res.error || 'Failed to save user privileges');
        return;
      }
      showToast('success', 'Privileges', 'User privileges updated');
      await loadUserPermissions(userId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
          User
          <select
            className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            value={userId ?? ''}
            onChange={async (e) => {
              const next = Number(e.target.value || 0) || null;
              setUserId(next);
              onUserSelected?.(next);
              if (next) await loadUserPermissions(next);
            }}
          >
            <option value="">Select user...</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.username} ({u.role_name || 'Role'})
              </option>
            ))}
          </select>
        </label>

        {canUpdateUserPrivileges && (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
            onClick={save}
            disabled={!userId || loading || saving}
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {!!userId && !!selectedUser && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          <div className="flex items-center gap-2 font-semibold">
            <User className="h-4 w-4 text-slate-500 dark:text-slate-300" />
            Editing privileges for: {selectedUser.username}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            A checkbox here only overrides that one action for this user - everything else
            still follows their role ({selectedUser.role_name || 'Role'}).
          </div>
        </div>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
