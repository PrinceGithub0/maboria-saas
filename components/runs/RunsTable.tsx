"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type RunItem = {
  id: string;
  flow?: { title?: string | null };
  flowId?: string | null;
  runStatus?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  source?: string | null;
  trigger?: string | null;
  logs?: Array<{ timestamp?: string | null }>;
};

export function RunsTable({
  runs,
  onViewLog,
  onRestart,
  sortKey,
  sortDir,
  onSortChange,
  formatDateTime,
  t,
}: {
  runs: RunItem[];
  onViewLog: (runId: string) => void;
  onRestart: (flowId?: string | null) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSortChange: (key: string) => void;
  formatDateTime: (value?: string) => string;
  t: (en: string, fr: string) => string;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [copiedMenuId, setCopiedMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof HTMLElement && target.closest("[data-run-menu]")) return;
      if (openMenuId) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  useEffect(() => {
    if (!copiedLabel) return;
    const timer = window.setTimeout(() => {
      setCopiedLabel(null);
      setCopiedMenuId(null);
      setOpenMenuId(null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [copiedLabel]);

  const sortableHeaders = useMemo(
    () => ({
      createdAt: t("Created", "Cr?? le"),
      runStatus: t("Status", "Statut"),
      duration: t("Duration", "Durée"),
    }),
    [t]
  );

  const resolveStatusTone = (value: string) => {
    switch (value) {
      case "SUCCESS":
        return "bg-emerald-100/40 text-emerald-900 border-emerald-200/60";
      case "FAILED":
        return "bg-rose-100/40 text-rose-900 border-rose-200/60";
      case "RUNNING":
        return "bg-amber-100/40 text-amber-900 border-amber-200/60";
      case "QUEUED":
        return "bg-slate-100/60 text-slate-700 border-slate-200/60";
      case "CANCELED":
      case "SKIPPED":
        return "bg-slate-100/60 text-slate-600 border-slate-200/60";
      default:
        return "bg-slate-100/60 text-slate-700 border-slate-200/60";
    }
  };

  const normalizeTrigger = (value?: string | null) => {
    const raw = String(value || "").toLowerCase();
    if (raw.includes("manual")) return "Manual";
    if (raw.includes("webhook")) return "Webhook";
    if (raw.includes("schedule")) return "Schedule";
    if (raw.includes("event")) return "Event";
    if (raw.includes("system")) return "System";
    return "System";
  };

  const durationFromTimes = (start?: string | null, end?: string | null, status?: string | null) => {
    if (!start) return null;
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return null;
    const endDate =
      end && !Number.isNaN(new Date(end).getTime())
        ? new Date(end)
        : status === "RUNNING"
          ? new Date()
          : null;
    if (!endDate) return null;
    return Math.max(0, endDate.getTime() - startDate.getTime());
  };

  const durationFromCreated = (createdAt?: string | null, status?: string | null) => {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return null;
    if (status === "RUNNING" || status === "QUEUED") {
      return Math.max(0, Date.now() - created.getTime());
    }
    return null;
  };

  const computeDurationFromLogs = (logs?: Array<{ timestamp?: string | null }>) => {
    if (!Array.isArray(logs) || logs.length < 2) return null;
    const timestamps = logs
      .map((entry) => (entry?.timestamp ? new Date(entry.timestamp).getTime() : NaN))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length < 2) return null;
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    return end - start;
  };

  const formatDurationMs = (ms: number | null) => {
    if (ms == null || Number.isNaN(ms)) return null;
    const seconds = ms / 1000;
    if (seconds < 0.1) return "0.1s";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder.toFixed(1)}s`;
  };

  const handleSort = (key: string) => () => onSortChange(key);

  const renderSortLabel = (key: string, label: string) => (
    <button
      type="button"
      onClick={handleSort(key)}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
    >
      {label}
      {sortKey === key && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );

  return (
    <div className="rounded-2xl border border-border bg-background">
      <table className="hidden w-full table-fixed border-collapse text-sm text-foreground md:table">
        <thead className="bg-muted/40">
          <tr className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <th className="w-[30%] px-4 py-3 text-left">{t("Flow", "Flux")}</th>
            <th className="w-[12%] px-4 py-3 text-center">
              {renderSortLabel("runStatus", sortableHeaders.runStatus)}
            </th>
            <th className="w-[12%] px-4 py-3 text-center">{t("Trigger", "Declencheur")}</th>
            <th className="w-[18%] px-4 py-3 text-center">
              {renderSortLabel("createdAt", sortableHeaders.createdAt)}
            </th>
            <th className="w-[8%] px-4 py-3 text-center">
              {renderSortLabel("duration", sortableHeaders.duration)}
            </th>
            <th className="w-[20%] px-4 py-3 text-center">{t("Actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const status = String(run.runStatus || "RUNNING").toUpperCase();
            const trigger = normalizeTrigger(run.trigger || run.source);
            const fallbackMs = computeDurationFromLogs(run.logs);
            const timeMs =
              durationFromTimes(run.startedAt, run.completedAt, run.runStatus) ??
              fallbackMs ??
              durationFromCreated(run.createdAt, status);
            const durationValue = formatDurationMs(timeMs);
            const durationLabel = durationValue || "<1s";
            return (
              <tr key={run.id} className="border-t border-border/70 hover:bg-muted/20 h-16">
                <td className="px-4 py-3 align-middle text-left">
                  <div className="flex items-center justify-start text-left text-foreground font-medium">
                    {run.flow?.title || t("Untitled flow", "Flux sans titre")}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <div className="flex items-center justify-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${resolveStatusTone(
                        status === "PENDING" ? "QUEUED" : status
                      )}`}
                    >
                      {status === "RUNNING" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {status === "PENDING" ? "QUEUED" : status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <div className="flex items-center justify-center text-muted-foreground">{trigger}</div>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <div className="flex items-center justify-center text-muted-foreground">
                    <span className="leading-6 tracking-[0.01em]">{formatDateTime(run.createdAt)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <div className="flex items-center justify-center text-muted-foreground">
                    {durationLabel}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <div className="relative flex items-center justify-center gap-2">
                    <Button size="sm" className="px-2" onClick={() => onViewLog(run.id)}>
                      {t("View log", "Voir log")}
                    </Button>
                    <Button
                      size="sm"
                      className="px-2 text-muted-foreground/80 hover:text-foreground"
                      variant="ghost"
                      onClick={() => onRestart(run.flowId)}
                    >
                      {t("Restart", "Relancer")}
                    </Button>
                    <div data-run-menu>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-muted-foreground/80 hover:text-foreground"
                        onClick={() => setOpenMenuId((prev) => (prev === run.id ? null : run.id))}
                        aria-expanded={openMenuId === run.id}
                        aria-haspopup="menu"
                      >
                        {t("More", "Plus")}
                      </Button>
                      {openMenuId === run.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-border bg-background shadow-xl"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              navigator.clipboard.writeText(run.id);
                              setCopiedLabel(t("Copied run ID", "ID run copie"));
                              setCopiedMenuId(run.id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          >
                            {t("Copy run ID", "Copier ID run")}
                          </button>
                          {run.flowId && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                navigator.clipboard.writeText(run.flowId || "");
                                setCopiedLabel(t("Copied flow ID", "ID flux copie"));
                                setCopiedMenuId(run.id);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                            >
                              {t("Copy flow ID", "Copier ID flux")}
                            </button>
                          )}
                          {copiedLabel && copiedMenuId === run.id && (
                            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                              {copiedLabel}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {!runs.length && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                {t(
                  "No runs yet. Start an automation to see executions here.",
                  "Aucune ex?cution. Lancez une automatisation pour voir les runs ici."
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="space-y-4 p-4 md:hidden">
        {runs.map((run) => {
          const status = String(run.runStatus || "RUNNING").toUpperCase();
          const trigger = normalizeTrigger(run.trigger || run.source);
          const fallbackMs = computeDurationFromLogs(run.logs);
          const timeMs = durationFromTimes(run.startedAt, run.completedAt, run.runStatus) ?? fallbackMs;
          const durationValue = formatDurationMs(timeMs);
          const durationLabel =
            status === "RUNNING"
              ? "- Running"
              : status === "PENDING" || status === "QUEUED"
                ? "- Queued"
                : durationValue || "-";
          return (
            <div key={run.id} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {run.flow?.title || t("Untitled flow", "Flux sans titre")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(run.createdAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${resolveStatusTone(
                    status === "PENDING" ? "QUEUED" : status
                  )}`}
                >
                  {status === "RUNNING" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  {status === "PENDING" ? "QUEUED" : status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <p className="uppercase tracking-[0.18em]">{t("Trigger", "Declencheur")}</p>
                  <p className="mt-1 text-sm text-foreground">{trigger}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.18em]">{t("Duration", "Durée")}</p>
                  <p className="mt-1 text-sm text-foreground">{durationLabel}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" className="flex-1" onClick={() => onViewLog(run.id)}>
                  {t("View log", "Voir log")}
                </Button>
                <Button size="sm" className="flex-1" variant="ghost" onClick={() => onRestart(run.flowId)}>
                  {t("Restart", "Relancer")}
                </Button>
                <div data-run-menu className="flex-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setOpenMenuId((prev) => (prev === run.id ? null : run.id))}
                    aria-expanded={openMenuId === run.id}
                    aria-haspopup="menu"
                  >
                    {t("More", "Plus")}
                  </Button>
                  {openMenuId === run.id && (
                    <div
                      role="menu"
                      className="mt-2 w-full rounded-xl border border-border bg-background shadow-xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          navigator.clipboard.writeText(run.id);
                          setCopiedLabel(t("Copied run ID", "ID run copie"));
                          setCopiedMenuId(run.id);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                      >
                        {t("Copy run ID", "Copier ID run")}
                      </button>
                      {run.flowId && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            navigator.clipboard.writeText(run.flowId || "");
                            setCopiedLabel(t("Copied flow ID", "ID flux copie"));
                            setCopiedMenuId(run.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                        >
                          {t("Copy flow ID", "Copier ID flux")}
                        </button>
                      )}
                      {copiedLabel && copiedMenuId === run.id && (
                        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                          {copiedLabel}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!runs.length && (
          <div className="rounded-2xl border border-border/70 bg-background px-6 py-10 text-center text-sm text-muted-foreground">
            {t(
              "No runs yet. Start an automation to see executions here.",
              "Aucune ex?cution. Lancez une automatisation pour voir les runs ici."
            )}
          </div>
        )}
      </div>
    </div>
  );
}
