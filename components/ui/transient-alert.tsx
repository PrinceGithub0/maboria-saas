"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

type AlertVariant = "info" | "success" | "warning" | "error";

const DEFAULT_AUTO_HIDE_MS: Partial<Record<AlertVariant, number>> = {
  success: 5000,
  warning: 7000,
};

export function TransientAlert({
  children,
  variant,
  onDismiss,
  autoHideMs,
  className,
}: {
  children: React.ReactNode;
  variant: AlertVariant;
  onDismiss: () => void;
  autoHideMs?: number | null;
  className?: string;
}) {
  const { m } = useLanguage();
  const resolvedAutoHideMs =
    autoHideMs === undefined ? DEFAULT_AUTO_HIDE_MS[variant] ?? null : autoHideMs;

  useEffect(() => {
    if (!resolvedAutoHideMs) return;
    const timeout = window.setTimeout(() => {
      onDismiss();
    }, resolvedAutoHideMs);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, resolvedAutoHideMs]);

  return (
    <Alert variant={variant} className={`relative pr-12 ${className ?? ""}`.trim()}>
      {children}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={m("alert.dismiss")}
        className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-current/70 transition hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
