"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || res.statusText);
  }
  return res.json();
};

export default function PrelaunchPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, isLoading, isValidating, mutate } = useSWR("/api/admin/prelaunch", fetcher);
  const [isRunning, setIsRunning] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const checks = Array.isArray(data) ? data : [];
  const totalChecks = checks.length;
  const okChecks = checks.filter((row: any) => row.status === "ok").length;
  const pendingChecks = checks.filter((row: any) => row.status === "pending").length;
  const failChecks = checks.filter((row: any) => row.status === "fail").length;
  const readiness = totalChecks ? Math.round((okChecks / totalChecks) * 100) : 0;
  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
            <h1 className="text-3xl font-semibold text-foreground">{t("Pre-launch checklist", "Checklist pre-lancement")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("Launch readiness at a glance.", "Pret pour le lancement en un coup d'oeil.")}</p>
          </div>
          <Button
            type="button"
            onClick={async () => {
              setIsRunning(true);
              setSuccessMessage("");
              try {
                await mutate(() => fetcher("/api/admin/prelaunch"), { revalidate: false });
                setSuccessMessage(t("Checks completed.", "Verifications terminees."));
              } finally {
                setIsRunning(false);
              }
            }}
            disabled={isValidating || isRunning}
          >
            {isValidating || isRunning ? t("Running...", "En cours...") : t("Run checks", "Lancer les controles")}
          </Button>
        </div>
      </div>
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
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
            <Card title={t("Ready", "Pret")}>
              <p className="text-2xl font-semibold text-foreground">{okChecks}</p>
            </Card>
            <Card title={t("Pending", "En attente")}>
              <p className="text-2xl font-semibold text-foreground">{pendingChecks}</p>
            </Card>
            <Card title={t("Blocked", "Bloque")}>
              <p className="text-2xl font-semibold text-foreground">{failChecks}</p>
            </Card>
            <Card title={t("Readiness", "Preparation")}>
              <p className="text-2xl font-semibold text-foreground">{readiness}%</p>
            </Card>
          </>
        )}
      </div>
      <Card title={t("Checklist", "Checklist")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={checks}
            keyExtractor={(row: any) => row.item}
            columns={[
              { key: "item", label: t("Item", "Element") },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) => {
                  const variant =
                    row.status === "ok" ? "success" : row.status === "fail" ? "danger" : "warning";
                  return <Badge variant={variant}>{row.status}</Badge>;
                },
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
