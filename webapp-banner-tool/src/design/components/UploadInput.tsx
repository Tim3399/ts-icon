import { useEffect, useRef, useState } from "react";
// Product import, allowed for this component only (README, "Layers"): a pure,
// non-visual file check shared with the gallery's own drop handling.
import { imageFileError } from "../../api/image-file";
import { fieldDescription } from "../internal/fieldDescription";
import { Icon } from "../primitives/Icon";
import { FieldError } from "./FieldError";
import "./UploadInput.css";

export function UploadInput({
  id,
  onFile,
  disabled = false,
  label = "Drag & drop an image here, or click to browse",
  hint = "PNG, JPEG or WebP, up to 10 MB",
  compact = false,
  error: externalError = "",
  resetKey = 0,
}: {
  id: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  /** Dense variant for use inside a channel card. */
  compact?: boolean;
  error?: string;
  /** Increment when the parent accepts a source outside this input. */
  resetKey?: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [validation, setValidation] = useState({ resetKey, message: "" });
  const input = useRef<HTMLInputElement>(null);
  const message = (validation.resetKey === resetKey ? validation.message : "") || externalError;
  useEffect(() => {
    if (message && !disabled) input.current?.focus();
  }, [message, disabled]);
  const select = (file?: File) => {
    if (disabled || !file) return;
    const issue = imageFileError(file);
    setValidation({ resetKey, message: issue || "" });
    if (!issue) onFile(file);
  };
  return (
    <div className="ds-field">
      {/* The real <input type=file> stays in the DOM, focusable and
          keyboard-operable -- it is only visually covered by the label, never
          display:none. `pointer-events: none` (UploadInput.css) keeps a drop
          landing on the label's handler exactly once instead of also being
          handled natively by the input underneath it. The label is the hit
          area (at least 44 x 44 px). */}
      <label
        className={[
          "ds-dropzone",
          compact ? "ds-dropzone-compact" : "",
          dragOver ? "ds-dropzone-drag-over" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          // Containers can carry their own drop target (a channel card wraps
          // this input); without this the same file would be handled twice.
          e.stopPropagation();
          setDragOver(false);
          select(e.dataTransfer.files?.[0]);
        }}
      >
        <Icon name="upload" size={compact ? 15 : 19} className="ds-dropzone-icon" />
        <span className="ds-dropzone-label">{label}</span>
        {hint && <span className="ds-dropzone-meta">{hint}</span>}
        <input
          id={id}
          ref={input}
          type="file"
          className="ds-dropzone-input"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          {...fieldDescription(id, undefined, message)}
          onChange={(e) => {
            select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <FieldError id={id} message={message} />
    </div>
  );
}
