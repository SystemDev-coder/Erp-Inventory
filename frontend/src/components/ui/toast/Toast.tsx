import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertTitle, Stack } from '@mui/material';
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

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const latest = toasts[toasts.length - 1] ?? null;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <ThemeProvider theme={theme}>
            <Snackbar
              open={Boolean(latest)}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              sx={{
                top: { xs: 16, sm: 24 },
                zIndex: (t) => t.zIndex.snackbar + 1000,
              }}
            >
              <Stack spacing={1} sx={{ width: '100%', maxWidth: 420, pointerEvents: 'auto' }}>
                {toasts.map((toast) => (
                  <Alert
                    key={toast.id}
                    severity={toast.type}
                    variant="standard"
                    onClose={() => removeToast(toast.id)}
                    sx={{
                      width: '100%',
                      minWidth: { xs: 280, sm: 360 },
                      boxShadow: 2,
                      alignItems: 'flex-start',
                    }}
                  >
                    <AlertTitle sx={{ mb: toast.message ? 0.5 : 0, fontWeight: 600, lineHeight: 1.3 }}>
                      {toast.title}
                    </AlertTitle>
                    {toast.message ? toast.message : null}
                  </Alert>
                ))}
              </Stack>
            </Snackbar>
          </ThemeProvider>,
          document.body
        )}
    </ToastContext.Provider>
  );
};
