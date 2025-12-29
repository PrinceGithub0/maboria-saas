"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/components/providers/theme-provider";

const options: Array<{ value: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = wrapperRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const ButtonIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div ref={wrapperRef} className="relative z-[60]">
      <button
        type="button"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <ButtonIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme menu"
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-50"
        >
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Appearance</div>
          <div className="border-t border-border">
            {options.map((opt) => {
              const Icon = opt.icon;
              const active = opt.value === theme;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setTheme(opt.value);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                    active ? "bg-muted" : "hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">{opt.label}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
