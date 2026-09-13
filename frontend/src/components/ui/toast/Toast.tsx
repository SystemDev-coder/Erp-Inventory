import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Alert, AlertTitle, Stack } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);
const TOAST_ROOT_ID = 'erp-toast-root';
const PAGE_ALERTS_ID = 'erp-page-alerts';

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

const theme = createTheme({
  palette: {
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  },
});

function getToastRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TOAST_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function getToastTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(PAGE_ALERTS_ID) || getToastRoot();
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastTarget, setToastTarget] = useState<HTMLElement | null>(() => getToastTarget());
  const timeoutIds = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setToastTarget(getToastTarget());
  }, []);

  useEffect(() => {
    const timeouts = timeoutIds.current;
    return () => {
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, []);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timeoutIds.current.delete(id);
    }, 5000);
    timeoutIds.current.set(id, timeoutId);
  }, []);

  const removeToast = (id: string) => {
    const timeoutId = timeoutIds.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutIds.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toastTarget &&
        toasts.length > 0 &&
        createPortal(
          <ThemeProvider theme={theme}>
            <div
              role="status"
              className={toastTarget.id === PAGE_ALERTS_ID ? 'erp-page-alert-stack' : 'erp-toast-portal'}
            >
              <Stack spacing={1} sx={{ width: '100%' }}>
                {toasts.map((toast) => (
                  <Alert
                    key={toast.id}
                    severity={toast.type}
                    variant="standard"
                    onClose={() => removeToast(toast.id)}
                    className="erp-toast-item"
                    sx={{
                      width: '100%',
                      boxShadow: 6,
                      alignItems: 'flex-start',
                      pointerEvents: 'auto',
                    }}
                  >
                    <AlertTitle sx={{ mb: toast.message ? 0.5 : 0, fontWeight: 600, lineHeight: 1.3 }}>
                      {toast.title}
                    </AlertTitle>
                    {toast.message ? toast.message : null}
                  </Alert>
                ))}
              </Stack>
            </div>
          </ThemeProvider>,
          toastTarget
        )}
    </ToastContext.Provider>
  );
};
