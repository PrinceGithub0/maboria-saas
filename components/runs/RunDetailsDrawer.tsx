"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RunStepTimeline } from "@/components/runs/RunStepTimeline";
import { CopySummary } from "@/components/runs/CopySummary";

type RunLog = {
  step?: string | null;
  result?: any;
  error?: string | null;
  reason?: string | null;
  skipped?: boolean;
};

type RunItem = {
  id: string;
  flow?: { title?: string | null };
  runStatus?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  logs?: RunLog[];
};

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function RunDetailsDrawer({
  open,
  onClose,
  run,
  formatDateTime,
  formatStepLabel,
  formatRunMessage,
  formatDuration,
  t,
}: {
  open: boolean;
  onClose: () => void;
  run: RunItem | null;
  formatDateTime: (value?: string) => string;
  formatStepLabel: (value?: string) => string;
  formatRunMessage: (log: RunLog) => string;
  formatDuration: (start?: string | null, end?: string | null, status?: string | null) => string | null;
  t: (en: string, fr: string) => string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  useEffect(() => {
    setShowFailuresOnly(false);
    setSearchTerm("");
  }, [run?.id]);

  const summary = useMemo(() => {
    if (!run) return "";
    const logs = Array.isArray(run.logs) ? run.logs : [];
    const lines = logs.map((log, idx) => {
      const status = log?.error ? "FAILED" : log?.skipped ? "SKIPPED" : "SUCCESS";
      const output =
        typeof log?.result === "string"
          ? log.result
          : log?.result
            ? JSON.stringify(log.result)
            : log?.error
              ? String(log.error)
              : log?.reason
                ? String(log.reason)
                : "";
      return `${idx + 1}. ${formatStepLabel(log?.step ?? undefined)} — ${status}${
        output ? ` — ${output}` : ""
      }`;
    });
    return [
      `${run.flow?.title || t("Flow", "Flux")} (${run.id})`,
      `${String(run.runStatus || "RUNNING")} · ${formatDateTime(run.createdAt)} · ${formatDuration(
        run.startedAt,
        run.completedAt,
        run.runStatus
      ) || "—"}`,
      ...lines,
    ].join("\n");
  }, [run, formatStepLabel, formatDateTime, formatDuration, t]);

  const handleCopyId = async () => {
    if (!run?.id) return;
    try {
      await navigator.clipboard.writeText(run.id);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1500);
    } catch {
      setCopiedId(false);
    }
  };

  if (!open || !run) return null;

  const logs = Array.isArray(run.logs) ? run.logs : [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label={t("Close run log", "Fermer journal")}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        ref={containerRef}
        className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl max-md:max-w-full"
        role="dialog"
        aria-modal="true"
        aria-label={t("Run log", "Journal d ex?cution")}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t("Run log", "Journal d ex?cution")}
              </p>
              <h2 className="text-lg font-semibold text-foreground">
                {run.flow?.title || t("Flow", "Flux")}
              </h2>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              className="rounded-full border border-border/70 p-2 text-muted-foreground hover:text-foreground"
              aria-label={t("Close", "Fermer")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="default" className="bg-muted text-foreground border border-border/60 font-medium">
              {String(run.runStatus || "RUNNING")}
            </Badge>
            <span>
              {logs.length} {t("steps", "etapes")}
            </span>
            <span>{formatDuration(run.startedAt, run.completedAt, run.runStatus) || "—"}</span>
            <span>{formatDateTime(run.createdAt)}</span>
            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedId ? t("Copied ID", "ID copie") : t("Copy ID", "Copier ID")}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <CopySummary summary={summary} label={t("Copy run summary", "Copier resume")} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={showFailuresOnly}
                  onChange={(e) => setShowFailuresOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-indigo-600 focus:ring-indigo-500"
                />
                {t("Show only failures", "Afficher echecs")}
              </label>
              <input
                type="search"
                placeholder={t("Search steps or output", "Rechercher etapes ou sortie")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-56 rounded-full border border-border/70 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <RunStepTimeline
            logs={logs}
            formatStepLabel={formatStepLabel}
            formatRunMessage={formatRunMessage}
            searchTerm={searchTerm}
            showFailuresOnly={showFailuresOnly}
            formatTimestamp={(value) => formatDateTime(value ?? undefined)}
            t={t}
          />
        </div>
      </aside>
    </div>
  );
}
