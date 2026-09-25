import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Lock as LockIcon, LogOut, ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/auth.service';

// ─────────────────────────────────────────────────────────────
// Simple bilingual support (English / Somali).
// Reads the current language from localStorage (key: 'app_lang'),
// falling back to the browser's language, then to English.
// A tiny toggle is rendered so the user can switch at any time.
// ─────────────────────────────────────────────────────────────
type Lang = 'en' | 'so';

const translations = {
  en: {
    sessionLocked: 'Session Locked',
    setLockPassword: 'Set Lock Password',
    enterPassword: 'Enter your password to continue.',
    setPasswordHint: 'Choose a password to protect this session.',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    confirmPassword: 'Confirm Password',
    confirmPlaceholder: 'Re-enter your password',
    unlock: 'Unlock',
    unlocking: 'Unlocking…',
    saveLock: 'Save Lock',
    saving: 'Saving…',
    loggingOut: 'Logging out…',
    logout: 'Logout',
    switchAccount: 'Switch account',
    or: 'or',
    welcomeBack: 'Welcome back',
    errShortPassword: 'Lock password must be at least 4 characters.',
    errMismatch: 'Passwords do not match.',
    errSaveFailed: 'Failed to save lock password.',
    errNoLock: 'No lock password set. Please create one.',
    errInvalid: 'Invalid password.',
    securityNote: 'Your session is protected. Only you can unlock it.',
  },
  so: {
    sessionLocked: 'Sesshanka Waa La Xidhay',
    setLockPassword: 'Deji Furaha Xidhitaanka',
    enterPassword: 'Geli furahaaga si aad u sii wadato.',
    setPasswordHint: 'Dooro furaha si aad u ilaaliso sesshankan.',
    password: 'Furaha',
    passwordPlaceholder: 'Geli furahaaga',
    confirmPassword: 'Xaqiiji Furaha',
    confirmPlaceholder: 'Mar kale geli furahaaga',
    unlock: 'Fur',
    unlocking: 'Waa la furayaa…',
    saveLock: 'Kaydi Furaha',
    saving: 'Waa la kaydinayaa…',
    loggingOut: 'Waa la baxayaa…',
    logout: 'Ka Bax',
    switchAccount: 'Beddel Akoonka',
    or: 'ama',
    welcomeBack: 'Ku soo dhawoow',
    errShortPassword: 'Furaha xidhitaanku waa inuu ka badan yahay 4 xaraf.',
    errMismatch: 'Furahaagu isku mid ma aha.',
    errSaveFailed: 'Kaydinta furaha xidhitaanka way fashilantay.',
    errNoLock: 'Furaha xidhitaan lama dejin. Fadlan abuur mid.',
    errInvalid: 'Furaha waa qaldan yahay.',
    securityNote: 'Sesshankaaga waa la ilaaliyaa. Adiga kaliya ayaad furi kartaa.',
  },
} as const;

const detectInitialLang = (): Lang => {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('app_lang');
  if (stored === 'en' || stored === 'so') return stored;
  const nav = navigator.language?.toLowerCase() || '';
  if (nav.startsWith('so')) return 'so';
  return 'en';
};

function useLang() {
  const [lang, setLang] = useState<Lang>(detectInitialLang);
  useEffect(() => {
    localStorage.setItem('app_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = translations[lang];
  return { lang, setLang, t };
}

const Lock = () => {
  const { lockedInfo, unlock, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    if (!lockedInfo) {
      navigate('/', { replace: true });
    }
  }, [lockedInfo, navigate]);

  const [isSetup, setIsSetup] = useState(() => Boolean(lockedInfo?.hasLock));
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const isCreating = useMemo(() => !isSetup, [isSetup]);

  // Initials for avatar
  const initials = useMemo(() => {
    const name = lockedInfo?.name || lockedInfo?.identifier || '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [lockedInfo]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isCreating) {
      if (!password || password.length < 4) {
        setError(t.errShortPassword);
        return;
      }
      if (password !== confirm) {
        setError(t.errMismatch);
        return;
      }
      try {
        setSaving(true);
        await authService.setLockPassword(password);
        const payload = { ...(lockedInfo || { identifier: '' }), hasLock: true };
        localStorage.setItem('app_lock', JSON.stringify(payload));
        setSaving(false);
        setIsSetup(true);
        setError('');
        setPassword('');
        setConfirm('');
        return;
      } catch (err) {
        setSaving(false);
        setError(t.errSaveFailed);
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await unlock(password);
      setSubmitting(false);
      if (res.success) {
        const target = (location.state as any)?.from?.pathname || '/';
        navigate(target, { replace: true });
      } else {
        if ((res as any).error === 'Lock password not set') {
          setIsSetup(false);
          setError(t.errNoLock);
          return;
        }
        setError(res.error || (res as any).message || t.errInvalid);
      }
    } catch {
      setSubmitting(false);
      setError(t.errInvalid);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/signin', { replace: true });
  };

  const busy = submitting || saving;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-slate-950">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-500/5" />
      </div>

      {/* Language toggle (top-right) */}
      <div className="absolute right-4 top-4 z-10">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={
              'px-3 py-1.5 transition-colors ' +
              (lang === 'en'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')
            }
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('so')}
            className={
              'px-3 py-1.5 transition-colors ' +
              (lang === 'so'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')
            }
          >
            SO
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="relative z-0 w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
          {/* Avatar + Lock badge */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-semibold text-white shadow-md dark:from-blue-500 dark:to-blue-700">
                {initials}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm dark:border-slate-900 dark:bg-slate-100 dark:text-slate-900">
                <LockIcon className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Heading */}
          <div className="mt-5 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {isCreating ? t.setLockPassword : t.sessionLocked}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {isCreating ? t.setPasswordHint : t.enterPassword}
            </p>
            {lockedInfo && (
              <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {lockedInfo.name || lockedInfo.identifier}
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleUnlock} className="mt-7 space-y-4">
            {/* Password */}
            <div>
              <label
                htmlFor="lock-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                {t.password}
              </label>
              <div className="relative">
                <LockIcon
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="lock-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  autoFocus
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  className={
                    'w-full rounded-xl border bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 ' +
                    'focus:ring-2 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
                    (error
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/25 dark:border-slate-700 dark:focus:border-blue-400 dark:focus:ring-blue-400/25') +
                    ' disabled:cursor-not-allowed disabled:opacity-60'
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm (create mode only) */}
            {isCreating && (
              <div>
                <label
                  htmlFor="lock-confirm"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                >
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <ShieldCheck
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="lock-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={t.confirmPlaceholder}
                    autoComplete="new-password"
                    required
                    disabled={busy}
                    className={
                      'w-full rounded-xl border bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 ' +
                      'focus:ring-2 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
                      (error
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/25 dark:border-slate-700 dark:focus:border-blue-400 dark:focus:ring-blue-400/25') +
                      ' disabled:cursor-not-allowed disabled:opacity-60'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Primary CTA */}
            <button
              type="submit"
              disabled={busy || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-blue-600/50 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900 dark:disabled:bg-blue-500/40"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isCreating ? t.saving : t.unlocking}
                </>
              ) : (
                <>
                  <LockIcon className="h-4 w-4" />
                  {isCreating ? t.saveLock : t.unlock}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t.or}
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Secondary actions */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/signin"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.switchAccount}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.logout}
            </button>
          </div>
        </div>

        {/* Security note */}
        <p className="mt-5 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {t.securityNote}
        </p>
      </div>
    </div>
  );
};

export default Lock;