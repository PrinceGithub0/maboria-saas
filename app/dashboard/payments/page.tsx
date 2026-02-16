"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/currency";
import { BillingInterval, getPlanPriceForInterval, pricingTableDualCurrency } from "@/lib/pricing";
import {
  getPaystackEnabledCurrencies,
  isAllowedCurrency,
  isPaystackCurrencyEnabled,
  normalizeCurrency,
  providerSupport,
} from "@/lib/payments/currency-allowlist";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PaymentsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data: payments } = useSWR("/api/payments", fetcher, { revalidateOnFocus: false });
  const { data: me } = useSWR("/api/user/me", fetcher, { revalidateOnFocus: false });
  const didInit = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<"starter" | "pro" | "growth" | "business">("starter");
  const [currency, setCurrency] = useState<string>("USD");
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("flutterwave");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const paystackEnabledCurrencies = useMemo(() => getPaystackEnabledCurrencies(), []);
  const [paystackCurrency, setPaystackCurrency] = useState<string>(
    paystackEnabledCurrencies[0] || "NGN"
  );

  const plans = useMemo(() => pricingTableDualCurrency(), []);
  const planKey = (value: typeof plan) =>
    value === "starter"
      ? "STARTER"
      : value === "pro"
        ? "PRO"
        : value === "growth"
          ? "GROWTH"
          : "BUSINESS";
  const selectedPlan = plans.find((p) => p.plan === planKey(plan));
  const planLabelMap: Record<string, { en: string; fr: string }> = {
    Starter: { en: "Starter", fr: "Starter" },
    Pro: { en: "Pro", fr: "Pro" },
    Growth: { en: "Growth", fr: "Growth" },
    Business: { en: "Business", fr: "Business" },
    Enterprise: { en: "Enterprise", fr: "Entreprise" },
  };
  const paystackCurrencyOptions = paystackEnabledCurrencies.map((code) => ({
    code,
    label: code,
  }));
  const flutterwaveCurrencyOptions = providerSupport.FLUTTERWAVE.map((code) => ({
    code,
    label: code,
  }));
  const availableCurrencies =
    provider === "paystack" ? paystackCurrencyOptions : flutterwaveCurrencyOptions;

  const paymentRows = Array.isArray(payments) ? payments : [];

  useEffect(() => {
    if (provider !== "paystack") return;
    if (!paystackEnabledCurrencies.includes(paystackCurrency)) {
      setPaystackCurrency(paystackEnabledCurrencies[0] || "NGN");
      return;
    }
    setCurrency(paystackCurrency);
  }, [provider, paystackCurrency, paystackEnabledCurrencies]);

  useEffect(() => {
    if (didInit.current) return;
    const preferred = normalizeCurrency(me?.preferredCurrency || "");
    if (!preferred || !isAllowedCurrency(preferred)) return;
    if (isPaystackCurrencyEnabled(preferred)) {
      setProvider("paystack");
      setPaystackCurrency(preferred);
      setCurrency(preferred);
    } else {
      setProvider("flutterwave");
      setCurrency(preferred);
    }
    didInit.current = true;
  }, [me?.preferredCurrency]);

  const payWithFlutterwave = async () => {
    setMessage(null);
    setProvider("flutterwave");
    const res = await fetch("/api/payments/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        currency,
        interval: billingInterval,
      }),
    });
    const data = await res.json();
    if (data?.data?.link) window.location.href = data.data.link;
    else setMessage(data.error || t("Flutterwave checkout failed", "Paiement Flutterwave echoue"));
  };

  const payWithPaystack = async () => {
    setMessage(null);
    setProvider("paystack");
    const res = await fetch("/api/payments/paystack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, currency: paystackCurrency, interval: billingInterval }),
    });
    const data = await res.json();
    if (data?.data?.authorization_url) window.location.href = data.data.authorization_url;
    else setMessage(data.error || t("Paystack init failed", "Echec initialisation Paystack"));
  };

  const formatUsd = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
  const getUsdPriceForPlan = (planId: string) =>
    getPlanPriceForInterval(
      planId as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE",
      "USD",
      billingInterval
    );

  const formatProviderLabel = (value: unknown) => {
    const providerValue = String(value || "").toUpperCase();
    if (providerValue === "PAYSTACK") return "Paystack";
    if (providerValue === "FLUTTERWAVE") return "Flutterwave";
    return providerValue || "--";
  };

  const renderStatusPill = (value: unknown) => {
    const status = String(value || "").toUpperCase();
    const badgeClass =
      status === "SUCCEEDED"
        ? "bg-green-100 text-green-700"
        : status === "PENDING"
          ? "bg-amber-100 text-amber-700"
          : status === "FAILED"
            ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-600";
    return (
      <span
        className={`inline-flex min-w-[108px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
      >
        {status === "SUCCEEDED" ? (
          <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
        ) : status === "PENDING" ? (
          <Clock3 className="mr-1.5 h-4 w-4 text-amber-600" />
        ) : status === "FAILED" ? (
          <XCircle className="mr-1.5 h-4 w-4 text-red-600" />
        ) : null}
        {status || "--"}
      </span>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-8 pb-4">
      <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
              {t("Payments", "Paiements")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {t("Billing + subscriptions", "Facturation + abonnements")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t(
                "Select a plan and continue to secure checkout to add a payment method. Prices shown in USD; you'll be charged in local currency where supported. VAT included where applicable.",
                "Choisissez un plan puis continuez vers le paiement securise. Prix en USD, facturation en devise locale si disponible. TVA incluse si applicable."
              )}
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`rounded-full px-4 py-1.5 font-semibold transition duration-150 ${
                billingInterval === "monthly"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t("Monthly", "Mensuel")}
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              className={`rounded-full px-4 py-1.5 font-semibold transition duration-150 ${
                billingInterval === "yearly"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t("Yearly (Save 10%)", "Annuel (10% off)")}
            </button>
          </div>
        </div>
        {message && (
          <div className="mt-5">
            <Alert variant="error">{message}</Alert>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <Card
          title={t("Select a plan", "Choisir un plan")}
          className="rounded-3xl border-slate-200 bg-white p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)]"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {plans
              .filter((p) => p.plan !== "ENTERPRISE")
              .map((p) => {
                const isSelected = planKey(plan) === p.plan;
                const mappedLabel = planLabelMap[p.label];
                const label = mappedLabel ? t(mappedLabel.en, mappedLabel.fr) : p.label;
                const usdPrice = p.plan === "ENTERPRISE" ? null : getUsdPriceForPlan(p.plan);
                return (
                  <button
                    key={p.plan}
                    type="button"
                    onClick={() =>
                      setPlan(
                        p.plan === "STARTER"
                          ? "starter"
                          : p.plan === "PRO"
                            ? "pro"
                            : p.plan === "GROWTH"
                              ? "growth"
                              : "business"
                      )
                    }
                    className={`flex h-full min-h-[196px] flex-col justify-between rounded-3xl border p-6 text-left shadow-[0_12px_28px_-24px_rgba(15,23,42,0.35)] transition duration-150 ${
                      isSelected
                        ? "scale-[1.01] border-blue-500 bg-blue-50/60 ring-1 ring-blue-300/50"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.28)]"
                    }`}
                  >
                    <div className="space-y-3">
                      <p className="text-base font-semibold text-foreground">{label}</p>
                      <div className="text-4xl font-bold tracking-tight text-foreground">
                        {p.plan === "ENTERPRISE" || usdPrice == null
                          ? t("Contact sales", "Contacter ventes")
                          : formatUsd(usdPrice)}
                      </div>
                      {p.plan !== "ENTERPRISE" && (
                        <p className="text-sm text-slate-500">
                          {billingInterval === "yearly"
                            ? t("per year (USD)", "par an (USD)")
                            : t("per month (USD)", "par mois (USD)")}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {p.plan === "STARTER"
                        ? t("Best for getting started.", "Ideal pour bien demarrer.")
                        : p.plan === "PRO"
                          ? t("Built for professionals automating at scale.", "Concu pour les pros qui automatisent a l echelle.")
                          : p.plan === "GROWTH"
                            ? t("For growing teams with higher volume.", "Pour equipes en croissance avec plus de volume.")
                            : t("For teams running high-volume operations.", "Pour equipes qui gerent un fort volume operationnel.")}
                    </p>
                  </button>
                );
              })}
          </div>
        </Card>

        <Card
          title={t("Payment", "Paiement")}
          className="rounded-3xl border-slate-200 bg-white p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)]"
        >
          <div className="space-y-5">
            <div className="rounded-full border border-slate-200 bg-slate-100 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setProvider("paystack")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition duration-150 ${
                    provider === "paystack"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Paystack
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("flutterwave")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition duration-150 ${
                    provider === "flutterwave"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Flutterwave
                </button>
              </div>
            </div>

            {provider === "paystack" ? (
              <label className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
                <span className="text-sm font-medium text-slate-600">
                  {t("Paystack currency", "Devise Paystack")}
                </span>
                <select
                  value={paystackCurrency}
                  onChange={(e) => setPaystackCurrency(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-foreground outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/60"
                >
                  {paystackCurrencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
                <span className="text-sm font-medium text-slate-600">
                  {t("Billing currency", "Devise de facturation")}
                </span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-foreground outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/60"
                >
                  {availableCurrencies.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="space-y-3">
              {provider === "paystack" ? (
                <>
                  <Button
                    onClick={payWithPaystack}
                    className="h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-base font-semibold shadow-[0_14px_26px_-18px_rgba(37,99,235,0.7)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    {t("Continue to secure payment", "Continuer vers le paiement securise")}
                  </Button>
                  <Button
                    onClick={payWithFlutterwave}
                    variant="secondary"
                    className="h-12 w-full rounded-xl border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-200"
                  >
                    {t("Continue with Flutterwave", "Continuer avec Flutterwave")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={payWithFlutterwave}
                    className="h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-base font-semibold shadow-[0_14px_26px_-18px_rgba(37,99,235,0.7)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    {t("Continue to secure payment", "Continuer vers le paiement securise")}
                  </Button>
                  <Button
                    onClick={payWithPaystack}
                    variant="secondary"
                    className="h-12 w-full rounded-xl border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-200"
                  >
                    {t("Continue with Paystack", "Continuer avec Paystack")}
                  </Button>
                </>
              )}
            </div>

            <p className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
              {t(
                "You will be redirected to a secure payment page. Your local currency will be applied automatically where supported.",
                "Vous serez redirige vers une page de paiement securisee. Votre devise locale sera appliquee automatiquement lorsque c est pris en charge."
              )}
            </p>

            {selectedPlan ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                {t("Selected plan:", "Plan choisi:")} <span className="font-semibold text-foreground">
                  {planLabelMap[selectedPlan.label]
                    ? t(planLabelMap[selectedPlan.label].en, planLabelMap[selectedPlan.label].fr)
                    : selectedPlan.label}
                </span>
                <span className="ml-2 text-slate-500">
                  {billingInterval === "yearly" ? t("(Yearly)", "(Annuel)") : t("(Monthly)", "(Mensuel)")}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card
        title={t("Recent payments", "Paiements recents")}
        className="rounded-3xl border-slate-200 bg-white p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)]"
      >
        {paymentRows.length === 0 ? (
          <EmptyState
            title={t("No payments yet", "Aucun paiement")}
            description={t(
              "Your subscription payments will appear here once completed.",
              "Vos paiements d abonnement apparaitront ici."
            )}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse bg-white">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {t("Provider", "Fournisseur")}
                    </th>
                    <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {t("Currency", "Devise")}
                    </th>
                    <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {t("Amount", "Montant")}
                    </th>
                    <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {t("Status", "Statut")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row: any) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50/60"
                    >
                      <td className="px-6 py-5 text-center text-sm font-medium text-slate-700">
                        {formatProviderLabel(row.provider)}
                      </td>
                      <td className="px-6 py-5 text-center text-sm text-slate-600">
                        {String(row.currency || "").toUpperCase()}
                      </td>
                      <td className="px-6 py-5 text-center text-sm font-semibold text-slate-900">
                        {formatCurrency(Number(row.amount || 0), row.currency)}
                      </td>
                      <td className="px-6 py-5 text-center">{renderStatusPill(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
