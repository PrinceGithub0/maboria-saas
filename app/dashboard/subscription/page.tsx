"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import { billingEmail, billingMailto } from "@/lib/billing/contact";
import { formatDateDMY } from "@/lib/date";
import { getScheduledDowngradeTargets } from "@/lib/subscription-downgrade-rules";

type SubscriptionRow = {
  id: string;
  plan: string;
  status: string;
  renewalDate: string;
  billingInterval?: string | null;
  interval?: string | null;
  autoRenew?: boolean | null;
  cancelAtPeriodEnd?: boolean | null;
  pendingPlan?: string | null;
  pendingEffectiveAt?: string | null;
  receiptUrl?: string | null;
};

type SubscriptionManagement = {
  provider: string | null;
  stateSource: "subscription" | "org_subscription" | "none";
  billingMode: "provider_portal" | "provider_external" | "unmanaged";
  portalPath: string | null;
  canManageAutoRenewInApp: boolean;
  canScheduleDowngradeInApp: boolean;
};

type SubscriptionSummaryResponse = {
  active: SubscriptionRow | null;
  hasReceipt: boolean;
  management: SubscriptionManagement;
};

type SubscriptionHistoryResponse = {
  items: SubscriptionRow[];
  pagination: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type MeResponse = {
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

export default function SubscriptionPage() {
  const router = useRouter();
  const { data: me } = useSWR<MeResponse>("/api/user/me", fetcher, {
    revalidateOnFocus: false,
  });
  const orgRole = String(me?.orgRole || "").toLowerCase();
  const canManageWorkspaceSubscription = orgRole === "owner" || orgRole === "billing_admin";
  const billingAccessResolved = me !== undefined;
  const {
    data: summaryData,
    error: summaryError,
    mutate: mutateSummary,
    isValidating: summaryValidating,
  } = useSWR<SubscriptionSummaryResponse>(
    billingAccessResolved && canManageWorkspaceSubscription ? "/api/subscription?scope=summary" : null,
    fetcher,
    {
    revalidateOnFocus: false,
    }
  );
  const getHistoryKey = (pageIndex: number, previousPageData: SubscriptionHistoryResponse | null) => {
    if (!billingAccessResolved || !canManageWorkspaceSubscription) return null;
    if (pageIndex > 0 && !previousPageData?.pagination?.nextCursor) return null;
    const params = new URLSearchParams();
    params.set("scope", "history");
    params.set("limit", "10");
    if (pageIndex > 0 && previousPageData?.pagination?.nextCursor) {
      params.set("cursor", previousPageData.pagination.nextCursor);
    }
    return `/api/subscription?${params.toString()}`;
  };
  const {
    data: historyPages,
    error: historyError,
    mutate: mutateHistory,
    isLoading: historyLoading,
    isValidating: historyValidating,
    setSize,
  } = useSWRInfinite<SubscriptionHistoryResponse>(getHistoryKey, fetcher, {
    revalidateFirstPage: true,
  });
  const isSummaryLoading = summaryData === undefined && !summaryError;
  const isHistoryLoading = historyPages === undefined && !historyError;
  const isLoading = isSummaryLoading || isHistoryLoading;
  const historyRows = useMemo(() => historyPages?.flatMap((page) => page.items) || [], [historyPages]);
  const accessError = summaryError?.message || null;
  const hasSummaryError = Boolean(summaryError && !summaryData);
  const hasHistoryError = Boolean(historyError && !historyPages);
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "info" | "success" | "error";
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [downgradePlan, setDowngradePlan] = useState("STARTER");
  const [downgradeActionLoading, setDowngradeActionLoading] = useState(false);
  const [renewalActionLoading, setRenewalActionLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const hasMoreHistory = Boolean(historyPages?.[historyPages.length - 1]?.pagination?.hasMore);

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return language === "fr" ? "Starter" : "Starter";
      case "PRO":
        return language === "fr" ? "Pro" : "Pro";
      case "GROWTH":
        return language === "fr" ? "Growth" : "Growth";
      case "BUSINESS":
        return language === "fr" ? "Business" : "Business";
      case "PREMIUM":
        return language === "fr" ? "Business" : "Business";
      case "ENTERPRISE":
        return language === "fr" ? "Entreprise" : "Enterprise";
      default:
        return plan;
    }
  };

  const activeSub = summaryData?.active || null;
  const activeSubStatus = String(activeSub?.status || "").toUpperCase();
  const planKey = String(activeSub?.plan || "").toUpperCase();
  const currentPlan = activeSub?.plan ? formatPlan(activeSub.plan) : t("No active plan", "Aucun plan actif");
  const hasReceipt = Boolean(summaryData?.hasReceipt);
  const management = summaryData?.management;
  const pendingPlan = activeSub?.pendingPlan ? String(activeSub.pendingPlan).toUpperCase() : null;
  const pendingEffectiveAt = activeSub?.pendingEffectiveAt ? new Date(activeSub.pendingEffectiveAt) : null;
  const downloadReceipt = () => {
    window.open("/api/subscription/receipt", "_blank", "noopener,noreferrer");
  };

  const formatProvider = (provider: string | null | undefined) => {
    const value = String(provider || "").toUpperCase();
    if (value === "PAYSTACK") return "Paystack";
    if (value === "FLUTTERWAVE") return "Flutterwave";
    if (value === "STRIPE") return "Stripe";
    return provider || t("billing provider", "fournisseur de facturation");
  };

  const planDescriptions: Record<string, { en: string; fr: string }> = {
    STARTER: {
      en: "Designed for individuals getting started with automations.",
      fr: "Concu pour les individus qui demarrent avec les automatisations.",
    },
    PRO: {
      en: "Built for professionals running active workflows.",
      fr: "Concu pour les professionnels avec des workflows actifs.",
    },
    GROWTH: {
      en: "Optimized for scaling teams and higher execution volume.",
      fr: "Optimise pour les equipes en croissance et volume eleve.",
    },
    BUSINESS: {
      en: "Optimized for scaling teams and higher execution volume.",
      fr: "Optimise pour les equipes en croissance et volume eleve.",
    },
    ENTERPRISE: {
      en: "Built for organizations running production workloads.",
      fr: "Concu pour les organisations avec charges de production.",
    },
  };

  const resolveInterval = (sub: any) => {
    const raw = String(sub?.billingInterval || sub?.interval || sub?.cadence || "").toLowerCase();
    if (raw.includes("year")) return t("Yearly", "Annuel");
    if (raw.includes("month")) return t("Monthly", "Mensuel");
    return t("Monthly", "Mensuel");
  };

  const resolveBillingStatus = (sub: any) => {
    const status = String(sub?.status || "").toUpperCase();
    if (status === "ACTIVE") return t("Active", "Actif");
    if (status === "PAST_DUE") return t("Past due", "En retard");
    if (status === "TRIALING") return t("Trial", "Essai");
    if (status === "CANCELED") return t("Canceled", "Annule");
    return t("Inactive", "Inactif");
  };

  const resolveBillingStatusDotClass = (sub: any) => {
    const status = String(sub?.status || "").toUpperCase();
    if (status === "ACTIVE") return "bg-emerald-500";
    if (status === "PAST_DUE") return "bg-amber-500";
    if (status === "TRIALING") return "bg-sky-500";
    if (status === "CANCELED") return "bg-slate-400";
    return "bg-muted-foreground";
  };

  const resolveUsage = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif");
    const key = String(sub?.plan || "").toUpperCase();
    if (key === "ENTERPRISE") return t("Unlimited usage", "Usage illimite");
    return t("Usage limits reset each billing cycle", "Les limites se reinitialisent a chaque cycle");
  };

  const resolveNextInvoice = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif");
    if (sub?.prepaid || sub?.id === "admin-override") return t("Included", "Inclus");
    if (sub?.renewalDate) return formatDateDMY(new Date(sub.renewalDate));
    return t("Contact support", "Contactez le support");
  };

  const resolveRenewal = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif");
    if (sub?.renewalDate) return formatDateDMY(new Date(sub.renewalDate));
    return t("Not scheduled", "Non planifie");
  };

  const resolveCurrentInterval = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif");
    return resolveInterval(sub);
  };

  const resolveAutoRenew = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif");
    if (management?.billingMode === "provider_portal") {
      return t("Managed in Stripe", "Gere dans Stripe");
    }
    if (management?.billingMode === "provider_external") {
      return t("Managed by provider", "Gere par le fournisseur");
    }
    if (sub?.cancelAtPeriodEnd === true || sub?.autoRenew === false) {
      return t("Off, ends at period close", "Desactive, fin au prochain terme");
    }
    if (sub?.autoRenew === true && sub?.cancelAtPeriodEnd === false) {
      return t("On, renews automatically", "Active, renouvellement automatique");
    }
    if (management?.stateSource === "org_subscription") {
      return t("Syncing billing state", "Synchronisation de l'etat");
    }
    return t("Unavailable", "Indisponible");
  };

  const handleDowngrade = async () => {
    setActionStatus(null);
    setDowngradeActionLoading(true);
    try {
      const res = await fetch("/api/subscription/downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: downgradePlan }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.code === "EXTERNAL_BILLING_PORTAL_REQUIRED" && payload?.portalPath) {
          await openBillingPortal(payload.portalPath);
          return;
        }

        setActionStatus({
          message: payload.error || t("Downgrade request failed.", "La demande de downgrade a echoue."),
          variant: "error",
        });
        return;
      }
      setActionStatus({
        message: t("Downgrade scheduled for your next billing cycle.", "Downgrade planifie au prochain cycle."),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setDowngradeActionLoading(false);
    }
  };

  const handleCancelPendingDowngrade = async () => {
    setActionStatus(null);
    setDowngradeActionLoading(true);
    try {
      const res = await fetch("/api/subscription/downgrade", {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionStatus({
          message:
            payload.error ||
            t(
              "Unable to cancel the pending downgrade.",
              "Impossible d annuler le downgrade en attente."
            ),
          variant: "error",
        });
        return;
      }
      setActionStatus({
        message: t(
          "Pending downgrade canceled. Your current plan will continue renewing as normal.",
          "Le downgrade en attente a ete annule. Votre plan actuel continuera de se renouveler normalement."
        ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setDowngradeActionLoading(false);
    }
  };

  const openBillingPortal = async (portalPath: string) => {
    setActionStatus(null);
    setPortalLoading(true);

    try {
      const res = await fetch(portalPath, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionStatus({
          message:
            payload.error ||
            t("Unable to open billing portal.", "Impossible d'ouvrir le portail de facturation."),
          variant: "error",
        });
        return false;
      }
      if (!payload?.url) {
        setActionStatus({
          message: t(
            "Billing portal is unavailable right now.",
            "Le portail de facturation est indisponible pour le moment."
          ),
          variant: "error",
        });
        return false;
      }
      window.location.href = payload.url;
      return true;
    } finally {
      setPortalLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!management?.portalPath) return;
    await openBillingPortal(management.portalPath);
  };

  const handleAutoRenewChange = async (enabled: boolean) => {
    setActionStatus(null);
    setRenewalActionLoading(true);

    try {
      const res = await fetch("/api/subscription/auto-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.code === "EXTERNAL_BILLING_PORTAL_REQUIRED" && payload?.portalPath) {
          await openBillingPortal(payload.portalPath);
          return;
        }

        setActionStatus({
          message:
            payload.error ||
            t("Unable to update auto-renew.", "Impossible de mettre a jour le renouvellement auto."),
          variant: "error",
        });
        return;
      }

      setShowCancelConfirm(false);
      setActionStatus({
        message: enabled
          ? t(
              "Auto-renew is active again for this subscription.",
              "Le renouvellement auto est de nouveau actif pour cet abonnement."
            )
          : t(
              "Auto-renew will stop at the end of the current billing period.",
              "Le renouvellement auto s arretera a la fin de la periode de facturation en cours."
            ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setRenewalActionLoading(false);
    }
  };

  const availableDowngradePlans = getScheduledDowngradeTargets(
    (planKey || "STARTER") as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE",
    pendingPlan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | null
  );
  const canManageActiveSubscription = Boolean(
    activeSub && ["ACTIVE", "PAST_DUE", "TRIALING"].includes(activeSubStatus)
  );
  const canManageAutoRenewInApp =
    canManageActiveSubscription && Boolean(management?.canManageAutoRenewInApp);
  const canScheduleDowngradeInApp =
    canManageActiveSubscription && Boolean(management?.canScheduleDowngradeInApp);
  const canOpenBillingPortal = management?.billingMode === "provider_portal" && Boolean(management.portalPath);
  const autoRenewDisabled = activeSub?.cancelAtPeriodEnd === true || activeSub?.autoRenew === false;
  const hasProviderManagedPendingDowngrade = Boolean(
    pendingPlan && canManageActiveSubscription && !canScheduleDowngradeInApp
  );

  useEffect(() => {
    if (availableDowngradePlans.length === 0) return;
    if (!(availableDowngradePlans as string[]).includes(downgradePlan)) {
      setDowngradePlan(availableDowngradePlans[0]);
    }
  }, [availableDowngradePlans, downgradePlan]);

  useEffect(() => {
    if ((autoRenewDisabled || !canManageAutoRenewInApp) && showCancelConfirm) {
      setShowCancelConfirm(false);
    }
  }, [autoRenewDisabled, canManageAutoRenewInApp, showCancelConfirm]);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between border-b border-border/40 pb-6 max-md:flex-col max-md:items-start max-md:gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("Subscription", "Abonnement")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Manage plan", "Gerer le plan")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Update your plan, billing, and renewal settings.", "Mettez a jour votre plan, la facturation et le renouvellement.")}
          </p>
        </div>
        <div className="flex gap-2 max-md:w-full">
          <Button
            className="max-md:w-full"
            onClick={() => Promise.all([mutateSummary(), mutateHistory()])}
            loading={summaryValidating || historyValidating}
          >
            {t("Refresh", "Actualiser")}
          </Button>
        </div>
      </div>

      {actionStatus && (
        <div>
          <TransientAlert variant={actionStatus.variant} onDismiss={() => setActionStatus(null)}>
            {actionStatus.message}
          </TransientAlert>
        </div>
      )}

      {accessError ? (
        <div>
          <Alert variant="error">{String(accessError)}</Alert>
        </div>
      ) : null}
      {billingAccessResolved && !canManageWorkspaceSubscription ? (
        <div>
          <Alert variant="error">
            {t(
              "Only the workspace owner or billing admin can manage the workspace subscription.",
              "Seul le proprietaire de l espace de travail ou l administrateur de facturation peut gerer l abonnement de l espace de travail."
            )}
          </Alert>
        </div>
      ) : isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-8 border-b border-border/40 pb-8 lg:grid-cols-[1.6fr_0.4fr]">
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
              <div className="h-8 w-64 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/40" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
              </div>
              <div className="h-11 w-36 animate-pulse rounded-lg bg-muted/40" />
            </div>
            <div className="space-y-3">
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded bg-muted/50" />
            <div className="h-40 animate-pulse rounded-2xl border border-border/40 bg-muted/20" />
          </div>
        </div>
      ) : hasSummaryError ? null : (
        <>
          <div className="grid gap-8 border-b border-border/40 pb-8 lg:grid-cols-[1.6fr_0.4fr]">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("Current plan", "Plan actuel")}</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">
                  {t("Current plan:", "Plan actuel :")} {currentPlan}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    planDescriptions[planKey]?.en || "Plan details are available after activation.",
                    planDescriptions[planKey]?.fr || "Details du plan disponibles apres activation."
                  )}
                </p>
              </div>
              <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Billing cycle", "Cycle")}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{resolveCurrentInterval(activeSub)}</p>
                    {activeSub && resolveCurrentInterval(activeSub) === t("Yearly", "Annuel") && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {t("Annual billing", "Facturation annuelle")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Usage model", "Usage")}</p>
                  <p className="font-medium text-foreground">{resolveUsage(activeSub)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Next invoice", "Prochaine facture")}</p>
                  <p className="font-medium text-foreground">{resolveNextInvoice(activeSub)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-md:flex-col max-md:items-stretch">
                <Button type="button" onClick={() => router.push("/dashboard/payments")}>
                  {t("Upgrade plan", "Mettre a niveau")}
                </Button>
                {canManageActiveSubscription && canOpenBillingPortal ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleOpenBillingPortal}
                    loading={portalLoading}
                  >
                    {t("Manage billing in Stripe", "Gerer la facturation dans Stripe")}
                  </Button>
                ) : null}
                {canManageAutoRenewInApp ? (
                  autoRenewDisabled ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleAutoRenewChange(true)}
                      loading={renewalActionLoading}
                    >
                      {t("Resume auto-renew", "Reprendre le renouvellement auto")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setShowCancelConfirm(true)}
                      loading={renewalActionLoading}
                    >
                      {t("Cancel auto-renew", "Desactiver le renouvellement auto")}
                    </Button>
                  )
                ) : null}
              </div>
              {showCancelConfirm && canManageAutoRenewInApp && !autoRenewDisabled ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
                  <p className="font-medium">
                    {t("Cancel at period end?", "Annuler a la fin de la periode ?")}
                  </p>
                  <p className="mt-1 text-rose-800 dark:text-rose-200">
                    {t(
                      "This stops future renewals and keeps your subscription active until the current billing period ends.",
                      "Cela arrete les renouvellements futurs et conserve votre abonnement actif jusqu'a la fin de la periode de facturation en cours."
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleAutoRenewChange(false)}
                      loading={renewalActionLoading}
                    >
                      {t("Yes, cancel auto-renew", "Oui, desactiver le renouvellement auto")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={renewalActionLoading}
                    >
                      {t("Keep subscription", "Garder l'abonnement")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {canManageActiveSubscription && management?.billingMode === "provider_external" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium">
                    {t("Billing changes are provider-managed.", "Les changements de facturation sont geres par le fournisseur.")}
                  </p>
                  <p className="mt-1 text-amber-800 dark:text-amber-200">
                    {t(
                      `Auto-renew changes for ${formatProvider(management.provider)} are not self-serve in the dashboard yet. Contact support if you need cancellation help.`,
                      `Les changements de renouvellement auto pour ${formatProvider(management.provider)} ne sont pas encore disponibles dans le tableau de bord. Contactez le support si vous avez besoin d'aide pour une annulation.`
                    )}
                  </p>
                </div>
              ) : null}
              {canManageActiveSubscription && management?.stateSource === "org_subscription" ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                  <p className="font-medium">
                    {t("Billing state is syncing.", "L'etat de facturation se synchronise.")}
                  </p>
                  <p className="mt-1 text-sky-800 dark:text-sky-200">
                    {t(
                      "Some renewal controls stay hidden until the subscription mirror is fully synced.",
                      "Certains controles de renouvellement restent masques jusqu'a la synchronisation complete du miroir d'abonnement."
                    )}
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("Downgrade", "Downgrade")}</p>
                    <p className="mt-2 font-medium text-foreground">
                      {hasProviderManagedPendingDowngrade
                        ? t(
                            `A legacy dashboard downgrade to ${formatPlan(pendingPlan!)} is still recorded locally.`,
                            `Un ancien downgrade du tableau de bord vers ${formatPlan(pendingPlan!)} est encore enregistre localement.`
                          )
                        : pendingPlan
                        ? t(`Pending downgrade to ${formatPlan(pendingPlan)}.`, `Downgrade vers ${formatPlan(pendingPlan)} en attente.`)
                        : t("Schedule a downgrade for the next billing cycle.", "Planifier un downgrade au prochain cycle.")}
                    </p>
                    {pendingEffectiveAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("Effective", "Effectif")} {formatDateDMY(pendingEffectiveAt)}
                      </p>
                    )}
                    {hasProviderManagedPendingDowngrade ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        {t(
                          "Provider-managed billing will not apply this local downgrade automatically. Clear it here and manage the change with your billing provider.",
                          "La facturation geree par le fournisseur n appliquera pas automatiquement ce downgrade local. Supprimez-le ici puis gerez le changement avec votre fournisseur de facturation."
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pendingPlan && canManageActiveSubscription ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleCancelPendingDowngrade}
                        loading={downgradeActionLoading}
                      >
                        {t("Undo pending downgrade", "Annuler le downgrade en attente")}
                      </Button>
                    ) : canScheduleDowngradeInApp && availableDowngradePlans.length > 0 ? (
                      <>
                        <select
                          value={downgradePlan}
                          onChange={(event) => setDowngradePlan(event.target.value)}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          disabled={downgradeActionLoading}
                        >
                          {availableDowngradePlans.map((plan) => (
                            <option key={plan} value={plan}>
                              {formatPlan(plan)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleDowngrade}
                          loading={downgradeActionLoading}
                        >
                          {t("Schedule downgrade", "Planifier")}
                        </Button>
                      </>
                    ) : canManageActiveSubscription && canOpenBillingPortal ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleOpenBillingPortal}
                        loading={portalLoading}
                      >
                        {t("Manage downgrade in Stripe", "Gerer le downgrade dans Stripe")}
                      </Button>
                    ) : canManageActiveSubscription && management?.billingMode === "provider_external" ? (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          `Downgrades for ${formatProvider(management.provider)} are handled outside the dashboard. Contact support if you need help.`,
                          `Les downgrades pour ${formatProvider(management.provider)} sont geres hors du tableau de bord. Contactez le support si vous avez besoin d aide.`
                        )}
                      </p>
                    ) : canScheduleDowngradeInApp ? (
                      <p className="text-xs text-muted-foreground">
                        {t("No lower tiers available for this plan.", "Aucun plan inferieur disponible.")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Downgrade controls are unavailable without an active subscription.",
                          "Le downgrade n est pas disponible sans abonnement actif."
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {canScheduleDowngradeInApp
                  ? t(
                      "Upgrades apply immediately with prorated credit. Downgrades are scheduled for the next cycle and applied by the billing job.",
                      "Les upgrades s appliquent immediatement avec credit au prorata. Les downgrades sont planifies pour le cycle suivant et appliques par la tache de facturation."
                    )
                  : management?.billingMode === "provider_portal"
                    ? t(
                        "Upgrades still start in checkout. Downgrades and billing-cycle changes for this subscription are managed in Stripe.",
                        "Les upgrades demarrent toujours au paiement. Les downgrades et changements de cycle de facturation pour cet abonnement sont geres dans Stripe."
                      )
                    : management?.billingMode === "provider_external"
                      ? t(
                          "Upgrades still start in checkout. Downgrades and billing-cycle changes for this subscription are managed outside the dashboard.",
                          "Les upgrades demarrent toujours au paiement. Les downgrades et changements de cycle de facturation pour cet abonnement sont geres hors du tableau de bord."
                        )
                      : t(
                          "Upgrades apply immediately with prorated credit.",
                          "Les upgrades s appliquent immediatement avec credit au prorata."
                        )}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">{t("Billing status", "Statut de facturation")}</span>
                <span className="inline-flex items-center justify-end gap-2 font-medium text-foreground">
                  <span className={`h-2 w-2 rounded-full ${resolveBillingStatusDotClass(activeSub)}`} />
                  {resolveBillingStatus(activeSub)}
                </span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">{t("Renews", "Renouvellement")}</span>
                <span className="text-right font-medium text-foreground">{resolveRenewal(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">{t("Next invoice", "Prochaine facture")}</span>
                <span className="text-right font-medium text-foreground">{resolveNextInvoice(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">{t("Usage", "Usage")}</span>
                <span className="max-w-[220px] text-right font-medium text-foreground">{resolveUsage(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-t border-border/40 pt-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">{t("Auto-renew", "Renouvellement auto")}</span>
                <span className="text-right font-medium text-foreground">{resolveAutoRenew(activeSub)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start">
              <h2 className="text-lg font-semibold text-foreground">{t("Subscription history", "Historique des abonnements")}</h2>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-full border border-slate-300/90 bg-white px-5 text-sm font-medium text-slate-900 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:!border-slate-400 hover:!bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:!border-slate-500 dark:hover:!bg-slate-900"
                  onClick={() => router.push("/dashboard/payments#recent-payments")}
                >
                  <ArrowUpRight className="h-4 w-4 opacity-70" />
                  {t("View recent payments", "Voir les paiements recents")}
                </Button>
                {hasReceipt && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-full border border-slate-200/90 bg-slate-50 px-5 text-sm font-medium text-slate-700 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.28)] transition duration-200 hover:-translate-y-0.5 hover:!border-slate-300 hover:!bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:!border-slate-500 dark:hover:!bg-slate-900 dark:hover:!text-slate-100"
                    onClick={downloadReceipt}
                  >
                    <ReceiptText className="h-4 w-4 opacity-70" />
                    {t("Download latest receipt", "Telecharger le dernier recu")}
                  </Button>
                )}
              </div>
            </div>
            {hasHistoryError ? (
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t("Subscription history is unavailable.", "L historique des abonnements est indisponible.")}{" "}
                    {historyError?.message}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void mutateHistory()}>
                    {t("Retry", "Reessayer")}
                  </Button>
                </div>
              </Alert>
            ) : historyRows.length === 0 ? (
              <Alert variant="info">{t("No subscription history yet.", "Aucun historique d abonnement pour le moment.")}</Alert>
            ) : (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-border/40">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/20 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">{t("Plan", "Plan")}</th>
                        <th className="px-4 py-3">{t("Status", "Statut")}</th>
                        <th className="px-4 py-3">{t("Renews", "Renouvellement")}</th>
                        <th className="px-4 py-3">{t("Usage", "Usage")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-t border-border/30">
                          <td className="px-4 py-3 font-medium text-foreground">{formatPlan(row.plan)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${resolveBillingStatusDotClass(row)}`} />
                              {resolveBillingStatus(row)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{resolveRenewal(row)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{resolveUsage(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreHistory ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSize((current) => current + 1)}
                      loading={historyValidating && !historyLoading}
                    >
                      {t("Load older history", "Charger l historique plus ancien")}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {t("Billing questions? Email ", "Questions de facturation ? Ecrivez a ")}
        <a href={billingMailto} className="font-medium text-foreground hover:underline">
          {billingEmail}
        </a>
        .
      </p>
    </div>
  );
}
