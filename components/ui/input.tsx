"use client";

import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { InputHTMLAttributes, useEffect, useRef, useState } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, type, ...props }: Props) {
  const isPassword = type === "password";
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolvedType = isPassword ? (showPassword ? "text" : "password") : type ?? "text";

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleVisibility = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    setShowPassword((prev) => !prev);
    requestAnimationFrame(() => {
      if (!el) return;
      if (start !== null && end !== null) {
        el.setSelectionRange(start, end);
      }
      el.focus();
    });
  };

  if (!mounted) {
    return (
      <label className="flex flex-col gap-1 text-sm text-foreground">
        {label}
        <div className="relative">
          <div
            className={clsx(
              "h-10 w-full rounded-lg border border-input bg-background px-3 py-2",
              className
            )}
          />
        </div>
        {error && <span className="text-xs text-rose-700 dark:text-rose-400">{error}</span>}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm text-foreground">
      {label}
      <div className="relative" suppressHydrationWarning>
        <input
          ref={inputRef}
          suppressHydrationWarning
          type={resolvedType}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          className={clsx(
            "w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none",
            isPassword && "pr-10",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground focus-visible:outline-none"
            onClick={toggleVisibility}
            onMouseDown={(event) => event.preventDefault()}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-rose-700 dark:text-rose-400">{error}</span>}
    </label>
  );
}
