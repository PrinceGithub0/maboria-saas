"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateTimeDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AutomationErrorsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, isLoading, mutate } = useSWR("/api/admin/automation/errors", fetcher);
  const runs = Array.isArray(data) ? data : [];
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const errorCount = runs.length;
  const uniqueFlows = new Set(runs.map((row: any) => row.flow?.title || row.flow?.id)).size;
  const uniqueUsers = new Set(runs.map((row: any) => row.user?.email || row.user?.id)).size;
  const latestFailure = runs[0]?.createdAt
    ? formatDateTimeDMY(new Date(runs[0].createdAt))
    : "N/A";
  const flowCounts = runs.reduce((acc: Record<string, number>, row: any) => {
    const key = row.flow?.title || "Unknown flow";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topFlows = Object.entries(flowCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const replay = async (id: string) => {
    setActionLoading(id);
    setActionStatus(null);
    const res = await fetch("/api/admin/automation/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: id }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Replay failed.", "Relance echouee."), variant: "error" });
    } else {
      setActionStatus({ message: t("Replay requested.", "Relance demandee."), variant: "success" });
    }
    await mutate();
    setActionLoading(null);
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Automation errors", "Erreurs d'automatisation")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Recover failed runs and keep automation reliability visible.", "Recuperez les runs echoues et suivez la fiabilite.")}
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4 max-md:grid-cols-1 max-md:gap-5">
        {isLoading ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            <Card title={t("Failed runs", "Runs echoues")}>
              <p className="text-2xl font-semibold text-foreground">{errorCount}</p>
            </Card>
            <Card title={t("Impacted flows", "Flux touches")}>
              <p className="text-2xl font-semibold text-foreground">{uniqueFlows}</p>
            </Card>
            <Card title={t("Impacted users", "Utilisateurs touches")}>
              <p className="text-2xl font-semibold text-foreground">{uniqueUsers}</p>
            </Card>
            <Card title={t("Latest failure", "Dernier echec")}>
              <p className="text-sm font-semibold text-foreground">{latestFailure}</p>
            </Card>
          </>
        )}
      </div>
      <Card title={t("Most impacted flows", "Flux les plus touches")}>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : topFlows.length ? (
          <div className="space-y-2">
            {topFlows.map(([flow, count]) => (
              <div
                key={flow}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-4 py-2"
              >
                <p className="text-sm font-semibold text-foreground">{flow}</p>
                <span className="text-xs text-muted-foreground">{count} {t("failure(s)", "echec(s)")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("No failed runs recorded.", "Aucun run en echec.")}</p>
        )}
      </Card>
      <Card>
        {actionStatus && (
          <div className="mb-3">
            <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
          </div>
        )}
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <Table
            data={runs}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "flow", label: t("Flow", "Flux"), render: (row: any) => row.flow?.title },
              { key: "user", label: t("User", "Utilisateur"), render: (row: any) => row.user?.email },
              { key: "runStatus", label: t("Status", "Statut") },
              {
                key: "createdAt",
                label: t("Created", "Cree"),
                render: (row: any) => formatDateTimeDMY(new Date(row.createdAt)),
              },
              {
                key: "actions",
                label: t("Actions", "Actions"),
                render: (row: any) => (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={actionLoading === row.id}
                      onClick={() => replay(row.id)}
                    >
                      {t("Replay", "Relancer")}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
