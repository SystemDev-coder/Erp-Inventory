import { useState } from 'react';
import { Modal } from '../ui/modal/Modal';
import { profileService, Profile } from '../../services/profile.service';
import { useToast } from '../ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initial?: Profile | null;
}

export function UserProfileModal({ isOpen, onClose, initial }: Props) {
  const { showToast } = useToast();
  const { setUserState } = useAuth();
  const [form, setForm] = useState<Partial<Profile>>({
    name: initial?.name || '',
    username: initial?.username || '',
    phone: initial?.phone || '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    const res = await profileService.update(form);
    setLoading(false);
    if (res.success && res.data?.profile) {
      setUserState({
        ...res.data.profile,
        role_name: res.data.profile.role_name || initial?.role_name,
      } as any);
      showToast('success', 'Profile updated');
    } else {
      showToast('error', 'Update failed', res.error || 'Check the form');
      setLoading(false);
      return;
    }
    if (passwords.currentPassword || passwords.newPassword) {
      const passRes = await profileService.updatePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      if (passRes.success) {
        showToast('success', 'Password updated');
      } else {
        showToast('error', 'Password update failed', passRes.error || 'Check the passwords');
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit profile" size="md">
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          Name
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          Username
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.username || ''}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          Phone
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+1 555 000 1234"
          />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Current password
            <input
              type="password"
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              placeholder="Current password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            New password
            <input
              type="password"
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              placeholder="New password"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
