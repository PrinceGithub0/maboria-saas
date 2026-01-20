"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminLogsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [webhookStatus, setWebhookStatus] = useState("all");
  const [webhookProvider, setWebhookProvider] = useState("all");
  const [webhookQuery, setWebhookQuery] = useState("");
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { data: activity, isLoading: loadingActivity } = useSWR("/api/admin/logs/activity", fetcher);
  const webhookUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (webhookStatus !== "all") params.set("status", webhookStatus);
    if (webhookProvider !== "all") params.set("provider", webhookProvider);
    if (webhookQuery.trim()) params.set("q", webhookQuery.trim());
    const query = params.toString();
    return `/api/admin/logs/webhooks${query ? `?${query}` : ""}`;
  }, [webhookProvider, webhookQuery, webhookStatus]);
  const { data: webhooks, isLoading: loadingWebhooks, mutate: mutateWebhooks } = useSWR(
    webhookUrl,
    fetcher
  );
  const activityRows = Array.isArray(activity) ? activity : [];
  const webhookRows = Array.isArray(webhooks) ? webhooks : [];
  const activityCount = activityRows.length;
  const webhookCount = webhookRows.length;
  const webhookFailures = webhookRows.filter((row: any) => row.status === "FAILED").length;
  const webhookStatusLabel = (status: string) => {
    switch (status) {
      case "RECEIVED":
        return t("Received", "Recu");
      case "PROCESSED":
        return t("Processed", "Traite");
      case "FAILED":
        return t("Failed", "Echec");
      case "RESOLVED":
        return t("Resolved", "Resolue");
      case "ARCHIVED":
        return t("Archived", "Archive");
      case "REPLAY_REQUESTED":
        return t("Replay requested", "Relance demandee");
      default:
        return t("All", "Tous");
    }
  };

  const applyWebhookStatus = async (id: string, action: "replay" | "resolve" | "archive") => {
    const nextStatus =
      action === "resolve" ? "RESOLVED" : action === "archive" ? "ARCHIVED" : "REPLAY_REQUESTED";
    setActionLoading(`${action}:${id}`);
    setActionStatus(null);
    await mutateWebhooks(
      (current: any[] = []) =>
        current.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
      { revalidate: false }
    );
    const res = await fetch(`/api/admin/webhooks/${id}/${action}`, { method: "POST" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Webhook action failed.", "Action webhook echouee."), variant: "error" });
      await mutateWebhooks();
    } else {
      const actionLabel = action === "replay" ? "Replay requested" : `${action}d`;
      setActionStatus({
        message: t(`Webhook ${actionLabel}.`, `Webhook ${actionLabel}.`),
        variant: "success",
      });
      await mutateWebhooks();
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("System logs", "Journaux systeme")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Operational events, webhooks, and audit activity.", "Evenements, webhooks et audit operationnel.")}</p>
        </div>
      </div>
      <Card title={t("Log summary", "Resume des logs")}>
        {loadingActivity || loadingWebhooks ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Activity entries", "Entrees activite")}</p>
              <p className="text-2xl font-semibold text-foreground">{activityCount}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Webhook events", "Evenements webhook")}</p>
              <p className="text-2xl font-semibold text-foreground">{webhookCount}</p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Failed webhooks", "Webhooks en echec")}</p>
                <p className="text-2xl font-semibold text-foreground">{webhookFailures}</p>
              </div>
              <Badge variant={webhookFailures ? "danger" : "success"}>
                {webhookFailures ? t("Needs review", "A revoir") : t("Healthy", "Sain")}
              </Badge>
            </div>
          </div>
        )}
      </Card>
      <Tabs
        tabs={[
          {
            id: "activity",
            label: t("Activity", "Activite"),
            content: (
              <Card title={t("Activity logs", "Journaux activite")}>
                {loadingActivity ? (
                  <Skeleton className="h-24" />
                ) : (
                  <Table
                    data={activityRows}
                    keyExtractor={(row: any) => row.id}
                    columns={[
                      { key: "action", label: t("Action", "Action") },
                      { key: "userId", label: t("User", "Utilisateur") },
                      {
                        key: "timestamp",
                        label: t("Time", "Heure"),
                        render: (row: any) => new Date(row.timestamp).toLocaleString(),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
          {
            id: "webhooks",
            label: t("Webhooks", "Webhooks"),
            content: (
              <Card title={t("Webhook logs", "Journaux webhook")}>
                {actionStatus && (
                  <div className="mb-3">
                    <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
                  </div>
                )}
                <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_180px_auto] max-md:grid-cols-1">
                  <Input
                    placeholder={t("Search by event ID", "Rechercher par ID d'evenement")}
                    value={webhookQuery}
                    onChange={(event) => setWebhookQuery(event.target.value)}
                  />
                  <label className="text-xs text-muted-foreground">
                    {t("Status", "Statut")}
                    <select
                      value={webhookStatus}
                      onChange={(event) => setWebhookStatus(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
                    >
                      <option value="all">{t("All", "Tous")}</option>
                      <option value="RECEIVED">{webhookStatusLabel("RECEIVED")}</option>
                      <option value="PROCESSED">{webhookStatusLabel("PROCESSED")}</option>
                      <option value="FAILED">{webhookStatusLabel("FAILED")}</option>
                      <option value="RESOLVED">{webhookStatusLabel("RESOLVED")}</option>
                      <option value="ARCHIVED">{webhookStatusLabel("ARCHIVED")}</option>
                      <option value="REPLAY_REQUESTED">{webhookStatusLabel("REPLAY_REQUESTED")}</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    {t("Provider", "Fournisseur")}
                    <select
                      value={webhookProvider}
                      onChange={(event) => setWebhookProvider(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
                    >
                      <option value="all">{t("All", "Tous")}</option>
                      <option value="PAYSTACK">Paystack</option>
                      <option value="FLUTTERWAVE">Flutterwave</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <Button variant="secondary" onClick={() => mutateWebhooks()}>
                      {t("Refresh", "Rafraichir")}
                    </Button>
                  </div>
                </div>
                {loadingWebhooks ? (
                  <Skeleton className="h-24" />
                ) : (
                  <Table
                    data={webhookRows}
                    keyExtractor={(row: any) => row.id}
                    columns={[
                      {
                        key: "provider",
                        label: t("Provider", "Fournisseur"),
                        render: (row: any) => String(row.provider || "").toUpperCase(),
                      },
                      {
                        key: "status",
                        label: t("Status", "Statut"),
                        render: (row: any) => (
                          <Badge
                            variant={
                              row.status === "FAILED"
                                ? "danger"
                                : row.status === "REPLAY_REQUESTED"
                                  ? "warning"
                                  : row.status === "PROCESSED" || row.status === "RESOLVED"
                                    ? "success"
                                    : "default"
                            }
                          >
                            {webhookStatusLabel(row.status)}
                          </Badge>
                        ),
                      },
                      { key: "eventId", label: t("Event ID", "ID evenement") },
                      {
                        key: "receivedAt",
                        label: t("Time", "Heure"),
                        render: (row: any) => new Date(row.receivedAt).toLocaleString(),
                      },
                      {
                        key: "error",
                        label: t("Error", "Erreur"),
                        render: (row: any) => row.error || "-",
                      },
                      {
                        key: "actions",
                        label: t("Actions", "Actions"),
                        render: (row: any) => (
                          <div className="flex gap-2">
                            <button
                              className="text-xs text-indigo-600 dark:text-indigo-300"
                              disabled={actionLoading === `replay:${row.id}`}
                              onClick={() => applyWebhookStatus(row.id, "replay")}
                            >
                              {t("Replay", "Relancer")}
                            </button>
                            <button
                              className="text-xs text-emerald-700 dark:text-emerald-300"
                              disabled={actionLoading === `resolve:${row.id}`}
                              onClick={() => applyWebhookStatus(row.id, "resolve")}
                            >
                              {t("Resolve", "Resoudre")}
                            </button>
                            <button
                              className="text-xs text-muted-foreground"
                              disabled={actionLoading === `archive:${row.id}`}
                              onClick={() => applyWebhookStatus(row.id, "archive")}
                            >
                              {t("Archive", "Archiver")}
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
