import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import {
  Lock as LockIcon,
  LogOut,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sun,
  Moon,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import { authService } from '../../services/auth.service';
import Footer from '../../layout/Footer';

// ─────────────────────────────────────────────────────────────────────────
// Bilingual support (English / Somali)
// ─────────────────────────────────────────────────────────────────────────
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
    logout: 'Logout',
    switchAccount: 'Switch account',
    or: 'or',
    language: 'Language',
    english: 'English',
    somali: 'Somali',
    errShortPassword: 'Lock password must be at least 4 characters.',
    errMismatch: 'Passwords do not match.',
    errSaveFailed: 'Failed to save lock password.',
    errNoLock: 'No lock password set. Please create one.',
    errInvalid: 'Invalid password.',
    securityNote: 'Your session is protected. Only you can unlock it.',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    changeLanguage: 'Change language',
    copyright: 'All rights reserved.',
    confirmLogoutTitle: 'Sign out?',
    confirmLogoutBody: 'You will be signed out and will need to log in again to continue.',
    confirmSwitchTitle: 'Switch account?',
    confirmSwitchBody: 'You will leave this locked session and return to the sign-in page.',
    confirmContinue: 'Continue',
    cancel: 'Cancel',
    confirmGenericTitle: 'Are you sure?',
    confirmGenericBody: 'Do you want to continue?',
    close: 'Close',
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
    logout: 'Ka Bax',
    switchAccount: 'Beddel Akoonka',
    or: 'ama',
    language: 'Luqadda',
    english: 'Ingiriisi',
    somali: 'Soomaali',
    errShortPassword: 'Furaha xidhitaanku waa inuu ka badan yahay 4 xaraf.',
    errMismatch: 'Furahaagu isku mid ma aha.',
    errSaveFailed: 'Kaydinta furaha xidhitaanka way fashilantay.',
    errNoLock: 'Furaha xidhitaan lama dejin. Fadlan abuur mid.',
    errInvalid: 'Furaha waa qaldan yahay.',
    securityNote: 'Sesshankaaga waa la ilaaliyaa. Adiga kaliya ayaad furi kartaa.',
    showPassword: 'Muuji furaha',
    hidePassword: 'Qari furaha',
    switchToLight: 'U beddel hab-iftiinka',
    switchToDark: 'U beddel hab-madow',
    changeLanguage: 'Beddel luqadda',
    copyright: 'Xuquuqda oo dhan way dhowran tahay.',
    confirmLogoutTitle: 'Ma rabtaa inaad ka baxdo?',
    confirmLogoutBody: 'Waa lagaa saarayaa oo waa inaad mar kale soo gashaa si aad u sii wadato.',
    confirmSwitchTitle: 'Ma rabtaa inaad beddesho akoonka?',
    confirmSwitchBody: 'Waxaad ka baxaysaa sesshankan xidhan oo waxaad ku noqonaysaa bogga gelitaanka.',
    confirmContinue: 'Sii wad',
    cancel: 'Jooji',
    confirmGenericTitle: 'Ma hubtaa?',
    confirmGenericBody: 'Ma rabtaa inaad sii wadato?',
    close: 'Xir',
  },
} as const;

const detectInitialLang = (): Lang => {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('app_lang');
  if (stored === 'en' || stored === 'so') return stored;
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('so')) return 'so';
  return 'en';
};

function useLang() {
  const [lang, setLang] = useState<Lang>(detectInitialLang);
  useEffect(() => {
    localStorage.setItem('app_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  return { lang, setLang, t: translations[lang] };
}

// ─────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────
type Theme = 'light' | 'dark';

const detectInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('app_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function useTheme() {
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('app_theme', theme);
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme((v) => (v === 'dark' ? 'light' : 'dark')),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Flags — cropped to fill a circle exactly.
// ─────────────────────────────────────────────────────────────────────────
function FlagUS({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      {/* Caddaan background */}
      <rect width="40" height="40" fill="#fff" />

      {/* 13 xariiqood oo casaan ah */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <rect key={i} y={i * 3.08} width="40" height="3.08" fill="#b22234" />
      ))}

      {/* Blue canton (geeska bidix-sare) */}
      <rect width="20" height="16.5" fill="#3c3b6e" />

      {/* Xiddigaha cad */}
      <g fill="#fff">
        {[3, 7, 11, 15, 17].map((x) =>
          [3, 7, 11, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />)
        )}
      </g>
    </svg>
  );
}

function FlagSO({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" fill="#4189dd" />
      <polygon
        fill="#fff"
        points="20,7 23.5,17.5 34,17.5 25.5,24 29,34.5 20,28 11,34.5 14.5,24 6,17.5 16.5,17.5"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────
function LockSkeleton() {
  return (
    <div className="w-full max-w-md" aria-hidden="true">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center">
          <div className="h-16 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="h-6 w-44 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/70" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/70" />
        </div>
        <div className="mt-7 space-y-4">
          <div>
            <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
          </div>
          <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="my-5 h-px w-full bg-slate-100 dark:bg-slate-800/70" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-9 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
          <div className="h-9 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
        </div>
      </div>
      <div className="mt-5 flex justify-center">
        <div className="h-3 w-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Confirm dialog
// ─────────────────────────────────────────────────────────────────────────
type ConfirmKind = 'logout' | 'switch' | null;

function ConfirmDialog({
  kind,
  onCancel,
  onConfirm,
  t,
}: {
  kind: ConfirmKind;
  onCancel: () => void;
  onConfirm: () => void;
  t: typeof translations['en'];
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = kind !== null;

  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const title = kind === 'logout' ? t.confirmLogoutTitle : t.confirmSwitchTitle;
  const body = kind === 'logout' ? t.confirmLogoutBody : t.confirmSwitchBody;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        onClick={onCancel}
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/70"
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t.close}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 id="confirm-title" className="text-center text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <p id="confirm-body" className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          {body}
        </p>
        <div className="mt-6 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900"
          >
            {t.confirmContinue}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Min duration — prevent spinner flash
// ─────────────────────────────────────────────────────────────────────────
const MIN_ACTION_MS = 350;
const withMinDuration = async <T,>(promise: Promise<T>, minMs = MIN_ACTION_MS): Promise<T> => {
  const startedAt = Date.now();
  const result = await promise;
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
  return result;
};

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────
const Lock = () => {
  const { lockedInfo, unlock, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmKind>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const submitLockRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { lang, setLang, t } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();

  const [isSetup, setIsSetup] = useState(() => Boolean(lockedInfo?.hasLock));
  const isCreating = useMemo(() => !isSetup, [isSetup]);
  const busy = saving || submitting;

  useEffect(() => {
    const timer = setTimeout(() => setIsBootstrapping(false), 250);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!lockedInfo) {
      navigate('/', { replace: true });
    }
  }, [lockedInfo, navigate]);

  useEffect(() => {
    if (!langOpen) return;
    const onClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [langOpen]);

  const initials = useMemo(() => {
    const name = (lockedInfo?.name || lockedInfo?.identifier || '').trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [lockedInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    setError('');

    try {
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
          await withMinDuration(authService.setLockPassword(password));
          const payload = { ...(lockedInfo || { identifier: '' }), hasLock: true };
          localStorage.setItem('app_lock', JSON.stringify(payload));
          setIsSetup(true);
          setError('');
          setPassword('');
          setConfirm('');
          return;
        } catch {
          setError(t.errSaveFailed);
          return;
        } finally {
          setSaving(false);
        }
      }

      try {
        setSubmitting(true);
        const res = await withMinDuration(unlock(password));
        if (res.success) {
          const target = (location.state as any)?.from?.pathname || '/';
          navigate(target, { replace: true });
          return;
        }
        if ((res as any).error === 'Lock password not set') {
          setIsSetup(false);
          setError(t.errNoLock);
          return;
        }
        setError(res.error || (res as any).message || t.errInvalid);
      } catch {
        setError(t.errInvalid);
      } finally {
        setSubmitting(false);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const performLogout = async () => {
    setConfirmAction(null);
    await logout();
    navigate('/signin', { replace: true });
  };

  const performSwitch = () => {
    setConfirmAction(null);
    navigate('/signin', { replace: true });
  };

  const requestLogout = () => setConfirmAction('logout');
  const requestSwitch = (e: React.MouseEvent) => {
    e.preventDefault();
    setConfirmAction('switch');
  };

  // ── Shared circular button class for the top-right controls ────────
  // Both the theme toggle and language button use the same shape, size,
  // and border, so they read as a matched pair. The language button lets
  // the flag fill the entire circle (no inner padding), matching the
  // screenshot reference.
  const circleButtonClass =
    'group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ' +
    'border border-slate-200 bg-white text-slate-600 shadow-sm transition-all ' +
    'hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ' +
    'dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white ' +
    'dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 py-16 dark:bg-slate-950">
      {/* Ambient glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-500/5" />
      </div>

      {/* Top-right controls — theme toggle + language picker */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t.switchToLight : t.switchToDark}
          title={theme === 'dark' ? t.switchToLight : t.switchToDark}
          className={circleButtonClass}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Language picker */}
        <div ref={langMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            aria-label={t.changeLanguage}
            aria-haspopup="menu"
            aria-expanded={langOpen}
            title={t.changeLanguage}
            className={circleButtonClass + (langOpen ? ' ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-50 dark:ring-blue-400 dark:ring-offset-slate-950' : '')}
          >
            {/* The flag fills the entire circle — no padding, no inner ring. */}
            {lang === 'en' ? (
              <FlagUS className="absolute inset-0 h-full w-full" />
            ) : (
              <FlagSO className="absolute inset-0 h-full w-full" />
            )}
          </button>

          {langOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5"
            >
              <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t.language}
              </div>

              <button
                type="button"
                role="menuitemradio"
                aria-checked={lang === 'en'}
                onClick={() => {
                  setLang('en');
                  setLangOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15">
                  <FlagUS className="absolute inset-0 h-full w-full" />
                </span>
                <span>{t.english}</span>
                {lang === 'en' && <Check className="ml-auto h-4 w-4 text-blue-500" />}
              </button>

              <button
                type="button"
                role="menuitemradio"
                aria-checked={lang === 'so'}
                onClick={() => {
                  setLang('so');
                  setLangOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15">
                  <FlagSO className="absolute inset-0 h-full w-full" />
                </span>
                <span>{t.somali}</span>
                {lang === 'so' && <Check className="ml-auto h-4 w-4 text-blue-500" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card */}
      {isBootstrapping ? (
        <LockSkeleton />
      ) : (
        <div className="relative z-0 w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-semibold text-white shadow-md">
                  {initials}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-sm dark:border-slate-900 dark:bg-slate-100 dark:text-slate-900">
                  <LockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
            </div>

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

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
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
                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

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
                      aria-label={showConfirm ? t.hidePassword : t.showPassword}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !password}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-blue-600/50 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900 dark:disabled:bg-blue-500/40"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {isCreating ? t.saving : t.unlocking}
                  </>
                ) : (
                  <>
                    <LockIcon className="h-4 w-4" aria-hidden="true" />
                    {isCreating ? t.saveLock : t.unlock}
                  </>
                )}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t.or}
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/signin"
                onClick={requestSwitch}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t.switchAccount}
              </Link>
              <button
                type="button"
                onClick={requestLogout}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                {t.logout}
              </button>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-400 dark:text-slate-500">
            {t.securityNote}
          </p>
        </div>
      )}

      {/* Footer */}
      <Footer />

      {/* Confirm dialog */}
      <ConfirmDialog
        kind={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmAction === 'logout' ? performLogout : performSwitch}
        t={t}
      />
    </div>
  );
};

export default Lock;