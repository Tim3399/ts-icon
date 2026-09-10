import { useCallback, useEffect, useState } from "react";
import { ApiError, describeApiError } from "../api/client";

export type FieldMessages = Record<string, string>;

function apiFields(error: unknown): FieldMessages {
  if (
    !(error instanceof ApiError) ||
    !error.status ||
    error.status >= 500 ||
    [401, 403, 429].includes(error.status)
  )
    return {};
  return Object.fromEntries(
    Object.entries(error.fieldErrors ?? {})
      .map(([key, messages]) => [key, messages.join(" ").trim()])
      .filter(([, message]) => Boolean(message)),
  );
}

/** File-only upload endpoints can also return parser/decode errors without a DTO. */
export function uploadFieldError(error: unknown): string {
  const fields = apiFields(error);
  if (fields.file) return fields.file;
  return error instanceof ApiError && [413, 415, 422].includes(error.status ?? 0)
    ? describeApiError(error, "This image cannot be uploaded. Choose another file.")
    : "";
}

export function fieldAttributes(id: string, message?: string) {
  return {
    "aria-invalid": message ? true : undefined,
    "aria-describedby": message ? `${id}-error` : undefined,
  } as const;
}

export function useFieldErrors(ids: Record<string, string>, disabled = false) {
  const [errors, setErrors] = useState<FieldMessages>({});
  const [focus, setFocus] = useState<{ field: string } | null>(null);
  const focusFirst = useCallback(
    (messages: FieldMessages) => {
      const field = Object.keys(ids).find((key) => messages[key]);
      if (field) setFocus({ field });
    },
    [ids],
  );
  useEffect(() => {
    if (!focus || disabled) return;
    const element = document.getElementById(ids[focus.field]);
    if (!element || ("disabled" in element && element.disabled)) return;
    element.focus();
    setFocus(null);
  }, [focus, disabled, ids]);
  const clear = useCallback((field?: string) => {
    setFocus((previous) => (!field || previous?.field === field ? null : previous));
    setErrors((previous) => {
      if (!field) return {};
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }, []);
  const receive = useCallback(
    (error: unknown) => {
      const received = apiFields(error);
      const known = Object.fromEntries(
        Object.entries(received).filter(([key]) => Object.prototype.hasOwnProperty.call(ids, key)),
      );
      if (!Object.keys(known).length) return false;
      setErrors(known);
      focusFirst(known);
      // Keep a general message if the server also reports a field not in this form.
      return Object.keys(known).length === Object.keys(received).length;
    },
    [ids, focusFirst],
  );
  const report = useCallback(
    (field: string, message: string) => {
      setErrors((previous) => ({ ...previous, [field]: message }));
      focusFirst({ [field]: message });
    },
    [focusFirst],
  );
  return { errors, clear, receive, report, focusFirst };
}
