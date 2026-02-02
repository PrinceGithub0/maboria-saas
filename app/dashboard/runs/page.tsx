"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { RunsTable } from "@/components/runs/RunsTable";
import { RunDetailsDrawer } from "@/components/runs/RunDetailsDrawer";
import { formatDateDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RunsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data: runs, mutate } = useSWR("/api/automation/runs", fetcher);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isLogOpen, setLogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [pendingStartDay, setPendingStartDay] = useState("");
  const [pendingStartMonth, setPendingStartMonth] = useState("");
  const [pendingStartYear, setPendingStartYear] = useState("");
  const [pendingEndDay, setPendingEndDay] = useState("");
  const [pendingEndMonth, setPendingEndMonth] = useState("");
  const [pendingEndYear, setPendingEndYear] = useState("");
  const [pendingStart, setPendingStart] = useState("");
  const [pendingEnd, setPendingEnd] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(20);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [runActionStatus, setRunActionStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const runList = useMemo(() => (Array.isArray(runs) ? runs : []), [runs]);
  const selectedRun = useMemo(
    () => runList.find((run: any) => run.id === selectedRunId) || null,
    [runList, selectedRunId]
  );

  useEffect(() => {
    if (isLogOpen && !selectedRun) setLogOpen(false);
  }, [isLogOpen, selectedRun]);

  useEffect(() => {
    if (runs) setLastRefreshed(new Date().toISOString());
  }, [runs]);

  const formatDuration = (start?: string | null, end?: string | null, status?: string | null) => {
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
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60000) {
      const seconds = diffMs / 1000;
      const precision = seconds < 10 ? 1 : 0;
      return `${seconds.toFixed(precision)}s`;
    }
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  };

  const formatRunDateTime = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    return `${datePart}, ${timePart}`;
  };

  const resolveIsoDate = (day: string, month: string, year: string) => {
    if (!day || !month || !year) return "";
    const dayNum = Number(day);
    const monthNum = Number(month);
    const yearNum = Number(year);
    if (!dayNum || !monthNum || !yearNum) return "";
    const date = new Date(yearNum, monthNum - 1, dayNum);
    if (
      date.getFullYear() !== yearNum ||
      date.getMonth() !== monthNum - 1 ||
      date.getDate() !== dayNum
    ) {
      return "";
    }
    return `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  };

  useEffect(() => {
    setPendingStart(resolveIsoDate(pendingStartDay, pendingStartMonth, pendingStartYear));
  }, [pendingStartDay, pendingStartMonth, pendingStartYear]);

  useEffect(() => {
    setPendingEnd(resolveIsoDate(pendingEndDay, pendingEndMonth, pendingEndYear));
  }, [pendingEndDay, pendingEndMonth, pendingEndYear]);

  const formatStepLabel = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return t("Step", "Etape");
    const normalized = raw.toLowerCase();
    const map: Record<string, string> = {
      parse_text: t("Parse text", "Analyser le texte"),
      extract_data: t("Extract data", "Extraire les donnees"),
      call_external_api: t("Call external API", "Appeler API externe"),
      generate_invoice: t("Generate invoice", "Generer facture"),
      send_email: t("Send email", "Envoyer email"),
      generate_report: t("Generate report", "Generer rapport"),
      send_whatsapp: t("Send WhatsApp", "Envoyer WhatsApp"),
      ai_transform: t("AI transform", "Transformation IA"),
    };
    return map[normalized] || raw.replace(/[_-]+/g, " ");
  };

  const formatRunMessage = (log: any) => {
    const raw =
      log?.reason ||
      (typeof log?.result === "string" ? log.result : "") ||
      (log?.result ? JSON.stringify(log.result) : "") ||
      "";
    const error = String(log?.error || "");
    const combined = `${raw} ${error}`.toLowerCase();
    if (combined.includes("apicall") || combined.includes("unknown step")) {
      return t(
        "Step failed. Please review the configuration and try again.",
        "Etape echouee. Verifiez la configuration puis reessayez."
      );
    }
    if (error) return t("Step failed. Please try again.", "Etape echouee. Veuillez reessayer.");
    return raw || t("Completed", "Termine");
  };

  const restart = async (flowId?: string | null) => {
    if (!flowId) {
      setRunActionStatus({
        type: "error",
        message: t("Cannot restart run: missing automation id.", "Impossible de relancer : id manquant."),
      });
      return;
    }
    setRunActionStatus(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, input: { text: "Restarted from run viewer" } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRunActionStatus({
          type: "error",
          message:
            data?.reason ||
            data?.error ||
            t("Unable to restart the automation. Please try again.", "Impossible de relancer. Veuillez reessayer."),
        });
        return;
      }
      setRunActionStatus({
        type: "success",
        message: t("Automation run started.", "Execution demarree."),
      });
      await mutate();
    } catch {
      setRunActionStatus({
        type: "error",
        message: t("Network error. Please try again.", "Erreur reseau. Veuillez reessayer."),
      });
    }
  };

  const toggleLogs = (runId: string) => {
    if (selectedRunId === runId && isLogOpen) {
      setLogOpen(false);
      return;
    }
    setSelectedRunId(runId);
    setLogOpen(true);
  };

  const flowOptions = useMemo(() => {
    const unique = new Map<string, string>();
    runList.forEach((run: any) => {
      const title = run?.flow?.title;
      if (title) unique.set(title, title);
    });
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  }, [runList]);

  const toDateKey = (value: string) => {
    if (!value) return null;
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return year * 10000 + month * 100 + day;
  };

  const dateKeyFromDate = (date: Date) =>
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const startKey = toDateKey(appliedStart);
    const endKey = toDateKey(appliedEnd);
    return runList.filter((run: any) => {
      const status = String(run?.runStatus || "").toUpperCase();
      if (statusFilter !== "all" && statusFilter !== status) return false;
      if (flowFilter !== "all" && run?.flow?.title !== flowFilter) return false;
      if (startKey || endKey) {
        const createdAt = run?.createdAt ? new Date(run.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        const createdKey = dateKeyFromDate(createdAt);
        if (startKey && createdKey < startKey) return false;
        if (endKey && createdKey > endKey) return false;
      }
      if (!normalizedQuery) return true;
      const flowName = String(run?.flow?.title || "").toLowerCase();
      const runId = String(run?.id || "").toLowerCase();
      return flowName.includes(normalizedQuery) || runId.includes(normalizedQuery);
    });
  }, [runList, query, statusFilter, flowFilter, appliedStart, appliedEnd]);

  const sortedRuns = useMemo(() => {
    const sorted = [...filteredRuns];
    sorted.sort((a: any, b: any) => {
      if (sortKey === "runStatus") {
        return sortDir === "asc"
          ? String(a?.runStatus || "").localeCompare(String(b?.runStatus || ""))
          : String(b?.runStatus || "").localeCompare(String(a?.runStatus || ""));
      }
      if (sortKey === "duration") {
        const aDur = formatDuration(a?.startedAt, a?.completedAt, a?.runStatus);
        const bDur = formatDuration(b?.startedAt, b?.completedAt, b?.runStatus);
        const toMs = (value: string | null) => {
          if (!value) return 0;
          if (value.endsWith("ms")) return Number(value.replace("ms", "")) || 0;
          if (value.endsWith("s")) return Number(value.replace("s", "")) * 1000 || 0;
          if (value.includes("m")) {
            const [m, s] = value.replace("s", "").split("m").map((part) => part.trim());
            return (Number(m) * 60 + Number(s || 0)) * 1000;
          }
          return 0;
        };
        return sortDir === "asc" ? toMs(aDur) - toMs(bDur) : toMs(bDur) - toMs(aDur);
      }
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortDir === "asc" ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [filteredRuns, sortKey, sortDir, formatDuration]);

  const visibleRuns = useMemo(() => sortedRuns.slice(0, pageSize), [sortedRuns, pageSize]);

  const handleSortChange = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const refresh = async () => {
    await mutate(undefined, { revalidate: true });
    setLastRefreshed(new Date().toISOString());
  };

  const applyDateRange = () => {
    setAppliedStart(pendingStart);
    setAppliedEnd(pendingEnd);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t("Automation", "Automatisation")}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{t("Runs", "Executions")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Monitor execution health, replay failed steps, and inspect outputs.",
                "Surveillez la sante d execution, relancez les echecs et inspectez les sorties."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            {lastRefreshed
              ? `${t("Updated", "Mis a jour")} ${formatRunDateTime(lastRefreshed)}`
              : t("Live", "En direct")}
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              {t("Refresh", "Rafraichir")}
            </button>
          </div>
        </div>
      </div>

      {runActionStatus && <Alert variant={runActionStatus.type}>{runActionStatus.message}</Alert>}

      <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder={t("Search runs or flow", "Rechercher execution ou flux")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-64 rounded-full border border-border/70 bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="all">{t("All statuses", "Tous statuts")}</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="PENDING">QUEUED</option>
            </select>
            <select
              value={flowFilter}
              onChange={(e) => setFlowFilter(e.target.value)}
              className="h-9 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="all">{t("All flows", "Tous flux")}</option>
              {flowOptions.map((flow) => (
                <option key={flow} value={flow}>
                  {flow}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
            <div className="text-[11px] uppercase tracking-[0.2em]">{t("Date range", "Periode")}</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">
                  {t("From", "De")}
                </span>
                <div className="flex items-center gap-2">
              <select
                value={pendingStartDay}
                onChange={(e) => setPendingStartDay(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Day", "Jour")}</option>
                {Array.from({ length: 31 }).map((_, idx) => (
                  <option key={idx + 1} value={String(idx + 1)}>
                    {idx + 1}
                  </option>
                ))}
              </select>
              <select
                value={pendingStartMonth}
                onChange={(e) => setPendingStartMonth(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Month", "Mois")}</option>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
                  (label, index) => (
                    <option key={label} value={String(index + 1)}>
                      {label}
                    </option>
                  )
                )}
              </select>
              <select
                value={pendingStartYear}
                onChange={(e) => setPendingStartYear(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Year", "Annee")}</option>
                {Array.from({ length: 7 }).map((_, idx) => {
                  const year = new Date().getFullYear() - 2 + idx;
                  return (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  );
                })}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">
                  {t("To", "A")}
                </span>
                <div className="flex items-center gap-2">
              <select
                value={pendingEndDay}
                onChange={(e) => setPendingEndDay(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Day", "Jour")}</option>
                {Array.from({ length: 31 }).map((_, idx) => (
                  <option key={idx + 1} value={String(idx + 1)}>
                    {idx + 1}
                  </option>
                ))}
              </select>
              <select
                value={pendingEndMonth}
                onChange={(e) => setPendingEndMonth(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Month", "Mois")}</option>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
                  (label, index) => (
                    <option key={label} value={String(index + 1)}>
                      {label}
                    </option>
                  )
                )}
              </select>
              <select
                value={pendingEndYear}
                onChange={(e) => setPendingEndYear(e.target.value)}
                className="h-8 rounded-md border border-border px-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">{t("Year", "Annee")}</option>
                {Array.from({ length: 7 }).map((_, idx) => {
                  const year = new Date().getFullYear() - 2 + idx;
                  return (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  );
                })}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={applyDateRange}
                disabled={
                  ((pendingStartDay || pendingStartMonth || pendingStartYear) && !pendingStart) ||
                  ((pendingEndDay || pendingEndMonth || pendingEndYear) && !pendingEnd) ||
                  (pendingStart === appliedStart && pendingEnd === appliedEnd)
                }
                className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
              >
                {t("Apply", "Appliquer")}
              </button>
            </div>
            {(appliedStart || appliedEnd) && (
              <span className="text-xs text-muted-foreground">
                {t("Active:", "Actif:")}{" "}
                {appliedStart
                  ? formatDateDMY(new Date(`${appliedStart}T00:00:00`))
                  : "—"}
                {appliedEnd
                  ? ` → ${formatDateDMY(new Date(`${appliedEnd}T00:00:00`))}`
                  : ""}
              </span>
            )}
          </div>
        </div>

        <RunsTable
          runs={visibleRuns}
          onViewLog={toggleLogs}
          onRestart={restart}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          formatDateTime={formatRunDateTime}
          formatDuration={formatDuration}
          t={t}
        />

        {visibleRuns.length < sortedRuns.length && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setPageSize((prev) => prev + 20)}
              className="rounded-full border border-border/70 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              {t("Load more", "Charger plus")}
            </button>
          </div>
        )}
      </div>

      <RunDetailsDrawer
        open={Boolean(isLogOpen && selectedRun)}
        onClose={() => setLogOpen(false)}
        run={selectedRun}
        formatDateTime={formatRunDateTime}
        formatStepLabel={formatStepLabel}
        formatRunMessage={formatRunMessage}
        formatDuration={formatDuration}
        t={t}
      />
    </div>
  );
}
