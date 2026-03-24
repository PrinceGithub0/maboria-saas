"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Copy, GitBranch, PencilLine } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
const AUTOMATION_STATUSES: AutomationStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

const normalizeAutomationStatus = (value: unknown, fallback: AutomationStatus = "DRAFT"): AutomationStatus => {
  const next = String(value || "").trim().toUpperCase() as AutomationStatus;
  return AUTOMATION_STATUSES.includes(next) ? next : fallback;
};

const isRawValidationError = (value: unknown) =>
  typeof value === "string" &&
  (value.includes("Invalid option: expected one of") || value.includes(`path: ["status"]`));

const resolveAutomationErrorMessage = (
  payload: any,
  fallback: string,
  devLabel: string
) => {
  const raw = payload?.reason ?? payload?.error;
  if (typeof raw === "string" && !isRawValidationError(raw)) {
    return raw;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(devLabel, payload);
  }
  return fallback;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load automations");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};

const templates = [
  {
    id: "overdue_reminder_3_days",
    title: "Send payment reminder after 3 days",
    description: "Auto-send reminder if invoice unpaid.",
  },
  {
    id: "whatsapp_thank_you",
    title: "Send WhatsApp thank you message",
    description: "Automatically thank customers after payment.",
  },
  {
    id: "notify_invoice_paid",
    title: "Notify when invoice is paid",
    description: "Send instant alerts when invoices are settled.",
  },
];

export default function AutomationsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const { data: flows, error: flowsError, mutate, isLoading } = useSWR("/api/automation", fetcher);
  const { data: runs } = useSWR("/api/automation/runs", fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const flowList = useMemo(() => (Array.isArray(flows) ? flows : []), [flows]);
  const runList = useMemo(() => (Array.isArray(runs) ? runs : []), [runs]);

  const runsByFlow = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const run of runList) {
      const flowId = String(run?.flowId || run?.flow?.id || "");
      if (!flowId) continue;
      const current = grouped.get(flowId) || [];
      current.push(run);
      grouped.set(flowId, current);
    }
    for (const [key, list] of grouped.entries()) {
      list.sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      grouped.set(key, list);
    }
    return grouped;
  }, [runList]);

  const sortedFlows = useMemo(() => {
    return [...flowList].sort((a: any, b: any) => {
      const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [flowList]);

  const activeAutomations = flowList.filter((flow: any) => normalizeAutomationStatus(flow?.status) === "ACTIVE").length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthlyRuns = runList.filter((run: any) => {
    const createdAt = run?.createdAt ? new Date(run.createdAt).getTime() : 0;
    return createdAt >= monthStart;
  });
  const executionsThisMonth = monthlyRuns.length;
  const successfulRuns = monthlyRuns.filter((run: any) => {
    const state = String(run?.runStatus || run?.status || "").toUpperCase();
    return state === "SUCCESS" || state === "COMPLETED";
  }).length;
  const successRate = executionsThisMonth > 0 ? Math.round((successfulRuns / executionsThisMonth) * 100) : 0;

  const isActive = (status?: string) => normalizeAutomationStatus(status) === "ACTIVE";

  const getStatusLabel = (status?: string) => {
    const normalized = normalizeAutomationStatus(status);
    if (normalized === "ACTIVE") return t("Active", "Actif");
    if (normalized === "PAUSED") return t("Paused", "En pause");
    if (normalized === "ARCHIVED") return t("Archived", "Archive");
    return t("Draft", "Brouillon");
  };

  const getStatusClass = (status?: string) => {
    const normalized = normalizeAutomationStatus(status);
    if (normalized === "ACTIVE") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300";
    if (normalized === "PAUSED") return "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  };

  const formatRelativeTime = (value?: string) => {
    if (!value) return t("Never", "Jamais");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("Never", "Jamais");
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60 * 1000) return t("just now", "a l instant");

    const units = [
      { ms: 1000 * 60 * 60 * 24 * 365, en: "year", fr: "an" },
      { ms: 1000 * 60 * 60 * 24 * 30, en: "month", fr: "mois" },
      { ms: 1000 * 60 * 60 * 24, en: "day", fr: "jour" },
      { ms: 1000 * 60 * 60, en: "hour", fr: "heure" },
      { ms: 1000 * 60, en: "minute", fr: "minute" },
    ];

    for (const unit of units) {
      const count = Math.floor(diffMs / unit.ms);
      if (count <= 0) continue;
      if (language === "fr") {
        const suffix = unit.fr === "mois" ? "" : count > 1 ? "s" : "";
        return `il y a ${count} ${unit.fr}${suffix}`;
      }
      return `${count} ${unit.en}${count > 1 ? "s" : ""} ago`;
    }

    return t("just now", "a l instant");
  };

  const resolveSummary = (flow: any) => {
    const description = String(flow?.description || "").trim();
    if (description) return description;
    return t(
      "When invoice becomes overdue ? Send WhatsApp message",
      "Quand une facture devient en retard ? Envoyer un message WhatsApp"
    );
  };

  const setBusy = (action: string, id: string) => setBusyKey(`${action}:${id}`);
  const clearBusy = () => setBusyKey(null);
  const isBusy = (action: string, id: string) => busyKey === `${action}:${id}`;

  const duplicateFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatusMessage(t("Missing automation id.", "ID automation manquant."));
      return;
    }

    setBusy("duplicate", flowId);
    setStatusMessage(null);

    try {
      const copyTitle = language === "fr" ? `${flow.title || "Automation"} (Copie)` : `${flow.title || "Automation"} (Copy)`;
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: copyTitle,
          description: flow?.description || "",
          steps: Array.isArray(flow?.steps) ? flow.steps : [],
          status: "DRAFT",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage(
          resolveAutomationErrorMessage(
            json,
            t("Could not duplicate automation.", "Impossible de dupliquer."),
            "automation_duplicate_failed"
          )
        );
      } else {
        setStatusMessage(t("Automation duplicated.", "Automation dupliquee."));
        mutate();
      }
    } catch {
      setStatusMessage(t("Could not duplicate automation.", "Impossible de dupliquer."));
    } finally {
      clearBusy();
    }
  };

  const toggleFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatusMessage(t("Missing automation id.", "ID automation manquant."));
      return;
    }

    const nextStatus = isActive(flow?.status) ? "PAUSED" : "ACTIVE";
    setBusy("toggle", flowId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/automation/${encodeURIComponent(flowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage(
          resolveAutomationErrorMessage(
            json,
            t("Unable to update automation. Please try again.", "Impossible de mettre a jour l automation. Reessayez."),
            "automation_toggle_failed"
          )
        );
      } else {
        setStatusMessage(t("Automation updated.", "Automation mise a jour."));
        mutate();
      }
    } catch {
      setStatusMessage(t("Could not update automation.", "Impossible de mettre a jour."));
    } finally {
      clearBusy();
    }
  };

  const stats = [
    {
      label: t("Active Automations", "Automations actives"),
      value: activeAutomations.toLocaleString(),
      subtext: t("Currently running", "Actuellement en cours"),
    },
    {
      label: t("Executions This Month", "Executions ce mois"),
      value: executionsThisMonth.toLocaleString(),
      subtext: t("Across all workflows", "Tous workflows confondus"),
    },
    {
      label: t("Successful Runs", "Runs reussis"),
      value: successfulRuns.toLocaleString(),
      subtext: t("Completed successfully", "Completes avec succes"),
    },
    {
      label: t("Success Rate", "Taux de succes"),
      value: `${successRate.toLocaleString()}%`,
      subtext:
        executionsThisMonth > 0
          ? t("Based on this month's runs", "Base sur les runs de ce mois")
          : t("No runs recorded this month", "Aucun run enregistre ce mois"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-8 bg-slate-50 px-4 py-6 dark:bg-transparent sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{t("Automation", "Automation")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "Create workflows that run your business automatically.",
              "Creez des workflows qui executent votre entreprise automatiquement."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/automations/new")}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
        >
          {t("New Automation", "Nouvelle automation")}
        </button>
      </section>

      {statusMessage ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{statusMessage}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stat.subtext}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" />
            ))}
          </div>
        ) : null}

        {flowsError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
            {resolveAutomationErrorMessage(
              (flowsError as any)?.data,
              t("Unable to load automations.", "Impossible de charger les automatisations."),
              "automation_list_load_failed"
            )}
          </div>
        ) : null}

        {!isLoading && !flowsError && sortedFlows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <GitBranch className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-50">{t("No automations yet", "Aucune automation")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
              {t(
                "Create your first workflow to start automating your business.",
                "Creez votre premier workflow pour commencer a automatiser votre entreprise."
              )}
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard/automations/new")}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
            >
              {t("Create Automation", "Creer une automation")}
            </button>
          </div>
        ) : null}

        {sortedFlows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedFlows.map((flow: any) => {
              const flowId = String(flow?.id || "");
              const flowRuns = runsByFlow.get(flowId) || [];
              const lastRun = flowRuns[0]?.createdAt;
              const executionsCount = flowRuns.length;
              const active = isActive(flow?.status);

              return (
                <article
                  key={flowId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <GitBranch className="h-4 w-4" />
                      </span>
                      <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {flow?.title || t("Untitled automation", "Automation sans titre")}
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClass(flow?.status)}`}>
                      {getStatusLabel(flow?.status)}
                    </span>
                  </div>

                  <p className="mt-3 truncate text-sm text-slate-600 dark:text-slate-300">{resolveSummary(flow)}</p>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {t("Runs", "Executions")}: <span className="font-semibold text-slate-700 dark:text-slate-200">{executionsCount}</span>
                    </span>
                    <span className="text-right">
                      {t("Last run", "Dernier run")}: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatRelativeTime(lastRun)}</span>
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/automations/${encodeURIComponent(flowId)}`)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-slate-100 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:w-auto"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("Edit", "Modifier")}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy("duplicate", flowId)}
                        onClick={() => duplicateFlow(flow)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-slate-100 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:w-auto"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t("Duplicate", "Dupliquer")}
                      </button>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={t("Toggle automation", "Basculer automation")}
                      disabled={isBusy("toggle", flowId)}
                      onClick={() => toggleFlow(flow)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                        active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          active ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{t("Templates", "Modeles")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="rounded-xl border border-slate-200 bg-slate-100/80 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <GitBranch className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{template.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/automations/new?template=${encodeURIComponent(template.id)}`)}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t("Use Template", "Utiliser le modele")}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
