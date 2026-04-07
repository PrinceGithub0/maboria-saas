"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useLanguage } from "@/components/providers/language-provider";

type ConfirmationModalProps = {
  open: boolean;
  variant: "danger" | "primary";
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void;
  onCancel: () => void;
};

const ANIMATION_MS = 180;

export function ConfirmationModal({
  open,
  variant,
  title,
  description,
  confirmLabel,
  onConfirm,
  secondaryConfirmLabel,
  onSecondaryConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const { m } = useLanguage();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onCancel]);

  const icon = useMemo(() => {
    if (variant === "danger") {
      return (
        <span className="mb-4 rounded-full bg-red-50 p-3 dark:bg-red-500/12">
          <ExclamationTriangleIcon className="h-11 w-11 text-red-500 dark:text-red-300" />
        </span>
      );
    }
    return (
      <span className="mb-4 rounded-full bg-blue-50 p-3 dark:bg-blue-500/12">
        <BellIcon className="h-11 w-11 text-blue-500 dark:text-blue-300" />
      </span>
    );
  }, [variant]);

  const confirmClass =
    variant === "danger"
      ? "flex-1 h-11 rounded-lg text-white font-medium bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-md transition"
      : "flex-1 h-11 rounded-lg text-white font-medium bg-gradient-to-b from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow-md transition";

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-[180ms] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className={`w-[480px] rounded-2xl border border-border bg-card p-8 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.15)] relative transition-all duration-[180ms] ease-out ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-muted-foreground transition hover:text-foreground"
          aria-label={m("common.close")}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <div className="flex flex-col items-center">
          {icon}
          <h3 className="mb-3 text-center text-xl font-semibold text-foreground">
            {title}
          </h3>
          <p className="mb-7 text-center text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-lg border border-border bg-muted font-medium text-foreground transition hover:bg-muted/80"
          >
            {m("common.cancel")}
          </button>
          {secondaryConfirmLabel && onSecondaryConfirm ? (
            <button
              type="button"
              onClick={onSecondaryConfirm}
              className="h-11 flex-1 rounded-lg border border-blue-300/60 bg-background font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-400/30 dark:bg-background dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              {secondaryConfirmLabel}
            </button>
          ) : null}
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
