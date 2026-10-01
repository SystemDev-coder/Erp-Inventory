import { useEffect, useState } from 'react';
import { Modal } from '../ui/modal/Modal';
import { profileService, Profile } from '../../services/profile.service';
import { useLanguage } from '../../context/LanguageContext';
import { User } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function formatJoined(iso?: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function UserProfileViewModal({ isOpen, onClose }: Props) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await profileService.get();
      if (!cancelled) {
        if (res.success && res.data?.profile) setProfile(res.data.profile);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const rows: { label: string; value: string }[] = profile
    ? [
        { label: t('username'), value: profile.username || '-' },
        { label: t('email'), value: profile.email || '-' },
        { label: t('phone'), value: profile.phone || '-' },
        { label: t('role'), value: profile.role_name || '-' },
        { label: t('joined'), value: formatJoined(profile.created_at) },
      ]
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('profile_title')} size="sm">
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">...</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-black text-white dark:border-white/15 dark:bg-white dark:text-black">
              {profile?.name ? (
                <span className="text-lg font-semibold">{profile.name.charAt(0).toUpperCase()}</span>
              ) : (
                <User className="h-6 w-6" />
              )}
            </span>
            <div>
              <div className="text-base font-semibold text-slate-900 dark:text-white">{profile?.name || '-'}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{profile?.role_name || '-'}</div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
