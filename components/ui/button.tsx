"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition";
  const variants: Record<string, string> = {
    primary: "bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/30",
    secondary: "bg-slate-800 text-slate-50 hover:bg-slate-700 border border-slate-700",
    ghost: "text-slate-200 hover:bg-slate-800/80",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
