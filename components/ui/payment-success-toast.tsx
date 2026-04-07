"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

export function PaymentSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const handledRef = useRef(false);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<React.ReactNode>(
    t(
      "Payment confirmed. Your plan is now active.",
      "Paiement confirme. Votre plan est actif.",
      "Zahlung bestatigt. Dein Tarif ist jetzt aktiv.",
      "Pago confirmado. Tu plan ya esta activo.",
      "Pagamento confirmado. O seu plano esta agora ativo."
    )
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
          ? formatCurrency(amount, currency, { locale })
          : null;
      setMessage(
        <div className="space-y-0.5">
          <p className="font-medium">
            {t(
              "Payment successful",
              "Paiement r?ussi",
              "Zahlung erfolgreich",
              "Pago correcto",
              "Pagamento bem-sucedido"
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {paid
              ? t(
                  `You paid ${paid} to Maboria`,
                  `Vous avez paye ${paid} a Maboria`,
                  `Du hast ${paid} an Maboria bezahlt`,
                  `Has pagado ${paid} a Maboria`,
                  `Pagaste ${paid} a Maboria`
                )
              : t(
                  "Your payment was successful.",
                  "Votre paiement est r?ussi.",
                  "Deine Zahlung war erfolgreich.",
                  "Tu pago se ha realizado correctamente.",
                  "O seu pagamento foi bem-sucedido."
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
  }, [locale, searchParams, router, t]);

  return <Toast message={message} show={show} />;
}
