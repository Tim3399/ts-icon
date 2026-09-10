import Icon from "./ui/Icon";

// Field-level problems read as a compact line attached to their control (the
// control points at this element with aria-describedby), not as a full-width
// alert box -- a banner per field drowned the form it was meant to correct.
export default function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} className="field-error" role="alert">
      <Icon name="alert" size={14} />
      <span>{message}</span>
    </p>
  ) : null;
}
