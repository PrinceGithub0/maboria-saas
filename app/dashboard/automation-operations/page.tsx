"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

type RunRecord = {
  id: string;
  flowId: string;
  runStatus?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  logs?: unknown;
  trigger?: string | null;
  source?: string | null;
  input?: unknown;
  flow?: { title?: string | null } | null;
};

type RunLog = {
  timestamp?: string | null;
  step?: string | null;
  result?: unknown;
  error?: string | null;
  reason?: string | null;
};

const PAGE_SIZE = 24;
const ROW_HEIGHT = 170;
const AUTO_REFRESH_STORAGE_KEY = "automation_auto_refresh";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load operations");
  return res.json();
};

const asObj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
const asLogs = (v: unknown): RunLog[] => (Array.isArray(v) ? (v as RunLog[]) : []);
const norm = (v?: string | null) => String(v || "").trim().toUpperCase();

const statusLabel = (s: string) => {
  if (s === "SUCCESS") return "Completed";
  if (s === "FAILED") return "Failed";
  if (s === "RUNNING") return "In progress";
  return "Pending";
};

const statusTone = (s: string) => {
  if (s === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
  if (s === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300";
  if (s === "RUNNING") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300";
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
};

const statusIcon = (s: string) => {
  if (s === "SUCCESS") return CheckCircle2;
  if (s === "FAILED") return XCircle;
  if (s === "RUNNING") return Loader2;
  return Clock3;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date}, ${time}`;
};

const formatDuration = (start?: string | null, end?: string | null, status?: string | null) => {
  if (!start) return "--";
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : norm(status) === "RUNNING" ? Date.now() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "--";
  const ms = Math.max(0, b - a);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
};

const stepLabel = (v?: string | null) => {
  const raw = String(v || "").trim();
  if (!raw) return "Step";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const contextForRun = (run: RunRecord) => {
  const input = asObj(run.input);
  const invoice = asObj(input.invoice);
  const payment = asObj(input.payment);
  const customer = asObj(input.customer);
  const event = String(input.event || run.trigger || run.source || "System").toLowerCase();
  const eventMap: Record<string, string> = {
    invoice_status: "Invoice status changed",
    "invoice.status.changed": "Invoice status changed",
    "payment.verified": "Payment confirmed",
    manual: "Manual start",
    webhook: "Webhook event",
    schedule: "Scheduled start",
    system: "System event",
  };
  return {
    startedBy: eventMap[event] || String(input.event || run.trigger || run.source || "System"),
    customer: String(customer.name || customer.email || invoice.customerName || input.customerName || "--"),
    invoice: String(invoice.invoiceNumber || input.invoiceNumber || invoice.id || input.invoiceId || "--"),
    paymentReference: String(payment.reference || input.reference || input.paymentReference || "--"),
  };
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

export default function AutomationOperationsPage() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const t = useCallback((en: string, fr: string) => (language === "fr" ? fr : en), [language]);
  const { data, mutate, error } = useSWR<RunRecord[]>("/api/automation/runs", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const runs = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [automationFilter, setAutomationFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmRetryId, setConfirmRetryId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const virtualRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  const refreshData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      if (!silent) setIsRefreshing(true);

      const pageScrollY = window.scrollY;
      const listScrollY = virtualRef.current?.scrollTop ?? 0;
      try {
        const next = await fetcher("/api/automation/runs");
        await mutate(next, { revalidate: false, populateCache: true });
        setLastRefreshed(new Date().toISOString());
      } finally {
        requestAnimationFrame(() => {
          window.scrollTo({ top: pageScrollY });
          if (virtualRef.current) virtualRef.current.scrollTop = listScrollY;
        });
        refreshInFlightRef.current = false;
        if (!silent) setIsRefreshing(false);
      }
    },
    [mutate]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const nextSearch = String(searchParams.get("q") || "");
    const nextStatus = String(searchParams.get("status") || "all").trim().toUpperCase();
    const nextAutomation = String(searchParams.get("automation") || "all");
    const nextFrom = String(searchParams.get("from") || "");
    const nextTo = String(searchParams.get("to") || "");

    setSearchInput(nextSearch);
    setQuery(nextSearch.trim().toLowerCase());
    setStatusFilter(
      nextStatus === "SUCCESS" || nextStatus === "FAILED" || nextStatus === "RUNNING" || nextStatus === "PENDING"
        ? nextStatus
        : "all"
    );
    setAutomationFilter(nextAutomation || "all");
    setStartDate(nextFrom);
    setEndDate(nextTo);
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
      if (saved === "false") setAutoRefresh(false);
      else setAutoRefresh(true);
    } catch {
      setAutoRefresh(true);
    }
  }, []);

  useEffect(() => {
    if (data || error) {
      setIsInitialLoading(false);
      if (data) setLastRefreshed(new Date().toISOString());
    }
  }, [data, error]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
    } catch {
      // ignore storage exceptions
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!autoRefresh) return;

    intervalRef.current = window.setInterval(() => {
      void refreshData({ silent: true });
    }, 15000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshData]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setScrollTop(0);
  }, [query, statusFilter, automationFilter, startDate, endDate]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setVisibleCount((v) => v + PAGE_SIZE);
        });
      },
      { rootMargin: "160px" }
    );
    obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, []);

  const refreshNow = async () => {
    await refreshData({ silent: false });
  };

  const flowOptions = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((run) => {
      const title = String(run.flow?.title || "").trim();
      if (title) set.add(title);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const a = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const b = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    return [...runs]
      .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
      .filter((run) => {
        const status = norm(run.runStatus);
        const created = new Date(run.createdAt).getTime();
        const info = contextForRun(run);
        if (statusFilter !== "all" && statusFilter !== status) return false;
        if (automationFilter !== "all" && automationFilter !== run.flow?.title) return false;
        if (a && created < a) return false;
        if (b && created > b) return false;
        if (!query) return true;
        const hay = [
          run.id,
          run.flow?.title,
          info.customer,
          info.invoice,
          info.paymentReference,
          info.startedBy,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
  }, [runs, statusFilter, automationFilter, startDate, endDate, query]);

  const useVirtual = filteredRuns.length > 100;
  const baseRuns = useVirtual ? filteredRuns : filteredRuns.slice(0, visibleCount);
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4) : 0;
  const viewportHeight = virtualRef.current?.clientHeight ?? 640;
  const endIdx = useVirtual ? Math.min(baseRuns.length, startIdx + Math.ceil(viewportHeight / ROW_HEIGHT) + 8) : baseRuns.length;
  const visibleRuns = useVirtual ? baseRuns.slice(startIdx, endIdx) : baseRuns;

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);
  const timeline = useMemo(() => {
    const logs = asLogs(selectedRun?.logs);
    return logs.map((log, i) => {
      const result = String(log.result || "").toLowerCase();
      const failed = Boolean(log.error) || result === "failed" || result === "retry-exhausted";
      const pending = result === "retry-scheduled" || result === "scheduled";
      const status = failed ? "failed" : pending ? "pending" : "success";
      const ts = log.timestamp ? new Date(log.timestamp).getTime() : NaN;
      const next = i < logs.length - 1 && logs[i + 1]?.timestamp ? new Date(logs[i + 1].timestamp as string).getTime() : NaN;
      const d =
        Number.isFinite(ts) && Number.isFinite(next) && next >= ts
          ? formatDuration(new Date(ts).toISOString(), new Date(next).toISOString(), "SUCCESS")
          : "--";
      return {
        id: `${selectedRun?.id || "run"}-${i}`,
        step: stepLabel(log.step),
        status,
        timestamp: log.timestamp,
        duration: d,
        message: String(log.error || log.reason || (typeof log.result === "string" ? log.result : "")),
      };
    });
  }, [selectedRun]);

  const completedToday = useMemo(() => {
    const start = new Date(new Date().toDateString()).getTime();
    return runs.filter((r) => norm(r.runStatus) === "SUCCESS" && new Date(r.createdAt).getTime() >= start).length;
  }, [runs]);

  const failedToday = useMemo(() => {
    const start = new Date(new Date().toDateString()).getTime();
    return runs.filter((r) => norm(r.runStatus) === "FAILED" && new Date(r.createdAt).getTime() >= start).length;
  }, [runs]);

  const pendingCount = useMemo(() => runs.filter((r) => ["RUNNING", "PENDING"].includes(norm(r.runStatus))).length, [runs]);

  const avgDuration = useMemo(() => {
    const vals = runs
      .map((r) => {
        const a = new Date(r.startedAt || r.createdAt).getTime();
        const b = r.completedAt ? new Date(r.completedAt).getTime() : NaN;
        return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
      })
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) return "--";
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    return formatDuration(new Date().toISOString(), new Date(Date.now() + avg).toISOString(), "SUCCESS");
  }, [runs]);

  const series = useMemo(() => {
    const days = 7;
    const now = new Date();
    const keys = Array.from({ length: days }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - idx));
      return d.toISOString().slice(0, 10);
    });
    const base = () => Object.fromEntries(keys.map((k) => [k, 0]));
    const done = base();
    const fail = base();
    const pend = base();
    const dur = base();
    runs.forEach((run) => {
      const key = String(run.createdAt || "").slice(0, 10);
      if (!keys.includes(key)) return;
      const st = norm(run.runStatus);
      if (st === "SUCCESS") done[key] += 1;
      if (st === "FAILED") fail[key] += 1;
      if (st === "RUNNING" || st === "PENDING") pend[key] += 1;
      const a = new Date(run.startedAt || run.createdAt).getTime();
      const b = run.completedAt ? new Date(run.completedAt).getTime() : NaN;
      if (Number.isFinite(a) && Number.isFinite(b)) dur[key] += Math.round(Math.max(0, b - a) / 1000);
    });
    return {
      done: keys.map((k) => done[k]),
      fail: keys.map((k) => fail[k]),
      pend: keys.map((k) => pend[k]),
      dur: keys.map((k) => dur[k]),
    };
  }, [runs]);

  const failedLastHour = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return runs.filter((r) => norm(r.runStatus) === "FAILED" && new Date(r.createdAt).getTime() >= cutoff).length;
  }, [runs]);

  const retriesPending = useMemo(
    () => runs.filter((r) => asLogs(r.logs).some((l) => String(l.result || "").toLowerCase() === "retry-scheduled")).length,
    [runs]
  );

  const whatsappDelay = useMemo(
    () =>
      runs.filter((r) =>
        asLogs(r.logs).some((l) => {
          const step = String(l.step || "").toLowerCase();
          const result = String(l.result || "").toLowerCase();
          return step.includes("whatsapp") && ["retry-scheduled", "retry-exhausted"].includes(result);
        })
      ).length,
    [runs]
  );

  const system = failedLastHour > 0 ? "incident" : pendingCount > 0 || retriesPending > 0 ? "degraded" : "healthy";
  const systemLabel = system === "incident" ? "Incident Detected" : system === "degraded" ? "Degraded" : "Healthy";
  const systemTone =
    system === "incident"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
      : system === "degraded"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
        : "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";

  const alerts = [
    failedLastHour > 0 ? `${failedLastHour} automations failed in the last hour` : "",
    whatsappDelay > 0 ? "WhatsApp delivery delays detected" : "",
    retriesPending > 0 ? `${retriesPending} retries pending` : "",
  ].filter(Boolean);

  const clearFilters = () => {
    setSearchInput("");
    setQuery("");
    setStatusFilter("all");
    setAutomationFilter("all");
    setStartDate("");
    setEndDate("");
  };

  const retryRun = async (run: RunRecord) => {
    setRetrying(true);
    setNotice(null);
    try {
      const originalInput = asObj(run.input);
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: run.flowId,
          input: {
            ...originalInput,
            retryFromRunId: run.id,
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", message: String(payload?.reason || payload?.error || "Unable to retry this automation.") });
      } else {
        setNotice({ type: "success", message: "Automation retry started." });
        setConfirmRetryId(null);
        await refreshNow();
      }
    } catch {
      setNotice({ type: "error", message: "Network error. Please try again." });
    } finally {
      setRetrying(false);
    }
  };

  const retryFailedStep = async (run: RunRecord) => {
    setRetrying(true);
    setNotice(null);
    try {
      const res = await fetch("/api/automation/retry-safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice({ type: "success", message: "Failed step retry started." });
        await refreshNow();
        return;
      }
      if (res.status === 409 && payload?.type === "not_retryable") {
        setConfirmRetryId(run.id);
        return;
      }
      setNotice({
        type: "error",
        message: String(payload?.reason || payload?.error || "Unable to retry this step."),
      });
    } catch {
      setNotice({ type: "error", message: "Network error. Please try again." });
    } finally {
      setRetrying(false);
    }
  };

  const renderRunCard = (run: RunRecord, key?: string | null) => {
    const status = norm(run.runStatus);
    const Icon = statusIcon(status);
    const info = contextForRun(run);
    return (
      <article key={key || run.id} data-run-menu className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/80">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_auto]">
          <div className="flex items-start gap-3">
            <span className={clsx("mt-1 rounded-full p-1.5", statusTone(status))}>
              <Icon className={clsx("h-4 w-4", status === "RUNNING" ? "animate-spin" : "")} />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{run.flow?.title || "Untitled automation"}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Started by: {info.startedBy}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Customer: {info.customer}</span>
                <span>Invoice: {info.invoice}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Started</p>
              <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{formatDateTime(run.startedAt || run.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Duration</p>
              <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{formatDuration(run.startedAt || run.createdAt, run.completedAt, run.runStatus)}</p>
            </div>
          </div>
          <div className="flex items-start justify-end gap-2">
            <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone(status))}>{statusLabel(status)}</span>
            <button type="button" onClick={() => { setSelectedRunId(run.id); setDrawerOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">View Details</button>
            {status === "FAILED" ? (
              <button type="button" onClick={() => void retryFailedStep(run)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Retry</button>
            ) : null}
            <div className="relative">
              <button type="button" onClick={() => setMenuOpenId(menuOpenId === run.id ? null : run.id)} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpenId === run.id ? (
                <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(run.id); setNotice({ type: "success", message: "Activity ID copied." }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100">
                    <Copy className="h-3.5 w-3.5" />Copy activity ID
                  </button>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(run.flowId); setNotice({ type: "success", message: "Automation ID copied." }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100">
                    <Copy className="h-3.5 w-3.5" />Copy automation ID
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Automation", "Automatisation")}</p>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">
              {t("Automation Operations", "Operations d automatisation")}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "Monitor automation health, investigate issues, and replay failed steps.",
                "Surveillez la sante, investiguez les echecs et relancez les etapes."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", systemTone)}>
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  system === "healthy" ? "bg-emerald-500" : system === "degraded" ? "bg-amber-500" : "bg-rose-500"
                )}
              />
              {systemLabel}
            </span>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Auto-refresh</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                aria-label="Toggle auto-refresh"
                onClick={() => setAutoRefresh((v) => !v)}
                className={clsx(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition",
                  autoRefresh ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition",
                    autoRefresh ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={refreshNow}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>{lastRefreshed ? `Last updated ${formatDateTime(lastRefreshed)}` : "Live data"}</p>
          {!alerts.length ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-1 font-medium text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              System healthy
            </p>
          ) : null}
        </div>
      </header>

      {alerts.length ? (
        <section
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
          )}
        >
          {alerts.map((m) => (
            <p key={m} className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {m}
            </p>
          ))}
        </section>
      ) : null}

      {notice ? (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Completed Today</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{completedToday}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">7-day trend</span>
            <Sparkline values={series.done} color="#16a34a" />
          </div>
        </article>
        <article className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm dark:border-rose-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Failed Today</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{failedToday}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">7-day trend</span>
            <Sparkline values={series.fail} color="#e11d48" />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Pending</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{pendingCount}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">7-day trend</span>
            <Sparkline values={series.pend} color="#d97706" />
          </div>
        </article>
        <article className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Average Duration</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{avgDuration}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">7-day trend</span>
            <Sparkline values={series.dur} color="#2563eb" />
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between lg:hidden">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filters</h2>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <ChevronDown className={clsx("h-3.5 w-3.5 transition", mobileFiltersOpen ? "rotate-180" : "")} />
            {mobileFiltersOpen ? "Hide" : "Show"}
          </button>
        </div>
        <div
          className={clsx(
            "mt-3 grid gap-3 lg:mt-0 lg:grid-cols-[minmax(220px,2fr)_170px_220px_360px]",
            !mobileFiltersOpen && "hidden lg:grid"
          )}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search automations, customer, invoice"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">All statuses</option>
            <option value="SUCCESS">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="RUNNING">In progress</option>
            <option value="PENDING">Pending</option>
          </select>
          <select
            value={automationFilter}
            onChange={(e) => setAutomationFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">All automations</option>
            {flowOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {isInitialLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Loading automation operations...
          </div>
        ) : !runs.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">No automation activity yet.</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">When automations begin running, they will appear here.</p>
          </div>
        ) : !filteredRuns.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">No automation activity matches your filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Clear Filters
            </button>
          </div>
        ) : useVirtual ? (
          <div
            ref={virtualRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="max-h-[68vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70"
          >
            <div className="relative" style={{ height: `${baseRuns.length * ROW_HEIGHT}px` }}>
              {visibleRuns.map((run, i) => (
                <div key={run.id} className="absolute left-0 right-0" style={{ top: `${(startIdx + i) * ROW_HEIGHT}px` }}>
                  {renderRunCard(run)}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {visibleRuns.map((run) => renderRunCard(run))}
            {baseRuns.length < filteredRuns.length ? <div ref={loadMoreRef} className="h-8" /> : null}
          </>
        )}
      </section>

      {drawerOpen && selectedRun ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close details"
          />
          <aside className="absolute inset-x-0 bottom-0 top-12 overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[560px] md:rounded-none md:rounded-l-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Run Overview</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                  {selectedRun.flow?.title || "Untitled automation"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const info = contextForRun(selectedRun);
              const status = norm(selectedRun.runStatus);
              return (
                <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Status</p>
                    <span className={clsx("mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold", statusTone(status))}>
                      {statusLabel(status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Start Event</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.startedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Customer</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.customer}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Invoice</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.invoice}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Payment Reference</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.paymentReference}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Started</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{formatDateTime(selectedRun.startedAt || selectedRun.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Duration</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">
                      {formatDuration(selectedRun.startedAt || selectedRun.createdAt, selectedRun.completedAt, selectedRun.runStatus)}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Step Timeline</h3>
              <div className="mt-3 space-y-3">
                {timeline.length ? (
                  timeline.map((item, idx) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={clsx(
                              "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                              item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : item.status === "failed"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {item.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : item.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Clock3 className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Step {idx + 1} - {item.step}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {item.timestamp ? formatDateTime(item.timestamp) : "--"} - {item.duration}
                            </p>
                          </div>
                        </div>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                            item.status === "success"
                              ? "bg-emerald-100 text-emerald-700"
                              : item.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      {item.message ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{item.message}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    No step timeline available for this run.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {confirmRetryId ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setConfirmRetryId(null)}
            aria-label="Close retry confirmation"
          />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Confirm Full Run Retry</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This retry will start the full automation again from the beginning.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRetryId(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={retrying}
                onClick={() => {
                  const run = runs.find((r) => r.id === confirmRetryId);
                  if (run) void retryRun(run);
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retrying ? "Retrying..." : "Retry full run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
