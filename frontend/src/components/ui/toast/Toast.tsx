import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertTitle } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';

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

// Create a theme that adapts to dark mode
const theme = createTheme({
  palette: {
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  },
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, type, title, message };
    
    setToasts((prev) => [...prev, newToast]);

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
      <ThemeProvider theme={theme}>
        <div style={{ position: 'fixed', top: '80px', right: '16px', zIndex: 999999 }}>
          {toasts.map((toast, index) => (
            <Snackbar
              key={toast.id}
              open={true}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              style={{ 
                position: 'relative',
                marginBottom: index > 0 ? '8px' : '0',
                transform: 'none',
                top: `${index * 60}px`,
              }}
            >
              <Alert
                onClose={() => removeToast(toast.id)}
                severity={toast.type}
                variant="filled"
                sx={{
                  width: '100%',
                  minWidth: '280px',
                  maxWidth: '320px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  '& .MuiAlert-message': {
                    padding: '4px 0',
                    fontSize: '0.875rem',
                  },
                  '& .MuiAlert-action': {
                    padding: '0 0 0 8px',
                    marginRight: '-4px',
                  },
                  '& .MuiAlertTitle-root': {
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: toast.message ? '2px' : '0',
                    lineHeight: 1.4,
                  },
                }}
              >
                <AlertTitle>{toast.title}</AlertTitle>
                {toast.message && <div style={{ fontSize: '0.8125rem', lineHeight: 1.3 }}>{toast.message}</div>}
              </Alert>
            </Snackbar>
          ))}
        </div>
      </ThemeProvider>
    </ToastContext.Provider>
  );
};
