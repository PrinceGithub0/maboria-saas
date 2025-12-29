"use client";

import { useState } from "react";
import { X, Info } from "lucide-react";

export function PaystackNotice({ dismissed }: { dismissed: boolean }) {
  const [visible, setVisible] = useState(!dismissed);
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  const dismiss = async () => {
    setVisible(false);
    setSaving(true);
    try {
      await fetch("/api/announcements/paystack", { method: "POST" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-slate-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-slate-950 dark:text-emerald-200" />
        <span className="font-semibold text-slate-900 dark:text-emerald-100">
          Payments via Paystack are now available.
        </span>
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={dismiss}
        disabled={saving}
        className="rounded-full border border-border bg-background/80 p-1 text-foreground hover:bg-muted disabled:cursor-not-allowed"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
