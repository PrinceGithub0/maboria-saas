"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SubscriptionPage() {
  const router = useRouter();
  const { data, mutate } = useSWR("/api/subscription", fetcher);
  const subs = data || [];
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [actionStatus, setActionStatus] = useState<{ message: string; variant: "info" | "success" | "error" } | null>(
    null
  );

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return language === "fr" ? "Starter" : "Starter";
      case "GROWTH":
      case "PREMIUM":
        return language === "fr" ? "Pro" : "Pro";
      case "ENTERPRISE":
        return language === "fr" ? "Entreprise" : "Enterprise";
      default:
        return plan;
    }
  };

  const trialSub = subs.find((sub: any) => sub.status === "TRIALING");
  const activeSub = subs.find((sub: any) => ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status));
  const currentPlan = activeSub?.plan ? formatPlan(activeSub.plan) : t("No active plan", "Aucun plan actif");

  const cancelTrial = async () => {
    if (!trialSub) return;
    setActionStatus(null);
    const res = await fetch("/api/subscription/cancel-trial", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({
        message: json.error || t("Could not cancel trial.", "Impossible d annuler l essai."),
        variant: "error",
      });
      return;
    }
    setActionStatus({
      message: t("Trial cancelled. Your account is now on the free plan.", "Essai annule. Votre compte est en plan gratuit."),
      variant: "success",
    });
    mutate();
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {t("Subscription", "Abonnement")}
            </p>
            <h1 className="text-3xl font-semibold text-foreground">{t("Manage plan", "Gerer le plan")}</h1>
          </div>
          <div className="flex gap-2 max-md:w-full">
            <Button className="max-md:w-full" onClick={() => mutate()}>
              {t("Refresh", "Actualiser")}
            </Button>
          </div>
        </div>
        {actionStatus && <div className="mt-4"><Alert variant={actionStatus.variant}>{actionStatus.message}</Alert></div>}
      </div>
      <Card title={t("Upgrade or downgrade", "Mettre a niveau ou retrograder")}>
        <p className="text-sm text-muted-foreground">{t("Current plan:", "Plan actuel :")} {currentPlan}</p>
        <div className="mt-3 flex flex-wrap gap-2 max-md:flex-col max-md:items-stretch">
          <Button type="button" onClick={() => router.push("/dashboard/payments")}>
            {t("Upgrade plan", "Mettre a niveau")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/payments")}>
            {t("Downgrade plan", "Retrograder")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Plan changes are handled during checkout. Choose your new plan and payment method.",
            "Les changements se font au paiement. Choisissez le plan et le moyen de paiement."
          )}
        </p>
      </Card>
      <Card title={t("Current plan", "Plan actuel")}>
        {subs.length === 0 ? (
          <Alert variant="info">{t("No subscription yet.", "Aucun abonnement pour le moment.")}</Alert>
        ) : (
          <Table
            data={subs}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "plan", label: t("Plan", "Plan"), render: (row: any) => formatPlan(row.plan) },
              { key: "status", label: t("Status", "Statut") },
              {
                key: "renewalDate",
                label: t("Renews", "Renouvellement"),
                render: (row: any) =>
                  row?.id === "admin-override"
                    ? t("Unlimited", "Illimite")
                    : new Date(row.renewalDate).toLocaleDateString(),
              },
              { key: "usageLimit", label: t("Usage limit", "Limite d usage") },
            ]}
          />
        )}
      </Card>
      {trialSub ? (
        <Card title={t("Trial cancellation", "Annulation essai")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Your trial will auto-renew unless you cancel it before the end date.",
              "L essai se renouvelle automatiquement sauf annulation."
            )}
          </p>
          <div className="mt-3">
            <Button variant="secondary" className="max-md:w-full" onClick={cancelTrial}>
              {t("Cancel trial", "Annuler essai")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
