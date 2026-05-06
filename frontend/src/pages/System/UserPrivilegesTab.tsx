import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Save, Search, User, XSquare } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { systemService, type SystemUser, type UserPermission } from '../../services/system.service';

type OverrideRow = { permId: number; effect: 'allow' | 'deny' };

type Props = {
  users: SystemUser[];
  canUpdateUserPrivileges: boolean;
  loadUsers: () => Promise<SystemUser[]>;
  initialUserId?: number | null;
  onUserSelected?: (userId: number | null) => void;
};

// NEW: User privileges editor (writes only ims.user_permission_overrides via backend)
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
  const [search, setSearch] = useState('');

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

  // NEW: Prefill from parent (e.g. Users table action)
  useEffect(() => {
    if (!initialUserId) return;
    if (userId === initialUserId) return;
    setUserId(initialUserId);
    void loadUserPermissions(initialUserId);
  }, [initialUserId, loadUserPermissions, userId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter((p) => {
      const hay = `${p.perm_key} ${p.perm_name || ''} ${p.module || ''} ${p.sub_module || ''} ${p.action_type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [permissions, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, UserPermission[]>();
    for (const p of filtered) {
      const title = `${p.module || 'Other'}${p.sub_module ? ` / ${p.sub_module}` : ''}`;
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(p);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // NEW: Toggle effective permission; convert to override effect when saving
  const toggleEffective = (permId: number) => {
    setPermissions((prev) =>
      prev.map((p) => (p.perm_id === permId ? { ...p, has_permission: !p.has_permission } : p))
    );
  };

  const bulkSetVisible = (enabled: boolean) => {
    const visibleSet = new Set(filtered.map((p) => p.perm_id));
    setPermissions((prev) => prev.map((p) => (visibleSet.has(p.perm_id) ? { ...p, has_permission: enabled } : p)));
  };

  // NEW: Derive overrides based on desired effective state vs inherited state
  const deriveOverrides = (rows: UserPermission[]): OverrideRow[] => {
    const overrides: OverrideRow[] = [];
    for (const p of rows) {
      const desired = !!p.has_permission;
      const inherited = !!p.inherited;
      const currentOverride = p.override_effect;

      // If desired matches inherited and no override needed -> clear override
      if (desired === inherited) {
        continue;
      }

      // If desired is true but inherited is false -> must allow override
      if (desired && !inherited) {
        overrides.push({ permId: p.perm_id, effect: 'allow' });
        continue;
      }

      // If desired is false but inherited is true -> must deny override
      if (!desired && inherited) {
        overrides.push({ permId: p.perm_id, effect: 'deny' });
        continue;
      }

      // Fallback: preserve explicit effect if mismatch remains
      if (currentOverride) {
        overrides.push({ permId: p.perm_id, effect: currentOverride });
      }
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
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-72 max-w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions..."
              disabled={!userId || loading}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            onClick={() => bulkSetVisible(true)}
            disabled={!userId || loading}
          >
            <CheckSquare className="h-4 w-4" /> Check visible
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            onClick={() => bulkSetVisible(false)}
            disabled={!userId || loading}
          >
            <XSquare className="h-4 w-4" /> Uncheck visible
          </button>
          {canUpdateUserPrivileges && (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-60"
              onClick={save}
              disabled={!userId || loading || saving}
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {!userId ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Select a user to view and edit privileges.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Loading user privileges...
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
                      onChange={() => toggleEffective(p.perm_id)}
                      disabled={!canUpdateUserPrivileges}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{p.perm_name || p.perm_key}</span>
                      <span className="block font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                        {p.perm_key}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                        {p.override_effect ? `Override: ${p.override_effect}` : p.inherited ? 'Inherited: role' : 'Inherited: none'}
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

