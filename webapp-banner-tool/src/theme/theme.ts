import { useCallback, useSyncExternalStore } from "react";

// Appearance is a single module-level store rather than a React context: it
// has exactly one writer (the header toggle), it has to be readable before
// React mounts (index.html applies the stored choice to <html> to avoid a
// light flash on a dark-themed load), and keeping it provider-free means
// components and their tests can use it without extra wrapping.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Also read by the bootstrap snippet in index.html -- keep the two in sync. */
export const THEME_STORAGE_KEY = "ts-icon-theme";

const listeners = new Set<() => void>();

const darkQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function readStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* Storage can be unavailable (private mode, blocked cookies); "system" is
       a correct fallback, so this is not worth surfacing to the user. */
  }
  return "system";
}

let preference: ThemePreference = readStoredPreference();

function resolve(value: ThemePreference): ResolvedTheme {
  if (value !== "system") return value;
  return darkQuery?.matches ? "dark" : "light";
}

function applyToDocument() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // "system" deliberately stamps no attribute, so the media query in
  // tokens.css is what decides -- including when the OS switches at runtime.
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

function emit() {
  for (const listener of listeners) listener();
}

// A single string snapshot keeps useSyncExternalStore's identity check cheap
// and correct: it changes when the choice changes and when the system theme
// flips underneath a "system" preference.
function snapshot(): `${ThemePreference}:${ResolvedTheme}` {
  return `${preference}:${resolve(preference)}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

darkQuery?.addEventListener?.("change", emit);

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* The choice still applies for this session. */
  }
  applyToDocument();
  emit();
}

export const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [storedPreference, resolved] = value.split(":") as [ThemePreference, ResolvedTheme];
  const cycle = useCallback(() => {
    const index = THEME_ORDER.indexOf(storedPreference);
    setThemePreference(THEME_ORDER[(index + 1) % THEME_ORDER.length]);
  }, [storedPreference]);
  return { preference: storedPreference, resolved, cycle, setPreference: setThemePreference };
}

applyToDocument();
