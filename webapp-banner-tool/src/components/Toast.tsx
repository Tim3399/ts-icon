import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  /** Show a toast. Defaults to `variant: 'info'`, ~4s auto-dismiss. */
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const DEFAULT_DURATION_MS = 4000;

const VARIANT_STYLES: Record<ToastVariant, React.CSSProperties> = {
  success: { background: '#2e7d32', color: '#fff' },
  error: { background: '#c62828', color: '#fff' },
  info: { background: '#333', color: '#fff' },
};

const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => onDismiss(toast.id)}
          style={{
            ...VARIANT_STYLES[toast.variant],
            padding: '10px 14px',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs: number = DEFAULT_DURATION_MS) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (durationMs > 0) {
        setTimeout(() => dismissToast(id), durationMs);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
