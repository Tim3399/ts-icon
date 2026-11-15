import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Button } from "../primitives/Button";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** The confirm button gets the red fill: the only place one may appear. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled)";

/**
 * Primer Dialog / HIG alert: a modal box with a title, one message and two
 * buttons. Focus starts on Cancel, Tab stays inside, Escape and a click on
 * the scrim cancel, and focus returns to where it was. The confirm button of
 * a destructive dialog is the only red-filled button in the app.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open) return null;

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Tab") {
      const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className="ds-dialog-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="ds-dialog"
        onKeyDown={onKey}
      >
        <h2 id={titleId} className="ds-dialog-title">
          {title}
        </h2>
        <p id={messageId} className="ds-dialog-message">
          {message}
        </p>
        <div className="ds-dialog-actions">
          <Button ref={cancel} variant="gray" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {destructive ? (
            <button
              type="button"
              className="ds-button ds-button-confirm-destructive"
              data-destructive=""
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          ) : (
            <Button variant="prominent" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
