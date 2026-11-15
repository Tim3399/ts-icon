import { Icon } from "../primitives/Icon";
import "./Feedback.css";

// Field-level problems read as a compact line attached to their control (the
// control points at this element with aria-describedby), not as a full-width
// alert box -- a banner per field drowned the form it was meant to correct.
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} className="ds-field-error" role="alert">
      <Icon name="alert" size={14} />
      <span>{message}</span>
    </p>
  ) : null;
}
