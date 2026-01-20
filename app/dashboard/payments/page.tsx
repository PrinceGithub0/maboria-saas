"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/currency";
import { getPlanPriceForCurrency, pricingTableDualCurrency } from "@/lib/pricing";
import {
  marketingCountries,
  getPaystackEnabledCurrencies,
  isAllowedCurrency,
  isPaystackCurrencyEnabled,
  normalizeCurrency,
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
  const [plan, setPlan] = useState<"starter" | "pro">("starter");
  const [currency, setCurrency] = useState<string>("USD");
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("flutterwave");
  const [paystackCountry, setPaystackCountry] = useState<string>(
    marketingCountries.PAYSTACK[0] || "Nigeria"
  );

  useEffect(() => {
    if (didInit.current || me?.preferredCurrency) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Africa/Lagos") {
      setCurrency("NGN");
      setProvider("paystack");
      setPaystackCountry("Nigeria");
      didInit.current = true;
      return;
    }
    if (tz === "Africa/Accra") {
      setCurrency("GHS");
      setProvider("paystack");
      setPaystackCountry("Ghana");
      didInit.current = true;
      return;
    }
    if (tz === "Africa/Johannesburg") {
      setCurrency("ZAR");
      setProvider("paystack");
      setPaystackCountry("South Africa");
      didInit.current = true;
      return;
    }
  }, [me?.preferredCurrency]);

  const plans = useMemo(() => pricingTableDualCurrency(), []);
  const selectedPlan = plans.find((p) => (plan === "starter" ? p.plan === "STARTER" : p.plan === "GROWTH"));
  const planLabelMap: Record<string, { en: string; fr: string }> = {
    Starter: { en: "Starter", fr: "Starter" },
    Pro: { en: "Pro", fr: "Pro" },
    Enterprise: { en: "Enterprise", fr: "Entreprise" },
  };
  const paystackCountries = marketingCountries.PAYSTACK;
  const paystackCountryLabels: Record<string, string> = useMemo(
    () => ({
      Nigeria: "NGN",
      Ghana: "GHS",
      Kenya: "KES",
      "South Africa": "ZAR",
      "Cote d'Ivoire": "XOF",
    }),
    []
  );
  const countryFlags: Record<string, string> = {
    Nigeria: "\u{1F1F3}\u{1F1EC}",
    Ghana: "\u{1F1EC}\u{1F1ED}",
    Kenya: "\u{1F1F0}\u{1F1EA}",
    "South Africa": "\u{1F1FF}\u{1F1E6}",
    "Cote d'Ivoire": "\u{1F1E8}\u{1F1EE}",
    Uganda: "\u{1F1FA}\u{1F1EC}",
    Tanzania: "\u{1F1F9}\u{1F1FF}",
    Rwanda: "\u{1F1F7}\u{1F1FC}",
    Zambia: "\u{1F1FF}\u{1F1F2}",
    Mozambique: "\u{1F1F2}\u{1F1FF}",
    Egypt: "\u{1F1EA}\u{1F1EC}",
    "United States": "\u{1F1FA}\u{1F1F8}",
    "United Kingdom": "\u{1F1EC}\u{1F1E7}",
    Europe: "\u{1F1EA}\u{1F1FA}",
  };
  const formatCountryLabel = (country: string, currencyCode?: string) => {
    const flag = countryFlags[country] || "";
    const base = currencyCode ? `${currencyCode} (${country})` : country;
    return flag ? `${flag} ${base}` : base;
  };
  const paystackEnabledCurrencies = getPaystackEnabledCurrencies();
  const filteredPaystackCountries = paystackCountries.filter((country) => {
    const code = paystackCountryLabels[country];
    return !code || paystackEnabledCurrencies.includes(code);
  });
  const paystackCountryOptions = filteredPaystackCountries.map((country) => ({
    value: country,
    label: paystackCountryLabels[country]
      ? formatCountryLabel(country, paystackCountryLabels[country])
      : formatCountryLabel(country),
  }));
  const paystackCurrency =
    paystackCountryLabels[paystackCountry] || paystackEnabledCurrencies[0] || "NGN";
  const selectedCurrency = provider === "paystack" ? paystackCurrency : currency;
  const flutterwaveCurrencies = [
    { code: "NGN", country: "Nigeria" },
    { code: "GHS", country: "Ghana" },
    { code: "KES", country: "Kenya" },
    { code: "ZAR", country: "South Africa" },
    { code: "XOF", country: "Cote d'Ivoire" },
    { code: "UGX", country: "Uganda" },
    { code: "TZS", country: "Tanzania" },
    { code: "RWF", country: "Rwanda" },
    { code: "ZMW", country: "Zambia" },
    { code: "MZN", country: "Mozambique" },
    { code: "EGP", country: "Egypt" },
    { code: "USD", country: "United States" },
    { code: "GBP", country: "United Kingdom" },
    { code: "EUR", country: "Europe" },
  ];
  const availableCurrencies =
    provider === "paystack"
      ? []
      : flutterwaveCurrencies.map((item) => ({
          code: item.code,
          label: formatCountryLabel(item.country, item.code),
        }));

  const paymentRows = Array.isArray(payments) ? payments : [];

  useEffect(() => {
    if (provider !== "paystack") return;
    if (!filteredPaystackCountries.includes(paystackCountry)) {
      setPaystackCountry(filteredPaystackCountries[0] || marketingCountries.PAYSTACK[0] || "Nigeria");
    }
    setCurrency(paystackCurrency);
  }, [provider, paystackCountry, paystackCurrency, filteredPaystackCountries]);

  useEffect(() => {
    if (didInit.current) return;
    const preferred = normalizeCurrency(me?.preferredCurrency || "");
    if (!preferred || !isAllowedCurrency(preferred)) return;
    if (isPaystackCurrencyEnabled(preferred)) {
      const match = Object.entries(paystackCountryLabels).find(([, code]) => code === preferred)?.[0];
      if (match) setPaystackCountry(match);
      setProvider("paystack");
      setCurrency(preferred);
    } else {
      setProvider("flutterwave");
      setCurrency(preferred);
    }
    didInit.current = true;
  }, [me?.preferredCurrency, paystackCountryLabels]);

  const payWithFlutterwave = async () => {
    setMessage(null);
    setProvider("flutterwave");
    const res = await fetch("/api/payments/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        currency,
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
      body: JSON.stringify({ plan, currency: paystackCurrency }),
    });
    const data = await res.json();
    if (data?.data?.authorization_url) window.location.href = data.data.authorization_url;
    else setMessage(data.error || t("Paystack init failed", "Echec initialisation Paystack"));
  };

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
                "Select a plan and continue to secure checkout to add a payment method. Prices include 7.5% VAT.",
                "Choisissez un plan puis continuez vers le paiement securise. Prix TVA 7.5% incluse."
              )}
            </p>
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
                const isSelected = (plan === "starter" ? "STARTER" : "GROWTH") === p.plan;
                const mappedLabel = planLabelMap[p.label];
                const label = mappedLabel ? t(mappedLabel.en, mappedLabel.fr) : p.label;
                return (
                  <button
                    key={p.plan}
                    type="button"
                    onClick={() => setPlan(p.plan === "STARTER" ? "starter" : "pro")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-card/50 hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {p.plan === "ENTERPRISE"
                        ? t("Contact sales", "Contacter ventes")
                        : formatCurrency(
                            getPlanPriceForCurrency(p.plan, selectedCurrency) || 0,
                            selectedCurrency,
                            { maximumFractionDigits: 0 }
                          )}
                    </div>
                    {p.plan !== "ENTERPRISE" && (
                      <p className="text-xs text-muted-foreground">
                        {selectedCurrency} {t("/ mo", "/ mois")}
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
                <span className="text-muted-foreground">{t("Paystack country", "Pays Paystack")}</span>
                <select
                  value={paystackCountry}
                  onChange={(e) => setPaystackCountry(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
                >
                  {paystackCountryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
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
