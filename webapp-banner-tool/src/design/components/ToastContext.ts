import { createContext, useContext } from "react";
export type ToastVariant = "success" | "error" | "info";
interface ToastContextType {
  /** Show a toast. Defaults to `variant: 'info'`, ~4s auto-dismiss. */
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);
