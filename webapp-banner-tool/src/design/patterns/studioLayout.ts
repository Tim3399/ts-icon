import { useSyncExternalStore } from "react";

/**
 * Breakpoints of the Studio layout (T-142-F3 R2). README, "Studio shell".
 * - from 1240 px: three panels (layers, main, inspector);
 * - 1024-1239 px: the layer panel is an overlay drawer behind a top-bar toggle;
 * - below 1024 px: stacked (top bar, main, inspector, layers).
 * StudioShell.css repeats both widths; testing/layout.test.ts keeps them in step.
 */
export const STUDIO_WIDE_QUERY = "(min-width: 1240px)";
export const STUDIO_DESKTOP_QUERY = "(min-width: 1024px)";
export const STUDIO_LAYERS_ID = "studio-layers";

export type StudioLayout = "wide" | "drawer" | "stacked";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const queries = [STUDIO_WIDE_QUERY, STUDIO_DESKTOP_QUERY].map((q) => window.matchMedia(q));
  queries.forEach((q) => q.addEventListener("change", listener));
  return () => queries.forEach((q) => q.removeEventListener("change", listener));
}

// Without matchMedia (jsdom) the layout counts as wide: every panel shown.
function readLayout(): StudioLayout {
  if (typeof window.matchMedia !== "function") return "wide";
  if (window.matchMedia(STUDIO_WIDE_QUERY).matches) return "wide";
  return window.matchMedia(STUDIO_DESKTOP_QUERY).matches ? "drawer" : "stacked";
}

/** The current Studio layout, following the viewport. */
export function useStudioLayout(): StudioLayout {
  return useSyncExternalStore(subscribe, readLayout, () => "wide");
}
