"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/currency";

export function PaymentSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledRef = useRef(false);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<React.ReactNode>("Payment confirmed. Your plan is now active.");

  useEffect(() => {
    if (handledRef.current) return;
    const status = searchParams.get("payment");
    const provider = searchParams.get("provider");
    const reference = searchParams.get("reference");
    const transactionId = searchParams.get("transaction_id");
    if (status === "success") {
      handledRef.current = true;
      const currency = searchParams.get("currency")?.toUpperCase();
      const amountRaw = searchParams.get("amount");
      const amount = amountRaw ? Number(amountRaw) : null;
      const paid =
        currency && amount !== null && Number.isFinite(amount)
          ? formatCurrency(amount, currency)
          : null;
      setMessage(
        <div className="space-y-0.5">
          <p className="font-medium">Payment Successful</p>
          <p className="text-xs text-muted-foreground">
            {paid ? `You paid ${paid} to Maboria` : `Your ${provider || "payment"} was successful.`}
          </p>
        </div>
      );
      setShow(true);
      const timer = setTimeout(() => setShow(false), 4000);
      if (provider && (reference || transactionId)) {
        const payload =
          provider === "paystack"
            ? { provider, reference }
            : { provider, transactionId: transactionId ? Number(transactionId) || transactionId : transactionId };
        fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => undefined);
      }
      router.replace("/dashboard", { scroll: false });
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  return <Toast message={message} show={show} />;
}
