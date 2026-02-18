"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Copy, GitBranch, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

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

export default function AutomationsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const { data: flows, error: flowsError, mutate, isLoading } = useSWR("/api/automation", fetcher);
  const { data: runs } = useSWR("/api/automation/runs", fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  });

  const [status, setStatus] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const flowList = useMemo(() => (Array.isArray(flows) ? flows : []), [flows]);
  const runList = useMemo(() => (Array.isArray(runs) ? runs : []), [runs]);

  const runsByFlow = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const run of runList) {
      const flowId = String(run?.flowId || run?.flow?.id || "");
      if (!flowId) continue;
      const current = map.get(flowId) || [];
      current.push(run);
      map.set(flowId, current);
    }
    for (const [flowId, list] of map.entries()) {
      list.sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      map.set(flowId, list);
    }
    return map;
  }, [runList]);

  const sortedFlows = useMemo(() => {
    return [...flowList].sort((a: any, b: any) => {
      const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [flowList]);

  const activeAutomations = flowList.filter((flow: any) => String(flow?.status || "").toLowerCase() === "active").length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthlyRuns = runList.filter((run: any) => {
    const createdAt = run?.createdAt ? new Date(run.createdAt).getTime() : 0;
    return createdAt >= monthStart;
  });
  const executionsThisMonth = monthlyRuns.length;
  const successfulRuns = monthlyRuns.filter((run: any) => {
    const state = String(run?.status || "").toUpperCase();
    return state === "SUCCESS" || state === "COMPLETED";
  }).length;
  const messagesSent = successfulRuns;
  const successRate = executionsThisMonth > 0 ? Math.round((successfulRuns / executionsThisMonth) * 100) : 0;

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

  const isActive = (value?: string) => String(value || "").toLowerCase() === "active";

  const getStatusLabel = (value?: string) => (isActive(value) ? t("Active", "Actif") : t("Paused", "En pause"));

  const getStatusClasses = (value?: string) =>
    isActive(value) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700";

  const setBusy = (action: string, id: string) => setBusyKey(`${action}:${id}`);
  const clearBusy = () => setBusyKey(null);
  const isBusy = (action: string, id: string) => busyKey === `${action}:${id}`;

  const resolveStatusVariant = (message?: string | null) => {
    if (!message) return "info" as const;
    const lowered = message.toLowerCase();
    if (lowered.includes("could not") || lowered.includes("error") || lowered.includes("missing") || lowered.includes("impossible")) {
      return "error" as const;
    }
    if (lowered.includes("updated") || lowered.includes("duplicated") || lowered.includes("mise a jour") || lowered.includes("dupliquee")) {
      return "success" as const;
    }
    return "info" as const;
  };

  const resolveSummary = (flow: any) => {
    const description = String(flow?.description || "").trim();
    if (description) return description;
    return t(
      "When invoice becomes overdue -> Send WhatsApp message",
      "Quand une facture devient en retard -> Envoyer un message WhatsApp"
    );
  };

  const toggleFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatus(t("Missing automation id.", "ID automation manquant."));
      return;
    }

    const nextStatus = isActive(flow?.status) ? "paused" : "active";
    setBusy("toggle", flowId);
    setStatus(null);

    try {
      const res = await fetch(`/api/automation/${encodeURIComponent(flowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json?.reason || json?.error || t("Could not update automation.", "Impossible de mettre a jour."));
      } else {
        setStatus(t("Automation updated.", "Automation mise a jour."));
        mutate();
      }
    } catch {
      setStatus(t("Could not update automation.", "Impossible de mettre a jour."));
    } finally {
      clearBusy();
    }
  };

  const duplicateFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatus(t("Missing automation id.", "ID automation manquant."));
      return;
    }

    setBusy("duplicate", flowId);
    setStatus(null);

    try {
      const copyTitle = language === "fr" ? `${flow.title || "Automation"} (Copie)` : `${flow.title || "Automation"} (Copy)`;
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: copyTitle,
          description: flow?.description || "",
          steps: Array.isArray(flow?.steps) ? flow.steps : [],
          status: "draft",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json?.reason || json?.error || t("Could not duplicate automation.", "Impossible de dupliquer."));
      } else {
        setStatus(t("Automation duplicated.", "Automation dupliquee."));
        mutate();
      }
    } catch {
      setStatus(t("Could not duplicate automation.", "Impossible de dupliquer."));
    } finally {
      clearBusy();
    }
  };

  const statCards = [
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
      label: t("Messages Sent", "Messages envoyes"),
      value: messagesSent.toLocaleString(),
      subtext: t("Successful deliveries", "Envois reussis"),
    },
    {
      label: t("Success Rate", "Taux de succes"),
      value: `${successRate}%`,
      subtext: t("Based on monthly runs", "Base sur les runs du mois"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 bg-[#F9FAFB] px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t("Automation", "Automation")}</h1>
          <p className="text-sm text-slate-600">
            {t(
              "Create workflows that run your business automatically.",
              "Creez des workflows qui executent votre entreprise automatiquement."
            )}
          </p>
        </div>
        <Button className="h-11 w-full rounded-lg px-5 sm:w-auto" onClick={() => router.push("/dashboard/automations/new")}>
          {t("New Automation", "Nouvelle automation")}
        </Button>
      </section>

      {status ? (
        <Alert variant={resolveStatusVariant(status)} className="rounded-xl border border-slate-200 bg-white">
          {status}
        </Alert>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.subtext}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : null}

        {flowsError ? (
          <Alert variant="error" className="rounded-xl border border-rose-200 bg-white">
            {(flowsError as any)?.data?.reason ||
              (flowsError as any)?.data?.error ||
              t("Unable to load automations.", "Impossible de charger les automatisations.")}
          </Alert>
        ) : null}

        {!isLoading && !flowsError && sortedFlows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
              <GitBranch className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{t("No automations yet", "Aucune automation")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {t(
                "Create your first workflow to start automating your business.",
                "Creez votre premier workflow pour commencer a automatiser votre entreprise."
              )}
            </p>
            <Button className="mt-5 h-11 w-full rounded-lg px-5 sm:w-auto" onClick={() => router.push("/dashboard/automations/new")}>
              {t("Create Automation", "Creer une automation")}
            </Button>
          </div>
        ) : null}

        {sortedFlows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedFlows.map((flow: any) => {
              const flowId = String(flow?.id || "");
              const flowRuns = runsByFlow.get(flowId) || [];
              const lastRun = flowRuns[0]?.createdAt;
              const triggeredCount = flowRuns.length;
              const active = isActive(flow?.status);

              return (
                <article
                  key={flowId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                          <GitBranch className="h-4 w-4" />
                        </span>
                        <h3 className="truncate text-lg font-semibold text-slate-900">
                          {flow?.title || t("Untitled automation", "Automation sans titre")}
                        </h3>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(flow?.status)}`}>
                      {getStatusLabel(flow?.status)}
                    </span>
                  </div>

                  <p className="mt-3 truncate text-sm text-slate-600">{resolveSummary(flow)}</p>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      {t("Triggers", "Declenchements")}: <span className="font-semibold text-slate-700">{triggeredCount}</span>
                    </span>
                    <span className="text-right">
                      {t("Last run", "Dernier run")}: <span className="font-semibold text-slate-700">{formatRelativeTime(lastRun)}</span>
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full sm:w-auto"
                        onClick={() => router.push(`/dashboard/automations/${encodeURIComponent(flowId)}`)}
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("Edit", "Modifier")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full sm:w-auto"
                        loading={isBusy("duplicate", flowId)}
                        onClick={() => duplicateFlow(flow)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t("Duplicate", "Dupliquer")}
                      </Button>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={t("Toggle automation", "Basculer automation")}
                      disabled={isBusy("toggle", flowId)}
                      onClick={() => toggleFlow(flow)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                        active ? "bg-emerald-500" : "bg-slate-300"
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
    </div>
  );
}
