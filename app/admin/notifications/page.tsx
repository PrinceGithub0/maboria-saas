"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { translateNotificationMessage } from "@/lib/notifications/translate";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminNotificationsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, isLoading } = useSWR("/api/admin/notifications", fetcher);
  const alerts = Array.isArray(data) ? data : [];
  const totalCount = alerts.length;
  const unreadCount = alerts.filter((item: any) => item.severity === "critical").length;
  const recentCount = alerts.filter((item: any) => {
    const created = new Date(item.createdAt || 0).getTime();
    return Number.isFinite(created) && created > Date.now() - 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Notifications", "Notifications")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Critical alerts and platform-wide notices.", "Alertes critiques et avis globaux.")}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3 max-md:grid-cols-1 max-md:gap-5">
        {isLoading ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            <Card title={t("Total alerts", "Alertes totales")}>
              <p className="text-2xl font-semibold text-foreground">{totalCount}</p>
            </Card>
            <Card title={t("Unread", "Non lues")}>
              <p className="text-2xl font-semibold text-foreground">{unreadCount}</p>
            </Card>
            <Card title={t("Last 24h", "Dernieres 24h")}>
              <p className="text-2xl font-semibold text-foreground">{recentCount}</p>
            </Card>
          </>
        )}
      </div>
      <Card title={t("System alerts", "Alertes systeme")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={alerts}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "type", label: t("Type", "Type") },
              {
                key: "severity",
                label: t("Severity", "Gravite"),
                render: (row: any) => (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.severity === "critical"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-200"
                        : row.severity === "warning"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-200"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                    }`}
                  >
                    {row.severity}
                  </span>
                ),
              },
              {
                key: "message",
                label: t("Message", "Message"),
                render: (row: any) =>
                  translateNotificationMessage({
                    message: row.message,
                    language: language === "fr" ? "fr" : "en",
                  }),
              },
              {
                key: "createdAt",
                label: t("Time", "Heure"),
                render: (row: any) => new Date(row.createdAt).toLocaleString(),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
