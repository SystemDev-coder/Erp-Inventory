import { useEffect, useMemo, useState } from 'react';
import { Check, X as XIcon } from 'lucide-react';
import { Modal } from '../../components/ui/modal/Modal';
import { systemService, type RolePermission, type SystemRole } from '../../services/system.service';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  roles: SystemRole[];
  // Preselect one side, e.g. when opened from the Role Privileges page for the role
  // currently being edited.
  initialRoleAId?: number | null;
};

// Compares two roles' full permission sets side by side. Calls the existing
// GET /system/roles/:id/permissions endpoint twice (it already returns the complete,
// unpaginated ~350-400-row set per role) and zips the results on perm_key - no new
// backend endpoint needed for this.
export const CompareRolesModal = ({ isOpen, onClose, roles, initialRoleAId }: Props) => {
  const [roleAId, setRoleAId] = useState<number | null>(null);
  const [roleBId, setRoleBId] = useState<number | null>(null);
  const [permsA, setPermsA] = useState<RolePermission[]>([]);
  const [permsB, setPermsB] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setRoleAId(initialRoleAId ?? null);
    setRoleBId(null);
    setPermsA([]);
    setPermsB([]);
    setSearch('');
    setOnlyDifferences(true);
  }, [isOpen, initialRoleAId]);

  useEffect(() => {
    if (!isOpen || !roleAId) return;
    void systemService.getRolePermissions(roleAId).then((res) => {
      if (res.success && res.data?.permissions) setPermsA(res.data.permissions);
    });
  }, [isOpen, roleAId]);

  useEffect(() => {
    if (!isOpen || !roleBId) return;
    void systemService.getRolePermissions(roleBId).then((res) => {
      if (res.success && res.data?.permissions) setPermsB(res.data.permissions);
    });
  }, [isOpen, roleBId]);

  const loadBoth = async () => {
    if (!roleAId || !roleBId) return;
    setLoading(true);
    const [resA, resB] = await Promise.all([
      systemService.getRolePermissions(roleAId),
      systemService.getRolePermissions(roleBId),
    ]);
    if (resA.success && resA.data?.permissions) setPermsA(resA.data.permissions);
    if (resB.success && resB.data?.permissions) setPermsB(resB.data.permissions);
    setLoading(false);
  };

  const rows = useMemo(() => {
    const byKeyA = new Map(permsA.map((p) => [p.perm_key, p]));
    const byKeyB = new Map(permsB.map((p) => [p.perm_key, p]));
    const allKeys = Array.from(new Set([...byKeyA.keys(), ...byKeyB.keys()])).sort();
    return allKeys
      .map((key) => {
        const a = byKeyA.get(key);
        const b = byKeyB.get(key);
        return {
          key,
          label: a?.perm_name || b?.perm_name || key,
          module: a?.module || b?.module || '',
          aGranted: !!a?.has_permission,
          bGranted: !!b?.has_permission,
        };
      })
      .filter((r) => !onlyDifferences || r.aGranted !== r.bGranted)
      .filter((r) => !search.trim() || r.label.toLowerCase().includes(search.trim().toLowerCase()) || r.key.includes(search.trim().toLowerCase()));
  }, [permsA, permsB, onlyDifferences, search]);

  const roleAName = roles.find((r) => r.role_id === roleAId)?.role_name;
  const roleBName = roles.find((r) => r.role_id === roleBId)?.role_name;
  const diffCount = useMemo(() => {
    const byKeyA = new Map(permsA.map((p) => [p.perm_key, p.has_permission]));
    const byKeyB = new Map(permsB.map((p) => [p.perm_key, p.has_permission]));
    const allKeys = new Set([...byKeyA.keys(), ...byKeyB.keys()]);
    let count = 0;
    allKeys.forEach((k) => {
      if (!!byKeyA.get(k) !== !!byKeyB.get(k)) count += 1;
    });
    return count;
  }, [permsA, permsB]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compare Roles" size="2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Role A
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleAId ?? ''}
              onChange={(e) => setRoleAId(Number(e.target.value || 0) || null)}
            >
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Role B
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={roleBId ?? ''}
              onChange={(e) => setRoleBId(Number(e.target.value || 0) || null)}
            >
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
              ))}
            </select>
          </label>
        </div>

        {roleAId && roleBId && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search permissions..."
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={onlyDifferences}
                    onChange={(e) => setOnlyDifferences(e.target.checked)}
                  />
                  Differences only
                </label>
                <button
                  type="button"
                  onClick={loadBoth}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {diffCount} differing permission{diffCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2 font-semibold">Permission</th>
                    <th className="px-3 py-2 text-center font-semibold">{roleAName || 'Role A'}</th>
                    <th className="px-3 py-2 text-center font-semibold">{roleBName || 'Role B'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                        No {onlyDifferences ? 'differences' : 'permissions'} found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.key}
                        className={`border-t border-slate-100 dark:border-slate-800 ${
                          r.aGranted !== r.bGranted ? 'bg-amber-50/60 dark:bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{r.label}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{r.key}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.aGranted ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XIcon className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.bGranted ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XIcon className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
