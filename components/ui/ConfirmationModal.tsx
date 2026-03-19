"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

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
        <span className="mb-4 rounded-full bg-red-50 p-3">
          <ExclamationTriangleIcon className="h-11 w-11 text-red-500" />
        </span>
      );
    }
    return (
      <span className="mb-4 rounded-full bg-blue-50 p-3">
        <BellIcon className="h-11 w-11 text-blue-500" />
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
        className={`w-[480px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-8 relative transition-all duration-[180ms] ease-out ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <div className="flex flex-col items-center">
          {icon}
          <h3 className="text-xl font-semibold text-gray-900 text-center mb-3">
            {title}
          </h3>
          <p className="text-sm text-gray-500 text-center leading-relaxed mb-7">
            {description}
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          {secondaryConfirmLabel && onSecondaryConfirm ? (
            <button
              type="button"
              onClick={onSecondaryConfirm}
              className="flex-1 h-11 rounded-lg border border-blue-200 bg-white text-blue-700 font-medium hover:bg-blue-50 transition"
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
