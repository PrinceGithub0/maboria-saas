"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminSupportPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, mutate } = useSWR("/api/admin/support", fetcher);
  const tickets = Array.isArray(data) ? data : [];
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const openCount = tickets.filter((ticket: any) => ticket.status === "OPEN").length;
  const inProgressCount = tickets.filter((ticket: any) => ticket.status === "IN_PROGRESS").length;
  const resolvedCount = tickets.filter((ticket: any) => ticket.status === "RESOLVED").length;
  const closedCount = tickets.filter((ticket: any) => ticket.status === "CLOSED").length;
  const statusLabel = (status: string) => {
    switch (status) {
      case "OPEN":
        return t("OPEN", "OUVERT");
      case "IN_PROGRESS":
        return t("IN_PROGRESS", "EN COURS");
      case "RESOLVED":
        return t("RESOLVED", "RESOLU");
      case "CLOSED":
        return t("CLOSED", "FERME");
      default:
        return status;
    }
  };
  const updateStatus = async (id: string, status: string) => {
    if (!id || !status) return;
    setActionLoading(id);
    setActionStatus(null);
    await mutate(
      (current: any[] = []) => current.map((row) => (row.id === id ? { ...row, status } : row)),
      { revalidate: false }
    );
    const res = await fetch("/api/admin/support", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Status update failed.", "Echec de mise a jour du statut."), variant: "error" });
      await mutate();
    } else {
      setActionStatus({
        message: t(
          `Ticket marked ${status.toLowerCase().replace("_", " ")}.`,
          `Ticket marque ${statusLabel(status).toLowerCase().replace("_", " ")}.`
        ),
        variant: "success",
      });
      await mutate();
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Support tickets", "Tickets support")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Response queues and customer resolution status.", "Files de reponse et statut de resolution.")}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4 max-md:grid-cols-1 max-md:gap-5">
        <Card title={t("Open", "Ouverts")}>
          <p className="text-2xl font-semibold text-foreground">{openCount}</p>
        </Card>
        <Card title={t("In progress", "En cours")}>
          <p className="text-2xl font-semibold text-foreground">{inProgressCount}</p>
        </Card>
        <Card title={t("Resolved", "Resolus")}>
          <p className="text-2xl font-semibold text-foreground">{resolvedCount}</p>
        </Card>
        <Card title={t("Closed", "Fermes")}>
          <p className="text-2xl font-semibold text-foreground">{closedCount}</p>
        </Card>
      </div>
      <Card>
        {actionStatus && (
          <div className="mb-3">
            <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
          </div>
        )}
        <Table
          data={tickets}
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "title", label: t("Title", "Titre") },
            { key: "user", label: t("User", "Utilisateur"), render: (row: any) => row.user?.email },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) => {
                  const variant =
                  row.status === "OPEN"
                    ? "warning"
                    : row.status === "IN_PROGRESS"
                      ? "default"
                      : row.status === "RESOLVED"
                        ? "success"
                        : "danger";
                return <Badge variant={variant}>{statusLabel(row.status)}</Badge>;
                },
              },
              {
                key: "actions",
                label: t("Update", "Maj"),
                render: (row: any) => (
                  <select
                    defaultValue={row.status}
                    onChange={(event) => updateStatus(row.id, event.target.value)}
                    disabled={actionLoading === row.id}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: "createdAt",
                label: t("Created", "Cree"),
                render: (row: any) => new Date(row.createdAt).toLocaleString(),
            },
          ]}
        />
      </Card>
    </div>
  );
}
