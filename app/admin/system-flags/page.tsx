"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateTimeDMY } from "@/lib/date";

type SystemFlag =
  | "maintenance_mode"
  | "allow_signup"
  | "payments_enabled"
  | "automation_enabled"
  | "automation_replay_enabled"
  | "ai_enabled"
  | "support_enabled"
  | "admin_notifications_enabled"
  | "system_logs_enabled"
  | "impersonation_enabled"
  | "webhooks_ingest_enabled"
  | "exports_enabled";

type ActorRole = "OPS_ADMIN" | "SUPER_ADMIN" | "USER";

type FlagRow = {
  key: SystemFlag;
  value: boolean;
  dangerous: boolean;
  lastModifiedAt: string | null;
  lastModifiedBy: { id: string; name: string | null; email: string | null } | null;
};

type FlagsResponse = {
  flags: FlagRow[];
  actorRole: ActorRole;
};

type HistoryItem = {
  id: string;
  flagKey: SystemFlag;
  oldValue: boolean;
  newValue: boolean;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
};

type HistoryResponse = { history: HistoryItem[] };

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const FLAG_DEFS: Array<{
  key: SystemFlag;
  section: "Platform" | "Billing" | "Automation" | "Infrastructure" | "Admin Tools" | "AI";
  label: string;
  description: string;
}> = [
  { key: "maintenance_mode", section: "Platform", label: "Maintenance Mode", description: "Block non-admin traffic platform-wide." },
  { key: "allow_signup", section: "Platform", label: "Allow Signups", description: "Allow new account registration routes." },
  { key: "payments_enabled", section: "Billing", label: "Payments", description: "Enable checkout and subscription write flows." },
  { key: "automation_enabled", section: "Automation", label: "Automation Engine", description: "Allow automation processing and execution." },
  { key: "automation_replay_enabled", section: "Automation", label: "Automation Replay", description: "Allow replay endpoints for failed runs." },
  { key: "webhooks_ingest_enabled", section: "Infrastructure", label: "Webhooks Ingest", description: "Allow non-critical webhook ingestion routes." },
  { key: "impersonation_enabled", section: "Admin Tools", label: "Impersonation", description: "Allow admin impersonation start endpoint." },
  { key: "admin_notifications_enabled", section: "Admin Tools", label: "Admin Notifications", description: "Enable admin notifications ingestion/listing." },
  { key: "system_logs_enabled", section: "Admin Tools", label: "System Logs", description: "Enable system logs export APIs." },
  { key: "exports_enabled", section: "Admin Tools", label: "Exports", description: "Enable CSV/JSON export routes." },
  { key: "ai_enabled", section: "AI", label: "AI Assistant", description: "Enable AI assistant APIs and related features." },
  { key: "support_enabled", section: "Admin Tools", label: "Support", description: "Enable support ticket create/reply routes." },
];

const DANGEROUS_CONFIRM: Record<SystemFlag, { title: string; body: string }> = {
  maintenance_mode: {
    title: "Enable Maintenance Mode?",
    body: "This blocks all non-admin traffic until disabled. Confirm to continue.",
  },
  payments_enabled: {
    title: "Change Payments Flag?",
    body: "Disabling payments stops checkout and subscription creation flows platform-wide.",
  },
  impersonation_enabled: {
    title: "Change Impersonation Flag?",
    body: "Disabling impersonation blocks support impersonation starts immediately.",
  },
  automation_replay_enabled: {
    title: "Change Automation Replay Flag?",
    body: "Disabling replay blocks automation recovery replay endpoints.",
  },
  allow_signup: { title: "Change Signup Flag?", body: "This changes account registration availability." },
  automation_enabled: { title: "Change Automation Engine Flag?", body: "This changes automation execution and scheduler behavior." },
  ai_enabled: { title: "Change AI Flag?", body: "This changes AI assistant API availability." },
  support_enabled: { title: "Change Support Flag?", body: "This changes support ticket create/reply availability." },
  admin_notifications_enabled: { title: "Change Admin Notifications Flag?", body: "This changes admin notifications listing and ingestion." },
  system_logs_enabled: { title: "Change System Logs Flag?", body: "This changes logs export endpoint availability." },
  webhooks_ingest_enabled: { title: "Change Webhooks Flag?", body: "This changes non-critical webhook ingest endpoints." },
  exports_enabled: { title: "Change Exports Flag?", body: "This changes CSV/JSON export endpoint availability." },
};

export default function SystemFlagsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, isLoading, mutate } = useSWR<FlagsResponse>("/api/admin/system-flags", fetcher);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: historyData, isLoading: historyLoading, mutate: mutateHistory } = useSWR<HistoryResponse>(
    historyOpen ? "/api/admin/system-flags/history?take=50" : null,
    fetcher
  );
  const [pending, setPending] = useState<{ key: SystemFlag; value: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<SystemFlag | "refresh" | null>(null);
  const [actionStatus, setActionStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  const actorRole: ActorRole = data?.actorRole || "USER";
  const sectioned = useMemo(() => {
    const flags = Array.isArray(data?.flags) ? data.flags : [];
    const map = new Map(flags.map((item) => [item.key, item]));
    return FLAG_DEFS.reduce<Record<string, Array<(typeof FLAG_DEFS)[number] & { value: boolean; meta: FlagRow | null }>>>(
      (acc, def) => {
        if (!acc[def.section]) acc[def.section] = [];
        const meta = map.get(def.key) || null;
        acc[def.section].push({ ...def, value: meta?.value ?? false, meta });
        return acc;
      },
      {}
    );
  }, [data?.flags]);

  const canToggle = () => actorRole === "SUPER_ADMIN";

  const submitFlag = async (key: SystemFlag, value: boolean) => {
    setActionLoading(key);
    setActionStatus(null);
    try {
      const res = await fetch("/api/admin/system-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to update flag."));
      }
      setActionStatus({ message: `${key} updated.`, variant: "success" });
      await mutate();
      if (historyOpen) await mutateHistory();
    } catch (error) {
      setActionStatus({ message: error instanceof Error ? error.message : "Unable to update flag.", variant: "error" });
    } finally {
      setActionLoading(null);
      setPending(null);
    }
  };

  const refreshCache = async () => {
    setActionLoading("refresh");
    setActionStatus(null);
    try {
      const res = await fetch("/api/admin/system-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!res.ok) throw new Error("Unable to refresh flags cache.");
      await mutate();
      setActionStatus({ message: "Flags cache refreshed.", variant: "success" });
    } catch (error) {
      setActionStatus({ message: error instanceof Error ? error.message : "Unable to refresh flags cache.", variant: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
        <h1 className="text-3xl font-semibold text-foreground">{t("System flags", "Drapeaux systeme")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("Platform kill-switch control plane with audit trail.", "Plan de controle des kill-switch avec piste d'audit.")}</p>
      </div>

      <Card title={t("Control plane", "Plan de controle")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("Only SUPER_ADMIN can toggle system flags.", "Seul SUPER_ADMIN peut activer ou desactiver les drapeaux systeme.")}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              View Flag History
            </Button>
            <Button variant="secondary" size="sm" loading={actionLoading === "refresh"} onClick={refreshCache}>
              Refresh cache
            </Button>
          </div>
        </div>

        {actionStatus ? (
          <div className="mb-3">
            <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(sectioned).map(([section, items]) => (
              <section key={section} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{section}</h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              item.value
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                            }`}
                          >
                            {item.value ? "Active" : "Disabled"}
                          </span>
                          {item.meta?.dangerous ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                              dangerous
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Last modified:{" "}
                          {item.meta?.lastModifiedAt
                            ? `${formatDateTimeDMY(new Date(item.meta.lastModifiedAt))} by ${item.meta.lastModifiedBy?.name || item.meta.lastModifiedBy?.email || "unknown"}`
                            : "never"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canToggle()) return;
                          if (item.meta?.dangerous) {
                            setPending({ key: item.key, value: !item.value });
                            return;
                          }
                          void submitFlag(item.key, !item.value);
                        }}
                        disabled={!canToggle() || actionLoading === item.key}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                          item.value ? "border-emerald-500/40 bg-emerald-500/80" : "border-border bg-muted"
                        } ${!canToggle() ? "cursor-not-allowed opacity-40" : ""}`}
                        aria-pressed={item.value}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition ${
                            item.value ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(pending)}
        onClose={() => {
          if (actionLoading) return;
          setPending(null);
        }}
        title={pending ? DANGEROUS_CONFIRM[pending.key].title : "Confirm change"}
      >
        {pending ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{DANGEROUS_CONFIRM[pending.key].body}</p>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              Flag: <span className="font-mono">{pending.key}</span> →{" "}
              <span className="font-semibold">{pending.value ? "true" : "false"}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={Boolean(actionLoading)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={actionLoading === pending.key}
                onClick={() => void submitFlag(pending.key, pending.value)}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="System Flag History">
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {historyData?.history?.length ? (
              historyData.history.map((row) => (
                <div key={row.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                  <p className="font-mono text-foreground">{row.flagKey}</p>
                  <p className="text-muted-foreground">
                    {row.oldValue ? "true" : "false"} → {row.newValue ? "true" : "false"}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDateTimeDMY(new Date(row.createdAt))} · {row.actorName || row.actorEmail || row.actorUserId}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No flag history found.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
