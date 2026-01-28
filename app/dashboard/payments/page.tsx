"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
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

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {t("Payments", "Paiements")}
            </p>
            <h1 className="text-3xl font-semibold text-foreground">
              {t("Billing + subscriptions", "Facturation + abonnements")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Select a plan and continue to secure checkout to add a payment method. Prices shown in USD; you'll be charged in local currency where supported. VAT included where applicable.",
                "Choisissez un plan puis continuez vers le paiement securise. Prix en USD, facturation en devise locale si disponible. TVA incluse si applicable."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                billingInterval === "monthly"
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Monthly", "Mensuel")}
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                billingInterval === "yearly"
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Yearly (Save 15%)", "Annuel (15% off)")}
            </button>
          </div>
        </div>
        {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title={t("Select a plan", "Choisir un plan")}>
          <div className="grid gap-3 md:grid-cols-2 max-md:grid-cols-1">
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
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-card/50 hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {p.plan === "ENTERPRISE" || usdPrice == null
                        ? t("Contact sales", "Contacter ventes")
                        : formatUsd(usdPrice)}
                    </div>
                    {p.plan !== "ENTERPRISE" && (
                      <p className="text-xs text-muted-foreground">
                        {billingInterval === "yearly"
                          ? t("per year (USD)", "par an (USD)")
                          : t("per month (USD)", "par mois (USD)")}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        </Card>
        <Card title={t("Choose payment method", "Choisir le mode de paiement")}>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 max-md:grid-cols-1">
              <button
                type="button"
                onClick={() => setProvider("paystack")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  provider === "paystack"
                    ? "border-indigo-500 bg-indigo-500/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                Paystack
              </button>
              <button
                type="button"
                onClick={() => setProvider("flutterwave")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  provider === "flutterwave"
                    ? "border-indigo-500 bg-indigo-500/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                Flutterwave
              </button>
            </div>
            {provider === "paystack" ? (
              <label className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2 text-sm max-md:flex-col max-md:items-start max-md:gap-2">
                <span className="text-muted-foreground">{t("Paystack currency", "Devise Paystack")}</span>
                <select
                  value={paystackCurrency}
                  onChange={(e) => setPaystackCurrency(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
                >
                  {paystackCurrencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2 text-sm max-md:flex-col max-md:items-start max-md:gap-2">
                <span className="text-muted-foreground">{t("Billing currency", "Devise de facturation")}</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
                >
                  {availableCurrencies.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-2 max-md:gap-3">
              <Button onClick={payWithPaystack} className="max-md:w-full">
                {t("Continue with Paystack", "Continuer avec Paystack")}
              </Button>
              <Button onClick={payWithFlutterwave} className="max-md:w-full">
                {t("Continue with Flutterwave", "Continuer avec Flutterwave")}
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t(
                "You will be redirected to a secure checkout page to enter card or bank details. Your plan activates immediately after payment.",
                "Vous serez redirige vers une page securisee pour saisir carte ou virement. Le plan s active apres paiement."
              )}
            </div>
            {selectedPlan ? (
              <div className="rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                {t("Selected plan:", "Plan choisi:")}{" "}
                <span className="font-semibold text-foreground">
                  {planLabelMap[selectedPlan.label]
                    ? t(planLabelMap[selectedPlan.label].en, planLabelMap[selectedPlan.label].fr)
                    : selectedPlan.label}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {billingInterval === "yearly" ? t("(Yearly)", "(Annuel)") : t("(Monthly)", "(Mensuel)")}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <Card title={t("Recent payments", "Paiements recents")}>
        {paymentRows.length === 0 ? (
          <EmptyState
            title={t("No payments yet", "Aucun paiement")}
            description={t(
              "Your subscription payments will appear here once completed.",
              "Vos paiements d abonnement apparaitront ici."
            )}
          />
        ) : (
          <Table
            data={paymentRows}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "provider", label: t("Provider", "Fournisseur") },
              {
                key: "currency",
                label: t("Currency", "Devise"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "amount",
                label: t("Amount", "Montant"),
                render: (row: any) => formatCurrency(Number(row.amount || 0), row.currency),
              },
              { key: "status", label: t("Status", "Statut") },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
