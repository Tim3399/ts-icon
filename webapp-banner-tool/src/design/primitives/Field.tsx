import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { FieldError } from "../components/FieldError";
import { fieldDescription } from "../internal/fieldDescription";
import "./Field.css";

interface FieldProps {
  id: string;
  /** Always rendered; `labelHidden` keeps it for assistive technology only. */
  label: ReactNode;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
}

function FieldFrame({
  id,
  label,
  labelHidden,
  hint,
  error,
  className,
  children,
}: FieldProps & { className?: string; children: ReactNode }) {
  return (
    <div className={`ds-field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className={labelHidden ? "ds-visually-hidden" : "ds-field-label"}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="ds-field-hint">
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

export type TextFieldProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
    type?: "text" | "url" | "number" | "search";
    /** Class for the field wrapper; the input itself is styled by the system. */
    className?: string;
  };

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, labelHidden, hint, error, className, type = "text", ...rest },
  ref,
) {
  return (
    <FieldFrame {...{ id, label, labelHidden, hint, error, className }}>
      <input
        ref={ref}
        id={id}
        type={type}
        className="ds-control"
        {...fieldDescription(id, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
});

export type TextAreaProps = FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { className?: string };

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { id, label, labelHidden, hint, error, className, ...rest },
  ref,
) {
  return (
    <FieldFrame {...{ id, label, labelHidden, hint, error, className }}>
      <textarea
        ref={ref}
        id={id}
        className="ds-control ds-control-multiline"
        {...fieldDescription(id, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
});

export type SelectProps = FieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & { className?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, labelHidden, hint, error, className, children, ...rest },
  ref,
) {
  return (
    <FieldFrame {...{ id, label, labelHidden, hint, error, className }}>
      <span className="ds-select">
        <select
          ref={ref}
          id={id}
          className="ds-control"
          {...fieldDescription(id, hint, error)}
          {...rest}
        >
          {children}
        </select>
      </span>
    </FieldFrame>
  );
});

export type CheckboxProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & { className?: string };

/** The whole row is the label, so the hit area is the row, not the 18 px box. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, labelHidden, hint, error, className, ...rest },
  ref,
) {
  return (
    <div className={`ds-field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="ds-checkbox">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="ds-checkbox-box"
          {...fieldDescription(id, hint, error)}
          {...rest}
        />
        <span className={labelHidden ? "ds-visually-hidden" : "ds-checkbox-text"}>{label}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="ds-field-hint">
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
});
