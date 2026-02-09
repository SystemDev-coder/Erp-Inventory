import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const LAST_ACTIVITY_KEY = "lastActivityTime";

export function useInactivityLogout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clearTimer();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    await logout();
    navigate("/signin", { replace: true });
  }, [clearTimer, logout, navigate]);

  const resetTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      void handleLogout();
    }, timeoutMs);
  }, [clearTimer, handleLogout, timeoutMs]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearTimer();
      return;
    }

    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    if (last && now - last > timeoutMs) {
      void handleLogout();
      return;
    }

    const recordActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      resetTimer();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) return;
      const updated = Number(event.newValue);
      if (updated && Date.now() - updated > timeoutMs) {
        void handleLogout();
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
  }, [clearTimer, handleLogout, isAuthenticated, resetTimer, timeoutMs]);
}

