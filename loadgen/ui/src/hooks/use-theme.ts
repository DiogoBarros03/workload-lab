import { useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
type Store = () => Pick<Storage, "getItem" | "setItem">;
type Root = Pick<Element, "setAttribute" | "removeAttribute">;

export const THEME_KEY = "loadlab.theme";
const THEMES: readonly Theme[] = ["light", "dark", "system"];

export const nextTheme = (current: Theme): Theme => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

// Storage may be absent, blocked or corrupt; system is the default.
export function readTheme(store: Store): Theme {
  try {
    const raw = store().getItem(THEME_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeTheme(store: Store, theme: Theme) {
  try {
    store().setItem(THEME_KEY, theme);
  } catch {
    // Blocked or full storage only costs persistence.
  }
}

// System removes the attribute so prefers-color-scheme decides.
export function applyTheme(root: Root, theme: Theme) {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const browserStore: Store = () => window.localStorage;

// Stored choice on load; cycle advances it, persists it and repaints.
export function useTheme() {
  const [theme, setTheme] = useState(() => readTheme(browserStore));
  useLayoutEffect(() => applyTheme(document.documentElement, theme), [theme]);
  const cycle = () => {
    const next = nextTheme(theme);
    setTheme(next);
    writeTheme(browserStore, next);
  };
  return { theme, cycle };
}
