"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check } from "lucide-react";
import { getCheckoutPlanConfig } from "@/lib/checkout-plan-config";
import { useLanguage } from "@/components/providers/language-provider";

type Props = {
  plan: string;
  interval: "monthly" | "yearly";
  currency: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  userId: string;
};

function TrustLockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="15" r="1.2" />
      <path d="M12 16.2V17.4" />
    </svg>
  );
}

function TrustShieldCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.8L18 6.3v5.5c0 3.7-2.3 7-6 8.4-3.7-1.4-6-4.7-6-8.4V6.3L12 3.8Z" />
      <path d="m9.6 12.4 1.8 1.8 3.2-3.2" />
    </svg>
  );
}

function formatDisplayPrice(value: number | null, currency: string) {
  if (value == null) return null;
  if (currency === "USD") return `$${value.toLocaleString()}`;
  return `${currency} ${value.toLocaleString()}`;
}

function detectCountryFromNavigator() {
  if (typeof navigator === "undefined") return null;

  const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const locale of locales) {
    const match = locale.match(/[-_]([a-z]{2})$/i);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

export function CheckoutPanel({
  plan,
  interval,
  currency,
  monthlyPrice,
  yearlyPrice,
  userId,
}: Props) {
  const { t } = useLanguage();
  const [billing, setBilling] = useState<"monthly" | "yearly">(interval);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const planConfig = useMemo(() => getCheckoutPlanConfig(plan), [plan]);

  const price = useMemo(() => (billing === "yearly" ? yearlyPrice : monthlyPrice), [billing, monthlyPrice, yearlyPrice]);
  const displayPrice = useMemo(() => formatDisplayPrice(price, currency), [price, currency]);

  const onCheckout = async () => {
    if (!price) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedPlan: plan,
          billingCycle: billing,
          userId,
          detectedCountry: detectCountryFromNavigator(),
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error ||
            t(
              "Unable to start checkout",
              "Impossible de lancer le paiement",
              "Checkout kann nicht gestartet werden",
              "No se puede iniciar el checkout",
              "Não foi possível iniciar o checkout"
            )
        );
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl as string;
        return;
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(
        t(
          "Unable to start checkout. Please try again.",
          "Impossible de lancer le paiement. Veuillez réessayer.",
          "Checkout kann nicht gestartet werden. Bitte versuche es erneut.",
          "No se pudo iniciar el checkout. Inténtalo de nuevo.",
          "Não foi possível iniciar o checkout. Tente novamente."
        )
      );
      setLoading(false);
    }
  };

  return (
    <div className="mt-[72px] space-y-[72px]">
      <section className="rounded-[14px] border border-[#EAEAEA] bg-white p-9 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.14)] sm:p-10">
        <div className="space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                {t("Selected Plan", "Plan sélectionné", "Ausgewählter Plan", "Plan seleccionado", "Plano selecionado")}: {planConfig.planName}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                {planConfig.planName}
              </h2>
            </div>

            <div className="inline-flex rounded-full border border-[#EAEAEA] bg-white p-1">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={clsx(
                  "rounded-full px-5 py-2 text-sm font-medium transition",
                  billing === "monthly"
                    ? "bg-blue-600 text-white shadow-[0_8px_16px_-12px_rgba(37,99,235,0.8)]"
                    : "border border-[#EAEAEA] bg-slate-50 text-slate-700"
                )}
              >
                {t("Monthly", "Mensuel", "Monatlich", "Mensual", "Mensal")}
              </button>
              <button
                type="button"
                onClick={() => setBilling("yearly")}
                className={clsx(
                  "ml-2 rounded-full px-5 py-2 text-sm font-medium transition",
                  billing === "yearly"
                    ? "bg-blue-600 text-white shadow-[0_8px_16px_-12px_rgba(37,99,235,0.8)]"
                    : "border border-[#EAEAEA] bg-slate-50 text-slate-700"
                )}
              >
                {t("Yearly", "Annuel", "Jährlich", "Anual", "Anual")}
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#EAEAEA] pt-8">
            <p className="text-6xl font-semibold tracking-tight text-slate-900">
              {displayPrice ??
                t(
                  "Pricing unavailable",
                  "Tarification indisponible",
                  "Preis nicht verfügbar",
                  "Precio no disponible",
                  "Preço indisponível"
                )}
            </p>
            <p className="text-base text-slate-500">
              {t("per", "par", "pro", "por", "por")} {billing === "yearly" ? t("year", "an", "Jahr", "ano", "ano") : t("month", "mois", "Monat", "mes", "mes")}
            </p>
          </div>

          <p className="border-t border-[#EAEAEA] pt-6 text-base text-slate-600">
            {planConfig.positioning}
          </p>

          <ul className="space-y-3 border-t border-[#EAEAEA] pt-6">
            {(planConfig.features || []).slice(0, 4).map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-800">
                <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="border-t border-[#EAEAEA] pt-6 text-sm text-slate-500">
            {t("Best for", "Idéal pour", "Ideal für", "Ideal para", "Ideal para")} {planConfig.targetAudience}
          </p>
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="space-y-3">
        <button
          type="button"
          disabled={loading || !price}
          onClick={onCheckout}
          className="min-h-14 w-full rounded-[14px] bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-base font-medium text-white shadow-[0_14px_28px_-16px_rgba(37,99,235,0.55)] transition hover:from-blue-700 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? t("Redirecting...", "Redirection...", "Weiterleitung...", "Redirigiendo...", "A redirecionar...")
            : t("Subscribe securely", "Souscrire en toute sécurité", "Sicher abonnieren", "Suscribirse de forma segura", "Subscrever em segurança")}
        </button>
        <p className="mt-5 flex items-center justify-center gap-2 text-[13px] font-medium text-[#6B7280] sm:mt-6 sm:text-sm">
          <TrustLockIcon />
          <span>{t("SSL Encrypted", "SSL chiffré", "SSL-verschlüsselt", "Cifrado SSL", "Encriptado SSL")}</span>
          <span>{"\u00B7"}</span>
          <TrustShieldCheckIcon />
          <span>{t("Secure global payment processing", "Traitement sécurisé des paiements mondiaux", "Sichere globale Zahlungsabwicklung", "Procesamiento global de pagos seguro", "Processamento global de pagamentos seguro")}</span>
        </p>
      </div>
    </div>
  );
}
