import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
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
  /**
   * Moves the focus after Confirm, for an action that disables or removes
   * the control that opened the dialog. Without it, and always after Cancel,
   * the focus returns to where it was.
   */
  focusAfterConfirm?: () => void;
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
  focusAfterConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  const afterConfirm = useRef(focusAfterConfirm);
  afterConfirm.current = focusAfterConfirm;

  // A layout effect, so the focus has moved before the page's own layout
  // effects (useFocusFallback) look at it.
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    confirmed.current = false;
    cancel.current?.focus();
    return () => {
      if (confirmed.current && afterConfirm.current) afterConfirm.current();
      else previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const confirm = () => {
    confirmed.current = true;
    onConfirm();
  };

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
              onClick={confirm}
            >
              {confirmLabel}
            </button>
          ) : (
            <Button variant="prominent" onClick={confirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
