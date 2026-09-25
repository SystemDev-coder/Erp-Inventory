import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 daqiiqo
const LAST_ACTIVITY_KEY = "lastActivityTime";

/**
 * Idle LOCK (not logout): after `timeoutMs` of no user activity, lock the app
 * and redirect to /lock. The session (refresh token) stays valid, so unlock()
 * returns the user to where they were without re-login.
 *
 * The export name is kept as `useInactivityLogout` so App.tsx does not need
 * to change — only the behavior is now "lock" instead of "logout".
 */
export function useInactivityLogout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const { isAuthenticated, isLocked, lock } = useAuth();
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
}