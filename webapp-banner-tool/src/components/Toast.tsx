import React, { useCallback, useRef, useState, useEffect } from "react";

import { ToastContext, type ToastVariant } from "./ToastContext";
import Icon, { type IconName } from "./ui/Icon";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const DEFAULT_DURATION_MS = 4000;

const VARIANT_ICONS: Record<ToastVariant, IconName> = {
  success: "check",
  error: "alert",
  info: "info",
};

const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: number) => void }> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-region">
      {toasts.map((toast) => (
        <div key={toast.id} role="status" className={`toast toast-${toast.variant}`}>
          <Icon name={VARIANT_ICONS[toast.variant]} size={17} className="toast-icon" />
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <Icon name="close" size={14} />
          </button>
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
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", durationMs: number = DEFAULT_DURATION_MS) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (durationMs > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismissToast(id), durationMs),
        );
      }
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
