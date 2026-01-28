"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";

export function PaymentSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useLanguage();
  const t = useCallback((en: string, fr: string) => (language === "fr" ? fr : en), [language]);
  const handledRef = useRef(false);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<React.ReactNode>(
    t("Payment confirmed. Your plan is now active.", "Paiement confirme. Votre plan est actif.")
  );

  useEffect(() => {
    if (handledRef.current) return;
    const status = searchParams.get("payment");
    const provider = searchParams.get("provider");
    const reference = searchParams.get("reference");
    const trxRef = searchParams.get("trxref");
    const transactionId = searchParams.get("transaction_id");
    const txRef = searchParams.get("tx_ref");
    const source = searchParams.get("source");
    if (status === "success") {
      handledRef.current = true;
      if (provider && source !== "callback") {
        const params = new URLSearchParams();
        params.set("provider", provider);
        if (provider === "paystack") {
          const payRef = reference || trxRef;
          if (payRef) params.set("reference", payRef);
        } else {
          if (txRef) params.set("tx_ref", txRef);
          if (transactionId) params.set("transaction_id", transactionId);
        }
        window.location.replace(`/api/payments/callback?${params.toString()}`);
        return;
      }

      const currency = searchParams.get("currency")?.toUpperCase();
      const amountRaw = searchParams.get("amount");
      const amount = amountRaw ? Number(amountRaw) : null;
      const paid =
        currency && amount !== null && Number.isFinite(amount)
          ? formatCurrency(amount, currency)
          : null;
      setMessage(
        <div className="space-y-0.5">
          <p className="font-medium">{t("Payment Successful", "Paiement reussi")}</p>
          <p className="text-xs text-muted-foreground">
            {paid
              ? t(`You paid ${paid} to Maboria`, `Vous avez paye ${paid} a Maboria`)
              : t(
                  `Your ${provider || "payment"} was successful.`,
                  `Votre ${provider || "paiement"} est reussi.`
                )}
          </p>
        </div>
      );
      setShow(true);
      const timer = setTimeout(() => setShow(false), 4000);
      if (provider && (reference || trxRef || transactionId || txRef)) {
        const payload =
          provider === "paystack"
            ? { provider, reference: reference || trxRef }
            : {
                provider,
                transactionId: transactionId ? Number(transactionId) || transactionId : transactionId,
                txRef: txRef || undefined,
              };
        fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => undefined);
      }
      router.replace("/dashboard", { scroll: false });
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, t]);

  return <Toast message={message} show={show} />;
}
