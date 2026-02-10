"use client";

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
  void variant;
  void dismissible;
  void dismissed;
  return null;
}
