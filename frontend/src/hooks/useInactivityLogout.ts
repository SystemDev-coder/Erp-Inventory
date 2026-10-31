import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

const DEFAULT_TIMEOUT_MS = 60 * 1000;
const LOCKED_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY = "lastActivityTime";
const APP_LOCK_KEY = "app_lock";

const readLockTimestamp = (): number | null => {
  try {
    const raw = localStorage.getItem(APP_LOCK_KEY);
    if (!raw) return null;
    const lockedAt = Number(JSON.parse(raw)?.lockedAt || 0);
    return Number.isFinite(lockedAt) && lockedAt > 0 ? lockedAt : null;
  } catch {
    return null;
  }
};

const getOrSetLockTimestamp = (): number => {
  const existingTimestamp = readLockTimestamp();
  if (existingTimestamp) return existingTimestamp;

  // Locks created before this timeout existed do not have a timestamp. Give
  // those legacy locks a one-time start point so a reload cannot keep
  // extending the ten-minute window indefinitely.
  const startedAt = Date.now();
  try {
    const raw = localStorage.getItem(APP_LOCK_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      APP_LOCK_KEY,
      JSON.stringify({
        ...(existing && typeof existing === "object" ? existing : {}),
        lockedAt: startedAt,
      }),
    );
  } catch {
    // The current tab still enforces the timeout even if storage is corrupt
    // or unavailable; AuthContext will clear any stale lock on logout.
  }
  return startedAt;
};

/**
 * Idle LOCK (not logout): after `timeoutMs` of no user activity, lock the app
 * and redirect to /lock. The session (refresh token) stays valid, so unlock()
 * returns the user to where they were without re-login.
 *
 * The export name is kept as `useInactivityLogout` so App.tsx does not need
 * to change — only the behavior is now "lock" instead of "logout".
 */
export function useInactivityLogout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const { isAuthenticated, isLocked, lock, logout } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleLock = useCallback(() => {
    clearTimer();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    lock(); // ← lock, ma aha logout
  }, [clearTimer, lock]);

  const resetTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      handleLock();
    }, timeoutMs);
  }, [clearTimer, handleLock, timeoutMs]);

  useEffect(() => {
    // Don't run while logged out or already locked — the Lock page owns
    // its own unlock flow.
    if (!isAuthenticated || isLocked) {
      clearTimer();
      return;
    }

    // Cross-tab / reload check: if the last activity was already older than
    // the timeout (e.g. user closed the tab and came back), lock immediately.
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    if (last && now - last > timeoutMs) {
      handleLock();
      return;
    }

    const recordActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      resetTimer();
    };

    // Keep multiple tabs in sync: a storage event from another tab resets
    // (or triggers) the same idle timer here.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) return;
      const updated = Number(event.newValue);
      if (updated && Date.now() - updated > timeoutMs) {
        handleLock();
      } else {
        resetTimer();
      }
    };

    recordActivity();

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
    ];
    events.forEach((eventName) =>
      window.addEventListener(eventName, recordActivity, { passive: true })
    );
    window.addEventListener("storage", onStorage);

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, recordActivity)
      );
      window.removeEventListener("storage", onStorage);
      clearTimer();
    };
  }, [clearTimer, handleLock, isAuthenticated, isLocked, resetTimer, timeoutMs]);

  // A locked page must not keep a valid refresh token forever. The timestamp
  // is persisted by AuthContext so reloads and other tabs share the same
  // ten-minute limit. Focus/visibility checks cover paused background timers.
  useEffect(() => {
    if (!isAuthenticated || !isLocked) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let loggingOut = false;

    const endLockedSession = () => {
      if (loggingOut) return;
      loggingOut = true;
      void logout().finally(() => {
        window.location.replace("/signin");
      });
    };

    const scheduleLogout = () => {
      if (timer) clearTimeout(timer);
      const startedAt = getOrSetLockTimestamp();
      const remaining = LOCKED_SESSION_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        endLockedSession();
        return;
      }
      timer = setTimeout(endLockedSession, remaining);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_LOCK_KEY) scheduleLogout();
    };
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") scheduleLogout();
    };

    scheduleLogout();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [isAuthenticated, isLocked, logout]);
}
