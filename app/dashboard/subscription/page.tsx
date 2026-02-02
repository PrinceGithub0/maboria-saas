"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SubscriptionPage() {
  const router = useRouter();
  const { data, mutate, isValidating } = useSWR("/api/subscription", fetcher);
  const subs = data || [];
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [actionStatus] = useState<{ message: string; variant: "info" | "success" | "error" } | null>(
    null
  );

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

  const activeSub = subs.find((sub: any) => ["ACTIVE", "PAST_DUE"].includes(sub.status));
  const planKey = String(activeSub?.plan || "").toUpperCase();
  const currentPlan = activeSub?.plan ? formatPlan(activeSub.plan) : t("No active plan", "Aucun plan actif");
  const hasReceipt = subs.some((sub: any) => Boolean(sub?.receiptUrl));
  const downloadReceipt = () => {
    window.open("/api/subscription/receipt", "_blank", "noopener,noreferrer");
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
    if (status === "CANCELED") return t("Canceled", "Annule");
    return t("Inactive", "Inactif");
  };

  const resolveUsage = (sub: any) => {
    const key = String(sub?.plan || "").toUpperCase();
    if (key === "ENTERPRISE") return t("Unlimited usage", "Usage illimite");
    return t("Usage limits reset each billing cycle", "Les limites se reinitialisent a chaque cycle");
  };

  const resolveNextInvoice = (sub: any) => {
    if (sub?.prepaid || sub?.id === "admin-override") return t("Included", "Inclus");
    if (sub?.renewalDate) return formatDateDMY(new Date(sub.renewalDate));
    return t("Contact support", "Contactez le support");
  };

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
          <Button className="max-md:w-full" onClick={() => mutate(undefined, { revalidate: true })} loading={isValidating}>
            {t("Refresh", "Actualiser")}
          </Button>
        </div>
      </div>

      {actionStatus && (
        <div>
          <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
        </div>
      )}

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
                <p className="font-medium text-foreground">{resolveInterval(activeSub)}</p>
                {resolveInterval(activeSub) === t("Yearly", "Annuel") && (
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
            <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/payments")}>
              {t("Downgrade plan", "Retrograder")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Plan changes are handled securely during checkout.", "Les changements se font en toute securite au paiement.")}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t("Billing status", "Statut de facturation")}</span>
            <span className="inline-flex items-center gap-2 font-medium text-foreground">
              <span className={`h-2 w-2 rounded-full ${resolveBillingStatus(activeSub) === t("Active", "Actif") ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              {resolveBillingStatus(activeSub)}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t("Renews", "Renouvellement")}</span>
            <span className="font-medium text-foreground">{resolveInterval(activeSub)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t("Next invoice", "Prochaine facture")}</span>
            <span className="font-medium text-foreground">{resolveNextInvoice(activeSub)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("Usage", "Usage")}</span>
            <span className="font-medium text-foreground">{resolveUsage(activeSub)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("Billing history", "Historique de facturation")}</h2>
          {hasReceipt && (
            <Button type="button" variant="secondary" onClick={downloadReceipt}>
              {t("Download receipt", "Telecharger le recu")}
            </Button>
          )}
        </div>
        {subs.length === 0 ? (
          <Alert variant="info">{t("No billing history yet.", "Aucun historique de facturation pour le moment.")}</Alert>
        ) : (
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
                {subs.map((row: any) => (
                  <tr key={row.id} className="border-t border-border/30">
                    <td className="px-4 py-3 font-medium text-foreground">{formatPlan(row.plan)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${resolveBillingStatus(row) === t("Active", "Actif") ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                        {resolveBillingStatus(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{resolveInterval(row)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{resolveUsage(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
