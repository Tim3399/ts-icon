import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Keeps the keyboard focus on the page while an action runs (V-0.12.0-F4).
 * Between `hold()` and the render after `release()`, a render that leaves
 * the focus on the page body (the focused control or the whole table was
 * removed) moves it to the element `fallback` returns. DataTable already
 * moves the focus to the table when only a row goes; this covers the table
 * itself going.
 *
 * `release()` takes effect after the next render, because the updates that
 * end an action (its result, the reload) may be rendered together with the
 * state change that follows it; the caller changes state when it releases.
 */
export function useFocusFallback(fallback: () => HTMLElement | null | undefined) {
  const holds = useRef(0);
  const releases = useRef(0);
  const target = useRef(fallback);
  target.current = fallback;
  useLayoutEffect(() => {
    if (holds.current === 0) return;
    const active = document.activeElement;
    if (!active || active === document.body) target.current()?.focus();
    holds.current = Math.max(0, holds.current - releases.current);
    releases.current = 0;
  });
  const hold = useCallback(() => {
    holds.current += 1;
  }, []);
  const release = useCallback(() => {
    releases.current += 1;
  }, []);
  return { hold, release };
}
