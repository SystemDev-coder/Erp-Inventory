
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Lock as LockIcon, LogOut, ArrowLeft } from 'lucide-react';
import { authService } from '../../services/auth.service';

const Lock = () => {
  const { lockedInfo, unlock, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!lockedInfo) {
      navigate('/', { replace: true });
    }
  }, [lockedInfo, navigate]);

  const [isSetup, setIsSetup] = useState(() => Boolean(lockedInfo?.hasLock));
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const isCreating = useMemo(() => !isSetup, [isSetup]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isCreating) {
      if (!password || password.length < 4) {
        setError('Lock password must be at least 4 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
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
        setError('Failed to save lock password');
        return;
      }
    }

    const res = await unlock(password);
    if (res.success) {
      const target = (location.state as any)?.from?.pathname || '/';
      navigate(target, { replace: true });
    } else {
      if ((res as any).error === 'Lock password not set') {
        setIsSetup(false);
        setError('No lock password set. Please create one.');
        return;
      }
      setError(res.error || (res as any).message || 'Invalid password');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/signin', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/60 border border-slate-700 shadow-2xl backdrop-blur">
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/20 text-primary-300">
            <LockIcon className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold">Session Locked</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isCreating ? 'Set a lock password to protect this session.' : 'Enter lock password to continue.'}
          </p>
          {lockedInfo && (
            <p className="mt-2 text-sm font-medium text-primary-200">{lockedInfo.name || lockedInfo.identifier}</p>
          )}
        </div>
        <form onSubmit={handleUnlock} className="px-8 pb-6 space-y-4">
          <div>
            <label className="text-sm text-slate-300 mb-1 block">Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/60"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {isCreating && (
              <>
                <label className="text-sm text-slate-300 mb-1 mt-3 block">Confirm Password</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/60"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </>
            )}
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <Link to="/signin" className="inline-flex items-center gap-1 hover:text-primary-300 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Switch account
            </Link>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
            >
              {isCreating ? (saving ? 'Saving...' : 'Save Lock') : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Lock;
