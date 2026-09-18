import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "tfd-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = read();

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
}

// apply before first paint so the page never flashes the wrong ground
apply(current);

function set(theme: Theme) {
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked; theme still applies for this session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Dark is the operator default; light is an explicit projector mode. Shared across the app. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current);
  const toggle = useCallback(() => set(current === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}
