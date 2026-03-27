"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";

type ViewState = "loading" | "success" | "failed" | "pending";

const SUCCESS_STATUSES = new Set(["success", "synced", "active", "completed"]);
const PENDING_STATUSES = new Set(["pending", "processing"]);

function normalizeVerifyStatus(status: unknown): ViewState {
  const value = String(status || "").toLowerCase();
  if (SUCCESS_STATUSES.has(value)) return "success";
  if (PENDING_STATUSES.has(value)) return "pending";
  return "failed";
}

type CheckoutStatusPayload = {
  checkout?: {
    status?: string | null;
    provider?: string | null;
    plan?: string | null;
    billingCycle?: string | null;
    currency?: string | null;
  } | null;
};

export default function CheckoutReturnPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference");
  const [view, setView] = useState<ViewState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const verifyPayment = useCallback(async (): Promise<ViewState> => {
    if (!reference) {
      setMessage(t("Missing payment reference.", "Reference de paiement manquante.", "Fehlende Zahlungsreferenz.", "Falta la referencia del pago.", "Falta a referencia do pagamento."));
      return "failed";
    }

    const verifyViaApi = async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    };

    // Attempt provider-agnostic payload first.
    let verification = await verifyViaApi({ reference });
    if (verification.ok) {
      return normalizeVerifyStatus(verification.data?.status);
    }

    // Fallback to existing backend contract by resolving provider from checkout session.
    const checkoutStatusRes = await fetch(
      `/api/checkout/status?reference=${encodeURIComponent(reference)}`,
      { cache: "no-store" }
    );
    if (!checkoutStatusRes.ok) {
      setMessage(t("Unable to confirm payment at the moment.", "Impossible de confirmer le paiement pour le moment.", "Die Zahlung kann derzeit nicht bestatigt werden.", "No se puede confirmar el pago en este momento.", "Não foi possivel confirmar o pagamento neste momento."));
      return "failed";
    }

    const checkoutStatus = (await checkoutStatusRes.json().catch(() => ({}))) as CheckoutStatusPayload;
    const provider = String(checkoutStatus?.checkout?.provider || "").toLowerCase();
    const checkoutState = String(checkoutStatus?.checkout?.status || "").toUpperCase();

    if (provider === "stripe") {
      return normalizeVerifyStatus(checkoutState === "SUCCESS" ? "success" : checkoutState === "FAILED" || checkoutState === "ABANDONED" ? "failed" : "pending");
    }

    if (provider === "paystack") {
      verification = await verifyViaApi({ provider: "paystack", reference });
    } else if (provider === "flutterwave") {
      verification = await verifyViaApi({ provider: "flutterwave", txRef: reference });
    } else {
      setMessage(t("Unable to identify payment provider.", "Impossible d'identifier le fournisseur de paiement.", "Der Zahlungsanbieter konnte nicht erkannt werden.", "No se pudo identificar el proveedor de pago.", "Não foi possivel identificar o fornecedor de pagamento."));
      return "failed";
    }

    if (!verification.ok) {
      const errorText = String(verification.data?.error || "").toLowerCase();
      if (errorText.includes("pending")) return "pending";
      setMessage(t("Payment could not be verified yet.", "Le paiement n'a pas encore pu être verifie.", "Die Zahlung konnte noch nicht verifiziert werden.", "Aún no se pudo verificar el pago.", "Ainda não foi possivel verificar o pagamento."));
      return "failed";
    }

    return normalizeVerifyStatus(verification.data?.status);
  }, [reference, t]);

  const runVerification = useCallback(async () => {
    setView("loading");
    setMessage(null);
    try {
      const nextView = await verifyPayment();
      setView(nextView);
    } catch {
      setMessage(t("Unable to confirm payment at the moment.", "Impossible de confirmer le paiement pour le moment.", "Die Zahlung kann derzeit nicht bestatigt werden.", "No se puede confirmar el pago en este momento.", "Não foi possivel confirmar o pagamento neste momento."));
      setView("failed");
    }
  }, [t, verifyPayment]);

  const handleRetryPayment = useCallback(async () => {
    try {
      setRetrying(true);
      if (!reference) {
        setMessage(t("Missing payment reference.", "Reference de paiement manquante.", "Fehlende Zahlungsreferenz.", "Falta la referencia del pago.", "Falta a referencia do pagamento."));
        return;
      }

      const statusRes = await fetch(`/api/checkout/status?reference=${encodeURIComponent(reference)}`, {
        cache: "no-store",
      });
      const statusData = (await statusRes.json().catch(() => ({}))) as CheckoutStatusPayload;

      if (!statusRes.ok || !statusData?.checkout?.plan || !statusData?.checkout?.billingCycle) {
        setMessage(t("Unable to restore your checkout details for retry.", "Impossible de restaurer les details du paiement pour réessayer.", "Die Checkout-Details für einen neuen Versuch können nicht wiederhergestellt werden.", "No se pudieron restaurar los datos del checkout para reintentar.", "Não foi possivel restaurar os detalhes do checkout para repetir."));
        return;
      }

      const provider = String(statusData.checkout.provider || "").toUpperCase();
      const payload = {
        selectedPlan: statusData.checkout.plan,
        billingCycle: statusData.checkout.billingCycle,
        currency: statusData.checkout.currency || undefined,
        provider:
          provider === "PAYSTACK" || provider === "FLUTTERWAVE" || provider === "STRIPE"
            ? provider
            : undefined,
      };

      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      const checkoutUrl = data?.checkoutUrl || data?.redirectUrl;
      if (res.ok && checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      setMessage(
        typeof data?.error === "string"
          ? data.error
          : t("Unable to start a secure retry right now.", "Impossible de lancer une nouvelle tentative securisee pour le moment.", "Ein sicherer neuer Versuch kann derzeit nicht gestartet werden.", "No se puede iniciar un nuevo intento seguro en este momento.", "Não foi possivel iniciar uma nova tentativa segura neste momento.")
      );
    } catch {
      setMessage(t("Unable to start a secure retry right now.", "Impossible de lancer une nouvelle tentative securisee pour le moment.", "Ein sicherer neuer Versuch kann derzeit nicht gestartet werden.", "No se puede iniciar un nuevo intento seguro en este momento.", "Não foi possivel iniciar uma nova tentativa segura neste momento."));
    } finally {
      setRetrying(false);
    }
  }, [reference, t]);

  useEffect(() => {
    runVerification();
  }, [runVerification]);

  useEffect(() => {
    if (view !== "success") return;
    const timer = setTimeout(() => {
      router.replace("/dashboard/subscription");
    }, 1200);
    return () => clearTimeout(timer);
  }, [view, router]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-12 text-slate-900 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_16px_36px_-24px_rgba(15,23,42,0.24)] sm:p-10">
          {view === "loading" && (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{t("Processing your payment", "Traitement de votre paiement", "Deine Zahlung wird verarbeitet", "Procesando tu pago", "A processar o seu pagamento")}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("We're confirming your transaction securely. Please wait...", "Nous confirmons votre transaction en toute sécurité. Veuillez patienter...", "Wir bestätigen deine Transaktion sicher. Bitte warte...", "Estamos confirmando tu transaccion de forma segura. Espera un momento...", "Estamos a confirmar a sua transacao de forma segura. Aguarde...")}
              </p>
            </div>
          )}

          {view === "success" && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{t("Payment successful", "Paiement reussi", "Zahlung erfolgreich", "Pago correcto", "Pagamento bem-sucedido")}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("Your subscription is now active. Redirecting to billing...", "Votre abonnement est maintenant actif. Redirection vers la facturation...", "Dein Abonnement ist jetzt aktiv. Weiterleitung zur Abrechnung...", "Tu suscripción ya esta activa. Redirigiendo a facturación...", "A sua subscrição esta agora ativa. A redirecionar para a faturação...")}
              </p>
            </div>
          )}

          {view === "failed" && (
            <div className="text-center">
              <div className="mx-auto h-2 w-16 rounded-full bg-slate-200" />
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{t("Payment not completed", "Paiement non finalise", "Zahlung nicht abgeschlossen", "Pago no completado", "Pagamento não concluido")}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("It looks like your transaction did not go through. You can retry securely below.", "Il semble que votre transaction n'ait pas abouti. Vous pouvez réessayer en toute sécurité ci-dessous.", "Es sieht so aus, als ware deine Transaktion nicht durchgegangen. Du kannst unten sicher erneut versuchen.", "Parece que tu transaccion no se completo. Puedes volver a intentarlo de forma segura abajo.", "Parece que a sua transacao não foi concluida. Pode tentar novamente em seguranca abaixo.")}
              </p>
              {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
              <button
                type="button"
                onClick={handleRetryPayment}
                disabled={retrying}
                className="mt-6 h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 text-base font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {retrying
                  ? t("Preparing secure checkout...", "Preparation du paiement securise...", "Sicherer Checkout wird vorbereitet...", "Preparando pago seguro...", "A preparar checkout seguro...")
                  : t("Retry secure payment", "Reessayer le paiement securise", "Sichere Zahlung erneut versuchen", "Reintentar pago seguro", "Tentar novamente o pagamento seguro")}
              </button>
            </div>
          )}

          {view === "pending" && (
            <div className="text-center">
              <div className="mx-auto h-2 w-16 rounded-full bg-slate-200" />
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{t("Payment pending", "Paiement en attente", "Zahlung ausstehend", "Pago pendiente", "Pagamento pendente")}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {t("We're still waiting for confirmation from your bank.", "Nous attendons toujours la confirmation de votre banque.", "Wir warten noch auf die Bestätigung deiner Bank.", "Seguimos esperando la confirmacion de tu banco.", "Continuamos a aguardar a confirmacao do seu banco.")}
              </p>
              {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
              <button
                type="button"
                onClick={runVerification}
                className="mt-6 h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 text-base font-semibold text-white transition hover:brightness-105"
              >
                {t("Check again", "Verifier a nouveau", "Erneut prüfen", "Volver a comprobar", "Verificar novamente")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
