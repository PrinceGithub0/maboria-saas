"use client";

import Image from "next/image";
import { useTheme } from "@/components/providers/theme-provider";

export function PaystackLogo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const src =
    resolvedTheme === "dark"
      ? "/payment-logos/paystack-dark.svg"
      : "/payment-logos/paystack.svg";

  return (
    <Image
      src={src}
      alt="Paystack"
      width={96}
      height={28}
      className={className}
    />
  );
}
