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

const ThemeCtx = createContext<{
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggle: () => void;
}>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({
  children,
  initialTheme = "dark",
  initialResolvedTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemePreference;
  initialResolvedTheme?: ResolvedTheme;
}) {
  const safeInitialTheme = isThemePreference(initialTheme) ? initialTheme : "dark";
  const safeInitialResolved: ResolvedTheme = isResolvedTheme(initialResolvedTheme)
    ? initialResolvedTheme
    : safeInitialTheme === "system"
      ? "dark"
      : safeInitialTheme;

  const [theme, setThemeState] = useState<ThemePreference>(safeInitialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(safeInitialResolved);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.resolvedTheme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");

    setCookie(THEME_COOKIE, theme);
    setCookie(RESOLVED_COOKIE, resolvedTheme);
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
    setThemeState(next);
  };
  const toggle = () => {
    setCookie(EXPLICIT_COOKIE, "1");
    setThemeState((prev) => {
      const next: ThemePreference = prev === "dark" ? "light" : "dark";
      return next;
    });
  };

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, toggle }), [theme, resolvedTheme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
