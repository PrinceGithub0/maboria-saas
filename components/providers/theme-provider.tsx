"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_COOKIE = "maboria-theme";
const RESOLVED_COOKIE = "maboria-resolved-theme";
const EXPLICIT_COOKIE = "maboria-theme-explicit";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

function setCookie(name: string, value: string) {
  const encName = encodeURIComponent(name);
  const encValue = encodeURIComponent(value);
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
  // 1 year
  document.cookie = `${encName}=${encValue}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function setStoredTheme(value: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_COOKIE, value);
  } catch {
    // Ignore storage failures (private mode, disabled storage).
  }
}

const ThemeCtx = createContext<{
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggle: () => void;
}>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({
  children,
  initialTheme = "light",
  initialResolvedTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemePreference;
  initialResolvedTheme?: ResolvedTheme;
}) {
  const safeInitialTheme = isThemePreference(initialTheme) ? initialTheme : "light";
  const safeInitialResolved: ResolvedTheme = isResolvedTheme(initialResolvedTheme)
    ? initialResolvedTheme
    : safeInitialTheme === "system"
      ? "light"
      : safeInitialTheme;

  const [theme, setThemeState] = useState<ThemePreference>(safeInitialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(safeInitialResolved);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    const fromData = root.dataset.theme;
    const fromStorage = window.localStorage.getItem(THEME_COOKIE);
    const next = isThemePreference(fromStorage)
      ? fromStorage
      : isThemePreference(fromData)
        ? fromData
        : undefined;
    if (next && next !== theme) {
      setThemeState(next);
    }
    // Only sync once on mount to avoid overriding user toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.resolvedTheme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");

    setCookie(THEME_COOKIE, theme);
    setCookie(RESOLVED_COOKIE, resolvedTheme);
    setStoredTheme(theme);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    setCookie(EXPLICIT_COOKIE, "1");
    setStoredTheme(next);
    setThemeState(next);
  };
  const toggle = () => {
    setCookie(EXPLICIT_COOKIE, "1");
    setThemeState((prev) => {
      const next: ThemePreference = prev === "dark" ? "light" : "dark";
      setStoredTheme(next);
      return next;
    });
  };

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, toggle }), [theme, resolvedTheme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
