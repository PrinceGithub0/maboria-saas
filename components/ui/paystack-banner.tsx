"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import clsx from "clsx";

type BannerVariant = "public" | "dashboard";

export function PaystackBanner({
  variant,
  dismissible = false,
  dismissed = false,
}: {
  variant: BannerVariant;
  dismissible?: boolean;
  dismissed?: boolean;
}) {
  const [visible, setVisible] = useState(!dismissed);

  if (dismissible && !visible) return null;

  const heightClass = variant === "public" ? "h-[180px]" : "h-[110px]";
  const toneClass = "border-border bg-card";
  const containerClass =
    variant === "public"
      ? "border-y border-border rounded-none shadow-none"
      : "rounded-xl border border-border shadow-sm";
  const paddingClass = variant === "public" ? "px-6 py-3" : "px-3 py-2";

  const dismiss = async () => {
    setVisible(false);
    if (!dismissible) return;
    try {
      await fetch("/api/announcements/paystack", { method: "POST" });
    } catch {
      // Best-effort dismissal; no UI disruption.
    }
  };

  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden",
        heightClass,
        toneClass,
        containerClass,
        paddingClass
      )}
    >
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full border border-border bg-background/80 p-1 text-foreground shadow-sm hover:bg-muted"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <div className="relative h-full w-full">
        <Image
          src="/announcements/paystack.png"
          alt="Maboria now accepts payments using Paystack"
          fill
          sizes="100vw"
          className="object-contain"
          priority={variant === "public"}
        />
      </div>
    </div>
  );
}
