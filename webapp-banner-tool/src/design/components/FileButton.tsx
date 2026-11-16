import { useEffect, useId, useRef } from "react";
import { fieldDescription } from "../internal/fieldDescription";
import { FieldError } from "./FieldError";
import "../primitives/Button.css";
import "./FileButton.css";

interface FileButtonProps {
  label?: string;
  /** Accessible name when the visible label is not specific enough. */
  "aria-label"?: string;
  onFile: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  /**
   * An operation runs: the button looks and reads as unavailable
   * (aria-disabled) and the picker does not open, but the input keeps the
   * keyboard focus, which `disabled` would drop to the page (V-0.12.0-F4).
   */
  busy?: boolean;
  id?: string;
  /**
   * A rejected file's message. While set, it shows under the button, the
   * input is aria-invalid and described by it, and the input takes focus
   * (as in UploadInput). The parent clears it.
   */
  error?: string;
}

/**
 * A gray button that opens the file picker. The real file input sits inside
 * the label (visually hidden, still focusable and keyboard-operable), so the
 * label is the hit area. This and UploadInput are the only places an
 * `input[type=file]` may be rendered (T-142-F1 item 11).
 */
export function FileButton({
  label = "Replace…",
  "aria-label": ariaLabel,
  onFile,
  accept = "image/png,image/jpeg,image/webp",
  disabled = false,
  busy = false,
  id,
  error,
}: FileButtonProps) {
  const unavailable = disabled || busy;
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !disabled) input.current?.focus();
  }, [error, disabled]);
  return (
    <>
      <label
        className="ds-button ds-button-gray ds-file-button"
        data-variant="gray"
        aria-disabled={unavailable || undefined}
      >
        {label}
        <input
          ref={input}
          id={inputId}
          type="file"
          className="ds-file-button-input"
          accept={accept}
          disabled={disabled}
          aria-disabled={busy || undefined}
          aria-label={ariaLabel}
          {...fieldDescription(inputId, undefined, error)}
          onClick={busy ? (event) => event.preventDefault() : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file && !busy) onFile(file);
          }}
        />
      </label>
      <FieldError id={inputId} message={error} />
    </>
  );
}
