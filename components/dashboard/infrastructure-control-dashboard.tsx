"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import type {
  DateRangeKey,
  InfrastructureDashboardPayload,
  SystemState,
  TimelineEntry,
} from "@/lib/dashboard/control-types";

const AUTO_REFRESH_KEY = "dashboard_auto_refresh";
const RANGE_KEY = "dashboard_date_range";
const TIMELINE_PAGE_SIZE = 20;

function msLabel(value: number | null) {
  if (!value || value <= 0) return "--";
  if (value < 1000) return `${value} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  const mins = Math.floor(value / 60000);
  const secs = Math.round((value % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function stateLabel(state: SystemState) {
  if (state === "critical") return "Critical";
  if (state === "degraded") return "Degraded";
  return "Stable";
}

function stateClasses(state: SystemState) {
  if (state === "critical") return "border-red-300 bg-red-50 text-red-800";
  if (state === "degraded") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function timelineIcon(item: TimelineEntry) {
  if (item.status === "failed") return XCircle;
  if (item.status === "warning") return AlertTriangle;
  if (item.status === "success") return CheckCircle2;
  return Clock3;
}

function buildRangeQuery(range: InfrastructureDashboardPayload["dateRange"]) {
  const query = new URLSearchParams();
  query.set("range", range.key);
  if (range.key === "custom") {
    query.set("from", range.from);
    query.set("to", range.to);
  }
  return query;
}

function Sparkline({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(100, ...points.map((point) => point.value));
  const width = 240;
  const height = 64;
  const coords = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (point.value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full">
      <polyline fill="none" stroke="#1d4ed8" strokeWidth="2.5" points={coords} />
    </svg>
  );
}

function SkeletonLayout() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-14 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-8 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-64 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
      </div>
      <div className="h-64 rounded-lg border border-slate-200 bg-slate-100" />
    </div>
  );
}

export function InfrastructureControlDashboard({
  initialData,
}: {
  initialData: InfrastructureDashboardPayload;
}) {
  const router = useRouter();
  const [data, setData] = useState<InfrastructureDashboardPayload>(initialData);
  const [isInitialLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTO_REFRESH_KEY);
      setAutoRefresh(stored === "true");
    } catch {
      setAutoRefresh(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_REFRESH_KEY, String(autoRefresh));
    } catch {
      // ignore
    }
  }, [autoRefresh]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RANGE_KEY, JSON.stringify(data.dateRange.query));
    } catch {
      // ignore
    }
  }, [data.dateRange]);

  const refreshData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setIsRefreshing(true);
      setWarning(null);

      try {
        const query = buildRangeQuery(data.dateRange);
        const response = await fetch(`/api/dashboard/control?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("refresh_failed");
        const next = (await response.json()) as InfrastructureDashboardPayload;
        setData(next);
      } catch {
        setWarning("Live data temporarily unavailable. Showing last updated state.");
      } finally {
        inFlightRef.current = false;
        if (!silent) setIsRefreshing(false);
      }
    },
    [data.dateRange]
  );

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!autoRefresh) return;
    intervalRef.current = window.setInterval(() => {
      void refreshData({ silent: true });
    }, 20000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshData]);

  const withRange = useCallback(
    (path: string, extra?: Record<string, string>) => {
      const query = buildRangeQuery(data.dateRange);
      Object.entries(extra || {}).forEach(([key, value]) => query.set(key, value));
      const qs = query.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [data.dateRange]
  );

  const setRange = async (next: { range: DateRangeKey; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    query.set("range", next.range);
    if (next.range === "custom") {
      if (!next.from || !next.to) return;
      query.set("from", next.from);
      query.set("to", next.to);
    }
    const nextPath = `/dashboard?${query.toString()}`;
    router.replace(nextPath, { scroll: false });

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);
    setWarning(null);
    try {
      const response = await fetch(`/api/dashboard/control?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("range_fetch_failed");
      const payload = (await response.json()) as InfrastructureDashboardPayload;
      setData(payload);
      setTimelineVisible(TIMELINE_PAGE_SIZE);
    } catch {
      setWarning("Live data temporarily unavailable. Showing last updated state.");
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  };

  const retrySafeRun = async (item: TimelineEntry) => {
    if (!item.runId || !item.canRetry) return;
    setRetryingId(item.id);
    setWarning(null);
    try {
      const response = await fetch("/api/automation/retry-safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: item.runId }),
      });
      if (!response.ok) throw new Error("retry_failed");
      await refreshData({ silent: true });
    } catch {
      setWarning("Retry could not be started. Please open Automation Operations for details.");
    } finally {
      setRetryingId(null);
    }
  };

  const currentRange = data.dateRange;
  const visibleTimeline = data.timeline.slice(0, timelineVisible);
  const canLoadMore = timelineVisible < data.timeline.length;
  const defaultCustomFrom = currentRange.key === "custom" ? currentRange.from : "";
  const defaultCustomTo = currentRange.key === "custom" ? currentRange.to : "";
  const [customFrom, setCustomFrom] = useState(defaultCustomFrom);
  const [customTo, setCustomTo] = useState(defaultCustomTo);

  useEffect(() => {
    if (currentRange.key === "custom") {
      setCustomFrom(currentRange.from);
      setCustomTo(currentRange.to);
    }
  }, [currentRange]);

  const commandMetrics = useMemo(
    () => [
      { label: "Active Automations", value: data.commandStrip.activeAutomations },
      { label: "Failed Runs", value: data.commandStrip.failedRuns },
      { label: "Queue Status", value: data.commandStrip.queueStatus },
      { label: "Average Execution", value: msLabel(data.commandStrip.averageExecutionMs) },
      {
        label: "Last Updated",
        value: new Date(data.commandStrip.lastUpdated).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ],
    [data.commandStrip]
  );

  if (isInitialLoading) return <SkeletonLayout />;

  return (
    <div className="space-y-4 bg-slate-50 pb-8">
      <section className="border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold",
                stateClasses(data.commandStrip.state)
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              System State: {stateLabel(data.commandStrip.state)}
            </span>
            <span className="text-sm text-slate-600">Automation Operations Command Surface</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              Auto-refresh
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                  autoRefresh ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-200"
                )}
                aria-pressed={autoRefresh}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition",
                    autoRefresh ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
            <button
              type="button"
              onClick={() => void refreshData({ silent: false })}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800"
              disabled={isRefreshing}
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5">
              <CalendarRange className="h-4 w-4 text-slate-600" />
              <select
                value={currentRange.key}
                onChange={(event) => void setRange({ range: event.target.value as DateRangeKey })}
                className="bg-transparent text-sm font-medium text-slate-800 outline-none"
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {currentRange.key === "custom" ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void setRange({ range: "custom", from: customFrom, to: customTo })}
                  className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                >
                  Apply
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {commandMetrics.map((item) => (
            <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {warning ? (
        <section className="border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{warning}</section>
      ) : null}

      <section
        className={clsx(
          "border px-4 py-3 text-sm font-medium",
          data.alertStrip.mode === "ok" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-amber-100 text-amber-900"
        )}
      >
        {data.alertStrip.items.join(" • ")}
      </section>

      <section className="border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Infrastructure Control Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Operational visibility across automation, billing, and infrastructure health.</p>
          </div>
          <span className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Range: {data.dateRange.label}
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">System State</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">Automation Success Rate</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.successRate}%</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">Runs Today</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.runsToday}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">Failures Today</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.failuresToday}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">Average Duration</p>
                <p className="text-2xl font-semibold text-slate-900">{msLabel(data.primary.averageDurationMs)}</p>
              </div>
            </div>
            <div className="mt-4 rounded border border-slate-200 bg-white p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">7-Day Trend</p>
              <div className="mt-1">
                <Sparkline points={data.primary.trend} />
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">{data.primary.summary}</p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Control Context</p>
            <p className="mt-3 text-sm text-slate-700">
              This dashboard tracks verified backend events only. Financial state, payment references, and automation execution
              state are sourced from confirmed records.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Automation Control</h2>
            <Link href={withRange("/dashboard/automations")} className="text-xs font-semibold text-blue-700">
              View Automations
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Link href={withRange("/dashboard/automations")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Active Automations</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.active}</span>
            </Link>
            <Link href={withRange("/dashboard/automations", { status: "PAUSED" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Paused Automations</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.paused}</span>
            </Link>
            <Link href={withRange("/dashboard/automation-operations", { status: "FAILED" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Failed Runs</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.failedRuns}</span>
            </Link>
          </div>
          {data.modules.automation.active + data.modules.automation.paused === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No automations created yet.</p>
          ) : null}
        </article>

        {data.permissions.canViewBilling && data.modules.billing ? (
          <article className="border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Billing & Payments</h2>
              <Link href={withRange("/dashboard/invoices")} className="text-xs font-semibold text-blue-700">
                View Invoices
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Revenue</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(data.modules.billing.revenue, data.modules.billing.currency)}
                </span>
              </div>
              <Link href={withRange("/dashboard/invoices")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Invoices Sent</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.invoicesSent}</span>
              </Link>
              <Link href={withRange("/dashboard/invoices", { status: "OVERDUE" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Invoices Overdue</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.invoicesOverdue}</span>
              </Link>
              <Link href={withRange("/billing/payments")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Payment Success Rate</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.paymentSuccessRate}%</span>
              </Link>
            </div>
            {data.modules.billing.revenue === 0 && data.modules.billing.invoicesSent === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No billing activity yet.</p>
            ) : null}
          </article>
        ) : null}

        {data.permissions.canViewInfrastructure && data.modules.infrastructure ? (
          <article className="border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Infrastructure Health</h2>
              <Link href={withRange("/admin/logs")} className="text-xs font-semibold text-blue-700">
                View System Logs
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Webhook Status</span>
                <span
                  className={clsx(
                    "font-semibold",
                    data.modules.infrastructure.webhookStatus === "Healthy" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {data.modules.infrastructure.webhookStatus}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Messaging Provider</span>
                <span
                  className={clsx(
                    "font-semibold",
                    data.modules.infrastructure.messagingStatus === "Healthy" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {data.modules.infrastructure.messagingStatus}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">API Latency</span>
                <span className="font-semibold text-slate-900">{msLabel(data.modules.infrastructure.apiLatencyMs)}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">Error Rate</span>
                <span className="font-semibold text-slate-900">{data.modules.infrastructure.errorRate}%</span>
              </div>
            </div>
          </article>
        ) : null}
      </section>

      <section className="border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent System Activity</h2>
          <span className="text-xs text-slate-500">Latest 20 entries</span>
        </div>

        {visibleTimeline.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No recent system activity.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {visibleTimeline.map((item) => {
              const Icon = timelineIcon(item);
              return (
                <article key={item.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={clsx(
                          "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full",
                          item.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : item.status === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {item.customer ? <span>Customer: {item.customer}</span> : null}
                          {item.invoice ? <span>Invoice: {item.invoice}</span> : null}
                          {item.durationMs ? <span>Duration: {msLabel(item.durationMs)}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(item.timestamp).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {item.canRetry ? (
                        <button
                          type="button"
                          onClick={() => void retrySafeRun(item)}
                          disabled={retryingId === item.id}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          {retryingId === item.id ? "Retrying..." : "Retry"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {canLoadMore ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setTimelineVisible((count) => Math.min(count + TIMELINE_PAGE_SIZE, data.timeline.length))}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Load More
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:hidden">
        <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            {data.commandStrip.state === "critical" ? (
              <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
            Operational mobile view enabled
          </span>
        </div>
      </section>
    </div>
  );
}
