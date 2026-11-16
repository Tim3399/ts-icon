import type { ReactNode } from "react";

/** Wires hint and error to a control the same way for every field type. */
export function fieldDescription(id: string, hint?: ReactNode, error?: string) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}
