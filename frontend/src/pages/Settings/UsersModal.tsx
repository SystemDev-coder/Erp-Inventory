import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { Branch } from '../../services/settings.service';
import { RoleRow, UserRow } from '../../services/user.service';

type UserForm = {
  name: string;
  username: string;
  password: string;
  role_id: number | '';
  branch_id: number | '';
  is_active: boolean;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: UserForm) => void;
  form: UserForm;
  setForm: (f: UserForm) => void;
  roles: RoleRow[];
  branches: Branch[];
  editing?: UserRow | null;
}

const UsersModal = ({ isOpen, onClose, onSave, form, setForm, roles, branches, editing }: Props) => {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { setShowPassword(false); }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit User' : 'New User'}>
      <div className="space-y-4">
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Name
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Username
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Role
            <select
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Select role</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Branch
            <select
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Password {editing && <span className="text-xs text-slate-500">(leave blank to keep)</span>}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 pr-16"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing ? '••••••••' : 'Set password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4 accent-primary-600"
          />
          Active
        </label>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UsersModal;
