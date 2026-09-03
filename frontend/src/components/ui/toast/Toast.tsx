import React, { createContext, useContext, useState, useCallback } from 'react';
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

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        toasts.length > 0 &&
        createPortal(
          <ThemeProvider theme={theme}>
            <div
              role="presentation"
              style={{
                position: 'fixed',
                top: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2147483646,
                width: 'min(92vw, 420px)',
                pointerEvents: 'none',
              }}
            >
              <Stack spacing={1} sx={{ width: '100%', pointerEvents: 'auto' }}>
                {toasts.map((toast) => (
                  <Alert
                    key={toast.id}
                    severity={toast.type}
                    variant="standard"
                    onClose={() => removeToast(toast.id)}
                    sx={{
                      width: '100%',
                      boxShadow: 3,
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
            </div>
          </ThemeProvider>,
          document.body
        )}
    </ToastContext.Provider>
  );
};
