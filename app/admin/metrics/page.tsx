"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminMetricsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, isLoading } = useSWR("/api/admin/revenue", fetcher);
  const metrics = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const revenueRows = Array.isArray(metrics.revenueByCurrency) ? metrics.revenueByCurrency : [];
  const usdAmount = Number(revenueRows.find((r: any) => r.currency === "USD")?.amount || 0);
  const ngnAmount = Number(revenueRows.find((r: any) => r.currency === "NGN")?.amount || 0);
  const totalCurrencies = revenueRows.length;

  return (
    <div className="space-y-6 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Engine metrics", "Metriques moteur")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Subscription health, revenue coverage, and churn exposure in one view.", "Sante des abonnements, revenus, et churn en un seul ecran.")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6 max-md:grid-cols-1 max-md:gap-5">
        {isLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Card title={t("Active subs", "Abos actifs")}>
              <p className="text-3xl font-semibold text-foreground">{metrics.activeSubs ?? 0}</p>
            </Card>
            <Card title={t("Trials", "Essais")}>
              <p className="text-3xl font-semibold text-foreground">{metrics.trials ?? 0}</p>
            </Card>
            <Card title={t("USD plans", "Plans USD")}>
              <p className="text-3xl font-semibold text-foreground">{metrics.mrrUsd ?? 0}</p>
            </Card>
            <Card title={t("NGN plans", "Plans NGN")}>
              <p className="text-3xl font-semibold text-foreground">{metrics.mrrNgn ?? 0}</p>
            </Card>
            <Card title={t("Revenue (USD)", "Revenu (USD)")}>
              <p className="text-3xl font-semibold text-foreground">{formatCurrency(usdAmount, "USD")}</p>
            </Card>
            <Card title={t("Revenue (NGN)", "Revenu (NGN)")}>
              <p className="text-3xl font-semibold text-foreground">{formatCurrency(ngnAmount, "NGN")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${totalCurrencies} currency streams`, `${totalCurrencies} flux devises`)}
              </p>
            </Card>
          </>
        )}
      </div>

      <Card title={t("Churn/failures", "Churn/echecs")}>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <MiniAreaChart
            data={[
              { name: t("Fail", "Echec"), value: metrics.failedPayments || 0 },
              { name: t("Active", "Actif"), value: metrics.activeSubs || 0 },
            ]}
          />
        )}
      </Card>

      <Card title={t("Revenue by currency", "Revenu par devise")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={revenueRows}
            keyExtractor={(row: any) => row.currency}
            columns={[
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
            ]}
          />
        )}
      </Card>
    </div>
  );
}
