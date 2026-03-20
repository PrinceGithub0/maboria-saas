"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { billingEmail, billingMailto } from "@/lib/billing/contact";
import { formatCurrency } from "@/lib/currency";
import { getCountryFlag, getCountryName } from "@/lib/countries";
import { formatDateDMY } from "@/lib/date";
import { BillingInterval, getPlanPriceForInterval, pricingTableDualCurrency } from "@/lib/pricing";
import { BUSINESS_CURRENCIES, formatBusinessCurrencyOption } from "@/lib/business-currencies";
import {
  formatCurrencyOption,
  getPaystackEnabledCurrencies,
  isAllowedCurrency,
  isProviderCurrency,
  isPaystackCurrencyEnabled,
  isStripeSupportedCurrency,
  normalizeCurrency,
  providerSupport,
} from "@/lib/payments/currency-allowlist";
import {
  FLUTTERWAVE_COUNTRIES,
  FLUTTERWAVE_REGIONS,
  formatPaymentProviderLabel,
  getClientEnabledCheckoutProviders,
  PAYSTACK_COUNTRIES,
  type CheckoutProvider,
} from "@/lib/payments/payment-providers";
import { useLanguage } from "@/components/providers/language-provider";

type PaymentHistoryRow = {
  id: string;
  amount: number;
  currency: string;
  provider: CheckoutProvider;
  status: string;
  createdAt: string;
  reference?: string | null;
};

type PaymentsHistoryResponse = {
  items: PaymentHistoryRow[];
  pagination: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type SubscriptionRow = {
  id: string;
  plan: string;
  status: string;
  billingInterval?: string | null;
  interval?: string | null;
};

type MeResponse = {
  preferredCurrency?: string | null;
  orgRole?: string | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`);
  }
  return payload as T;
};

function mapSubscriptionPlanToSelection(plan: string | null | undefined): "starter" | "pro" | "growth" | "business" | null {
  switch (String(plan || "").toUpperCase()) {
    case "STARTER":
      return "starter";
    case "PRO":
      return "pro";
    case "GROWTH":
      return "growth";
    case "BUSINESS":
    case "PREMIUM":
      return "business";
    default:
      return null;
  }
}

function getDefaultCurrencyForProvider(
  selectedProvider: CheckoutProvider,
  paystackEnabledCurrencies: string[]
) {
  if (selectedProvider === "PAYSTACK") {
    return paystackEnabledCurrencies.includes("USD")
      ? "USD"
      : paystackEnabledCurrencies[0] || "NGN";
  }
  if (selectedProvider === "STRIPE") {
    return "USD";
  }
  return providerSupport[selectedProvider].includes("USD")
    ? "USD"
    : providerSupport[selectedProvider][0] || "USD";
}

export default function PaymentsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data: me } = useSWR<MeResponse>("/api/user/me", fetcher, { revalidateOnFocus: false });
  const orgRole = String(me?.orgRole || "").toLowerCase();
  const canManageWorkspaceSubscription = orgRole === "owner" || orgRole === "billing_admin";
  const billingAccessResolved = me !== undefined;
  const getPaymentsKey = (pageIndex: number, previousPageData: PaymentsHistoryResponse | null) => {
    if (!billingAccessResolved || !canManageWorkspaceSubscription) return null;
    if (pageIndex > 0 && !previousPageData?.pagination?.nextCursor) return null;
    const params = new URLSearchParams();
    params.set("limit", "8");
    if (pageIndex > 0 && previousPageData?.pagination?.nextCursor) {
      params.set("cursor", previousPageData.pagination.nextCursor);
    }
    return `/api/payments?${params.toString()}`;
  };
  const {
    data: paymentPages,
    error: paymentsError,
    isLoading: paymentsLoading,
    isValidating: paymentsValidating,
    setSize: setPaymentsPageSize,
    mutate: mutatePayments,
  } = useSWRInfinite<PaymentsHistoryResponse>(getPaymentsKey, fetcher, {
    revalidateFirstPage: true,
  });
  const {
    data: subscriptions,
    error: subscriptionsError,
    mutate: mutateSubscriptions,
  } = useSWR<SubscriptionRow[]>(billingAccessResolved && canManageWorkspaceSubscription ? "/api/subscription" : null, fetcher, {
    revalidateOnFocus: false,
  });
  const didInit = useRef(false);
  const didSyncSelectionFromSubscription = useRef(false);
  const previousProviderRef = useRef<CheckoutProvider | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [plan, setPlan] = useState<"starter" | "pro" | "growth" | "business">("starter");
  const [currency, setCurrency] = useState<string>("USD");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const paystackEnabledCurrencies = useMemo(() => getPaystackEnabledCurrencies(), []);
  const availableProviders = useMemo(() => getClientEnabledCheckoutProviders(), []);
  const [provider, setProvider] = useState<CheckoutProvider>(availableProviders[0] || "FLUTTERWAVE");

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
  const availableCurrencies = useMemo(() => {
    if (provider === "PAYSTACK") {
      return paystackEnabledCurrencies.map((code) => ({
        code,
        label: formatCurrencyOption(code),
      }));
    }
    if (provider === "STRIPE") {
      return BUSINESS_CURRENCIES.map((code) => ({
        code,
        label: formatBusinessCurrencyOption(code),
      }));
    }
    return providerSupport[provider].map((code) => ({
      code,
      label: formatCurrencyOption(code),
    }));
  }, [provider, paystackEnabledCurrencies]);
  const providerCoverageText = useMemo(() => {
    const locale = language === "fr" ? "fr" : "en";
    const formatCountries = (codes: readonly string[]) =>
      codes.map((code) => `${getCountryFlag(code)} ${getCountryName(code, locale)}`.trim());

    if (provider === "PAYSTACK") {
      return formatCountries(PAYSTACK_COUNTRIES).join(", ");
    }

    if (provider === "FLUTTERWAVE") {
      return [...formatCountries(FLUTTERWAVE_COUNTRIES), ...FLUTTERWAVE_REGIONS].join(", ");
    }

    return null;
  }, [language, provider]);

  const paymentRows = useMemo(() => paymentPages?.flatMap((page) => page.items) || [], [paymentPages]);
  const hasMorePayments = Boolean(paymentPages?.[paymentPages.length - 1]?.pagination?.hasMore);
  const subscriptionRows = Array.isArray(subscriptions) ? subscriptions : [];
  const activeSubscription = subscriptionRows.find((row) =>
    ["ACTIVE", "PAST_DUE", "TRIALING"].includes(String(row?.status || "").toUpperCase())
  );
  const activeSubscriptionStatus = String(activeSubscription?.status || "").toUpperCase();
  const activePlanKey = String(activeSubscription?.plan || "").toUpperCase();
  const activeInterval = String(activeSubscription?.billingInterval || activeSubscription?.interval || "monthly").toLowerCase();
  const selectedPlanKey = planKey(plan);
  const planOrder = ["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"];
  const currentPlanIndex = planOrder.indexOf(activePlanKey);
  const selectedPlanIndex = planOrder.indexOf(selectedPlanKey);
  const isCurrentSelection =
    currentPlanIndex >= 0 &&
    selectedPlanIndex >= 0 &&
    selectedPlanIndex === currentPlanIndex &&
    activeInterval === billingInterval;
  const isPlanUpgradeSelection =
    currentPlanIndex >= 0 &&
    selectedPlanIndex >= 0 &&
    selectedPlanIndex > currentPlanIndex;
  const isIntervalUpgradeSelection =
    currentPlanIndex >= 0 &&
    selectedPlanIndex >= 0 &&
    selectedPlanIndex === currentPlanIndex &&
    activeInterval === "monthly" &&
    billingInterval === "yearly";
  const isDowngradeSelection =
    currentPlanIndex >= 0 &&
    selectedPlanIndex >= 0 &&
    (selectedPlanIndex < currentPlanIndex ||
      (selectedPlanIndex === currentPlanIndex && activeInterval === "yearly" && billingInterval === "monthly"));
  const isImmediateUpgrade =
    currentPlanIndex >= 0 &&
    selectedPlanIndex >= 0 &&
    (selectedPlanIndex > currentPlanIndex ||
      (selectedPlanIndex === currentPlanIndex && activeInterval === "monthly" && billingInterval === "yearly"));
  const checkoutError = message || subscriptionsError?.message || null;
  const paymentHistoryError = paymentsError?.message || null;
  const subscriptionStateLoading = subscriptions === undefined && !subscriptionsError;
  const hasSubscriptionStateError = Boolean(subscriptionsError && !subscriptions);
  const paymentsStateLoading = paymentsLoading && paymentRows.length === 0 && !paymentsError;
  const canRetryCurrentPlan = isCurrentSelection && activeSubscriptionStatus === "PAST_DUE";
  const isLockedCurrentPlanSelection =
    isCurrentSelection && ["ACTIVE", "TRIALING"].includes(activeSubscriptionStatus);
  const checkoutDisabled =
    subscriptionStateLoading ||
    checkoutLoading ||
    hasSubscriptionStateError ||
    isDowngradeSelection ||
    isLockedCurrentPlanSelection;
  const checkoutLabel = subscriptionStateLoading
    ? t("Loading plan state...", "Chargement du plan...")
    : checkoutLoading
      ? t("Redirecting to secure checkout...", "Redirection vers le paiement securise...")
    : canRetryCurrentPlan
      ? t("Retry secure payment", "Relancer le paiement securise")
      : isIntervalUpgradeSelection
        ? t("Switch to yearly billing", "Passer a la facturation annuelle")
        : isPlanUpgradeSelection
          ? t("Upgrade plan securely", "Mettre le plan a niveau")
          : activeSubscription
            ? t("Continue to secure payment", "Continuer vers le paiement securise")
            : t("Start secure checkout", "Demarrer le paiement securise");

  useEffect(() => {
    if (!availableProviders.includes(provider)) {
      setProvider(availableProviders[0] || "FLUTTERWAVE");
    }
  }, [availableProviders, provider]);

  useEffect(() => {
    if (provider === "PAYSTACK") {
      if (previousProviderRef.current !== provider) {
        setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
        previousProviderRef.current = provider;
        return;
      }
      if (!paystackEnabledCurrencies.includes(currency)) {
        setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
      }
      return;
    }
    if (provider === "STRIPE") {
      if (previousProviderRef.current !== provider) {
        setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
        previousProviderRef.current = provider;
        return;
      }
      if (!isStripeSupportedCurrency(currency)) {
        setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
      }
      return;
    }
    if (previousProviderRef.current !== provider) {
      setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
      previousProviderRef.current = provider;
      return;
    }
    if (!providerSupport[provider].includes(currency as (typeof providerSupport)[typeof provider][number])) {
      setCurrency(getDefaultCurrencyForProvider(provider, paystackEnabledCurrencies));
    }
  }, [currency, provider, paystackEnabledCurrencies]);

  useEffect(() => {
    if (didInit.current) return;
    const preferred = normalizeCurrency(me?.preferredCurrency || "");
    if (!preferred || (!isAllowedCurrency(preferred) && !isStripeSupportedCurrency(preferred))) return;
    if (availableProviders.includes("PAYSTACK") && isPaystackCurrencyEnabled(preferred)) {
      setProvider("PAYSTACK");
      setCurrency(preferred);
    } else {
      const preferredProvider = availableProviders.find((candidate) =>
        isProviderCurrency(candidate, preferred)
      );
      if (preferredProvider) {
        setProvider(preferredProvider);
        setCurrency(preferred);
      }
    }
    didInit.current = true;
  }, [availableProviders, me?.preferredCurrency]);

  useEffect(() => {
    if (didSyncSelectionFromSubscription.current || !activeSubscription) return;
    const nextPlan = mapSubscriptionPlanToSelection(activeSubscription.plan);
    if (nextPlan) {
      setPlan(nextPlan);
    }
    const nextInterval = String(activeSubscription.billingInterval || activeSubscription.interval || "monthly").toLowerCase();
    if (nextInterval === "yearly" || nextInterval === "monthly") {
      setBillingInterval(nextInterval);
    }
    didSyncSelectionFromSubscription.current = true;
  }, [activeSubscription]);

  const startProviderCheckout = async (selectedProvider: CheckoutProvider) => {
    if (checkoutLoading) return;
    setMessage(null);
    setProvider(selectedProvider);
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedPlan: planKey(plan),
          currency,
          billingCycle: billingInterval,
          provider: selectedProvider,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : t("Unable to start secure checkout right now.", "Impossible de lancer le paiement securise pour le moment.")
        );
        return;
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setMessage(data.error || t("Checkout failed", "Le paiement a echoue"));
    } catch {
      setMessage(
        t(
          "Unable to reach secure checkout right now. Please try again.",
          "Impossible de joindre le paiement securise pour le moment. Veuillez reessayer."
        )
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const formatUsd = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
  const getUsdPriceForPlan = (planId: string) =>
    getPlanPriceForInterval(
      planId as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE",
      "USD",
      billingInterval
    );

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
    <div className="mx-auto w-full max-w-[1150px] space-y-8 pb-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-950/80 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <button
              type="button"
              className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] transition hover:underline dark:text-[#3B82F6]"
              onClick={() => router.push("/dashboard/subscription")}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("Back to manage plan", "Retour a la gestion du plan")}
            </button>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
              {t("Billing", "Facturation")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
              {t("Billing + subscriptions", "Facturation + abonnements")}
            </h1>
            <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              {t(
                "Choose a plan and continue to secure checkout. Prices are shown in USD, while billing currency depends on your selected provider, country, and supported checkout currency.",
                "Choisissez un plan puis continuez vers le paiement securise. Les prix sont affiches en USD, tandis que la devise de facturation depend du fournisseur choisi, du pays et des devises de paiement prises en charge."
              )}
            </p>
          </div>
          <div className="inline-flex w-max self-start items-center rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 font-semibold transition duration-150 ${
                billingInterval === "monthly"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
              }`}
            >
              {t("Monthly", "Mensuel")}
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 font-semibold transition duration-150 ${
                billingInterval === "yearly"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
              }`}
            >
              {t("Yearly (Save 10%)", "Annuel (10% off)")}
            </button>
          </div>
        </div>
        {checkoutError && (
          <div className="mt-5">
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{checkoutError}</span>
                {hasSubscriptionStateError ? (
                  <Button size="sm" variant="secondary" onClick={() => void mutateSubscriptions()}>
                    {t("Retry", "Reessayer")}
                  </Button>
                ) : null}
              </div>
            </Alert>
          </div>
        )}
      </section>

      {billingAccessResolved && !canManageWorkspaceSubscription ? (
        <Alert variant="error">
          {t(
            "Only the workspace owner or billing admin can manage subscription billing.",
            "Seul le proprietaire de l espace de travail ou l administrateur de facturation peut gerer l abonnement."
          )}
        </Alert>
      ) : (
        <>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <Card
          title={<span className="text-slate-900 dark:text-slate-100">{t("Select a plan", "Choisir un plan")}</span>}
          className="rounded-3xl !border-slate-200 !bg-white !text-slate-900 p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)] dark:!border-slate-800 dark:!bg-slate-950 dark:!text-slate-100"
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
                    disabled={checkoutLoading}
                    className={`flex h-full min-h-[196px] flex-col justify-between rounded-3xl border p-6 text-left shadow-[0_12px_28px_-24px_rgba(15,23,42,0.35)] transition duration-150 ${
                      isSelected
                        ? "scale-[1.01] border-blue-500 bg-blue-50/60 ring-1 ring-blue-300/50 dark:bg-blue-950/40 dark:ring-blue-700/50"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-900"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="space-y-3">
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                      <div className="text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                        {p.plan === "ENTERPRISE" || usdPrice == null
                          ? t("Contact sales", "Contacter ventes")
                          : formatUsd(usdPrice)}
                      </div>
                      {p.plan !== "ENTERPRISE" && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {billingInterval === "yearly"
                            ? t("per year (USD)", "par an (USD)")
                            : t("per month (USD)", "par mois (USD)")}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
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
          title={<span className="text-slate-900 dark:text-slate-100">{t("Payment", "Paiement")}</span>}
          className="rounded-3xl !border-slate-200 !bg-white !text-slate-900 p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)] dark:!border-slate-800 dark:!bg-slate-950 dark:!text-slate-100"
        >
          <div className="space-y-5">
            <div className="rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
              <div
                className={`grid gap-1 ${
                  availableProviders.length >= 3 ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {availableProviders.map((providerOption) => (
                  <button
                    key={providerOption}
                    type="button"
                    onClick={() => setProvider(providerOption)}
                    disabled={checkoutLoading}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition duration-150 ${
                      provider === providerOption
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-transparent text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {formatPaymentProviderLabel(providerOption)}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {provider === "PAYSTACK"
                  ? t("Paystack currency", "Devise Paystack")
                  : provider === "STRIPE"
                    ? t("Stripe billing currency", "Devise Stripe")
                  : t("Billing currency", "Devise de facturation")}
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={checkoutLoading}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {availableCurrencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              {providerCoverageText ? (
                <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {provider === "PAYSTACK"
                    ? t("Supported countries:", "Pays pris en charge :")
                    : t("Supported countries and regions:", "Pays et regions pris en charge :")}{" "}
                  {providerCoverageText}
                </span>
              ) : null}
            </label>

            <div className="space-y-3">
              <Button
                onClick={() => startProviderCheckout(provider)}
                disabled={checkoutDisabled}
                loading={subscriptionStateLoading || checkoutLoading}
                className="h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-base font-semibold shadow-[0_14px_26px_-18px_rgba(37,99,235,0.7)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                {checkoutLabel}
              </Button>
            </div>

            {isImmediateUpgrade ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800">
                {t(
                  "This change upgrades your plan immediately. We automatically apply credit for unused time on your current subscription and charge only the prorated difference.",
                  "Cette modification met votre plan a niveau immediatement. Le credit du temps non utilise est applique automatiquement et seule la difference au prorata est facturee."
                )}
              </p>
            ) : null}

            {isLockedCurrentPlanSelection ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                {t(
                  "You are already on this plan and billing cycle. Choose a higher plan or switch to yearly billing to continue.",
                  "Vous etes deja sur ce plan et ce cycle. Choisissez un plan superieur ou passez a l annuel pour continuer."
                )}
              </p>
            ) : null}

            {canRetryCurrentPlan ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
                {t(
                  "This subscription needs payment to stay active. Continue to retry billing for the current plan.",
                  "Cet abonnement doit etre paye pour rester actif. Continuez pour relancer la facturation du plan actuel."
                )}
              </p>
            ) : null}

            {isDowngradeSelection ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
                {t(
                  "Downgrades and shorter billing cycles are scheduled from the subscription page at the end of your current cycle.",
                  "Les downgrades et cycles plus courts se planifient depuis la page abonnement a la fin du cycle en cours."
                )}
              </p>
            ) : null}

            <p className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              {t(
                "You will be redirected to a secure payment page. Your local currency will be applied automatically where supported.",
                "Vous serez redirige vers une page de paiement securisee. Votre devise locale sera appliquee automatiquement lorsque c est pris en charge."
              )}
            </p>

            {selectedPlan ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {t("Selected plan:", "Plan choisi:")} <span className="font-semibold text-slate-950 dark:text-slate-50">
                  {planLabelMap[selectedPlan.label]
                    ? t(planLabelMap[selectedPlan.label].en, planLabelMap[selectedPlan.label].fr)
                    : selectedPlan.label}
                </span>
                <span className="ml-2 text-slate-500 dark:text-slate-400">
                  {billingInterval === "yearly" ? t("(Yearly)", "(Annuel)") : t("(Monthly)", "(Mensuel)")}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card
        id="recent-payments"
        title={<span className="text-slate-900 dark:text-slate-100">{t("Recent payments", "Paiements recents")}</span>}
        className="scroll-mt-24 rounded-3xl !border-slate-200 !bg-white !text-slate-900 p-7 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.2)] dark:!border-slate-800 dark:!bg-slate-950 dark:!text-slate-100"
      >
        {paymentsStateLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            {t("Loading recent payments...", "Chargement des paiements recents...")}
          </div>
        ) : paymentHistoryError && paymentRows.length === 0 ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t("Recent payments are unavailable.", "Les paiements recents sont indisponibles.")}{" "}
                {paymentHistoryError}
              </span>
              <Button size="sm" variant="secondary" onClick={() => void mutatePayments()}>
                {t("Retry", "Reessayer")}
              </Button>
            </div>
          </Alert>
        ) : paymentRows.length === 0 ? (
          <EmptyState
            title={t("No payments yet", "Aucun paiement")}
            description={t(
              "Your subscription payments will appear here once completed.",
              "Vos paiements d abonnement apparaitront ici."
            )}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse bg-white dark:bg-slate-950">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                    <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {t("Date", "Date")}
                    </th>
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
                      className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/60"
                    >
                      <td className="px-6 py-5 text-center text-sm text-slate-600 dark:text-slate-300">
                        {formatDateDMY(new Date(row.createdAt))}
                      </td>
                      <td className="px-6 py-5 text-center text-sm font-medium text-slate-700 dark:text-slate-200">
                        {formatPaymentProviderLabel(row.provider)}
                      </td>
                      <td className="px-6 py-5 text-center text-sm text-slate-600 dark:text-slate-300">
                        {String(row.currency || "").toUpperCase()}
                      </td>
                      <td className="px-6 py-5 text-center text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {formatCurrency(Number(row.amount || 0), row.currency)}
                      </td>
                      <td className="px-6 py-5 text-center">{renderStatusPill(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMorePayments ? (
              <div className="flex justify-center border-t border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPaymentsPageSize((current) => current + 1)}
                  loading={paymentsValidating && !paymentsLoading}
                >
                  {t("Load older payments", "Charger les paiements plus anciens")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("Billing questions? Email ", "Questions de facturation ? Ecrivez a ")}
        <a href={billingMailto} className="font-medium text-slate-700 hover:underline dark:text-slate-200">
          {billingEmail}
        </a>
        .
      </p>
        </>
      )}
    </div>
  );
}
