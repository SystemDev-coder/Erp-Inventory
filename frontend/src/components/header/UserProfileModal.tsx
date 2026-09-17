import { useEffect, useState } from 'react';
import { Modal } from '../ui/modal/Modal';
import { profileService, Profile } from '../../services/profile.service';
import { useToast } from '../ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initial?: Profile | null;
}

export function UserProfileModal({ isOpen, onClose, initial }: Props) {
  const { showToast } = useToast();
  const { setUserState } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState<Partial<Profile>>({
    name: initial?.name || '',
    username: initial?.username || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(false);

  // The user object from AuthContext doesn't carry phone/email, so re-fetch the full
  // profile every time the modal opens instead of relying on the stale `initial` prop.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const res = await profileService.get();
      if (!cancelled && res.success && res.data?.profile) {
        const p = res.data.profile;
        setForm({ name: p.name || '', username: p.username || '', phone: p.phone || '', email: p.email || '' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const submit = async () => {
    setLoading(true);
    const res = await profileService.update(form);
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
    <Modal isOpen={isOpen} onClose={onClose} title={t('edit_profile')} size="md">
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('full_name')}
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('username')}
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.username || ''}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('email')}
          <input
            type="email"
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@example.com"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('phone')}
          <input
            className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+1 555 000 1234"
          />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('current_password')}
            <input
              type="password"
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              placeholder="Current password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('new_password')}
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
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('save_changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
