"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from "lucide-react";

import type { SubscriberDashboardData } from "@/lib/dashboard/subscriber-data";
import { formatCurrency } from "@/lib/currency";
import { rangeToQuery } from "@/lib/shared/date-range";

const AUTO_REFRESH_KEY = "subscriber_dashboard_auto_refresh";
const RANGE_STATE_KEY = "subscriber_dashboard_range";
const MAX_TIMELINE_ITEMS = 20;

function compactTime(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusClass(status: SubscriberDashboardData["status"]) {
  if (status === "critical") return "border-red-300 bg-red-100 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200";
  if (status === "attention") return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
  return "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200";
}

function statusLabel(status: SubscriberDashboardData["status"]) {
  if (status === "critical") return "Critical";
  if (status === "attention") return "Attention Needed";
  return "Stable";
}

function MiniTrend({ values }: { values: number[] }) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const width = 76;
  const height = 18;
  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * width;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-4 w-20" aria-hidden="true">
      <polyline fill="none" stroke="#2563eb" strokeWidth="1.8" points={points} />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-28 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-28 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      </div>
      <div className="h-64 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

function buildRangeFromKey(key: "today" | "last7" | "last30" | "custom", current: SubscriberDashboardData["dateRange"]) {
  if (key === "today") {
    const day = new Date().toISOString().slice(0, 10);
    return { key: "today" as const, from: day, to: day, label: "Today" };
  }
  if (key === "last30") {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      key: "last30" as const,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: "Last 30 Days",
    };
  }
  if (key === "custom") {
    return { key: "custom" as const, from: current.from, to: current.to, label: "Custom" };
  }
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    key: "last7" as const,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: "Last 7 Days",
  };
}

export function SubscriberOverviewDashboard({
  initialData,
}: {
  initialData: SubscriberDashboardData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [warning, setWarning] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleTimeline, setVisibleTimeline] = useState(MAX_TIMELINE_ITEMS);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTO_REFRESH_KEY);
      setAutoRefresh(saved === "true");
    } catch {
      setAutoRefresh(false);
    }
  }, []);

  useEffect(() => {
    try {
      const hasRangeInUrl = new URLSearchParams(window.location.search).has("range");
      if (hasRangeInUrl) return;
      const stored = window.localStorage.getItem(RANGE_STATE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { key?: string; from?: string; to?: string } | null;
      if (!parsed?.key || !parsed.from || !parsed.to) return;
      if (
        parsed.key === data.dateRange.key &&
        parsed.from === data.dateRange.from &&
        parsed.to === data.dateRange.to
      ) {
        return;
      }
      void setRange(parsed.key as "today" | "last7" | "last30" | "custom", parsed.from, parsed.to);
    } catch {
      // ignore invalid stored range
    }
    // run once on mount to restore range when route has no query
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      window.localStorage.setItem(RANGE_STATE_KEY, JSON.stringify(data.dateRange));
    } catch {
      // ignore
    }
  }, [data.dateRange]);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setIsRefreshing(true);
      setWarning(null);
      setFatalError(null);
      try {
        const query = rangeToQuery(data.dateRange);
        const response = await fetch(`/api/dashboard/subscriber?${query.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const error = new Error("refresh_failed") as Error & { status?: number };
          error.status = response.status;
          throw error;
        }
        const payload = (await response.json()) as SubscriberDashboardData;
        setData(payload);
      } catch (error) {
        const status = error instanceof Error && "status" in error ? Number((error as { status?: number }).status) : 0;
        if (status === 401) {
          setFatalError("Your session expired. Please sign in again.");
          return;
        }
        if (status === 403) {
          setFatalError("You no longer have access to this dashboard.");
          return;
        }
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
      void refresh({ silent: true });
    }, 20000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refresh]);

  const navigateWithRange = useCallback(
    (path: string, extras?: Record<string, string>) => {
      const query = rangeToQuery(data.dateRange, extras);
      const qs = query.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [data.dateRange]
  );

  const setRange = async (rangeKey: "today" | "last7" | "last30" | "custom", from?: string, to?: string) => {
    const nextRange =
      rangeKey === "custom" && from && to
        ? { key: "custom" as const, from, to, label: "Custom" }
        : buildRangeFromKey(rangeKey, data.dateRange);

    const query = rangeToQuery(nextRange);
    router.replace(`/dashboard?${query.toString()}`, { scroll: false });
    setWarning(null);
    setFatalError(null);
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/dashboard/subscriber?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const error = new Error("range_fetch_failed") as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const payload = (await response.json()) as SubscriberDashboardData;
      setData(payload);
      setVisibleTimeline(MAX_TIMELINE_ITEMS);
    } catch (error) {
      const status = error instanceof Error && "status" in error ? Number((error as { status?: number }).status) : 0;
      if (status === 401) {
        setFatalError("Your session expired. Please sign in again.");
        return;
      }
      if (status === 403) {
        setFatalError("You no longer have access to this dashboard.");
        return;
      }
      setWarning("Live data temporarily unavailable. Showing last updated state.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const [customFrom, setCustomFrom] = useState(data.dateRange.key === "custom" ? data.dateRange.from : "");
  const [customTo, setCustomTo] = useState(data.dateRange.key === "custom" ? data.dateRange.to : "");

  useEffect(() => {
    if (data.dateRange.key === "custom") {
      setCustomFrom(data.dateRange.from);
      setCustomTo(data.dateRange.to);
    }
  }, [data.dateRange]);

  const riskRows = useMemo(
    () =>
      [
        ...(data.permissions.canViewBilling
          ? [
              {
                label: "Overdue invoices",
                value: `${data.risk.overdueInvoicesCount} • ${formatCurrency(data.risk.overdueInvoicesAmount, data.overview.currency)}`,
                href: "/dashboard/invoices",
                count: data.risk.overdueInvoicesCount,
              },
              {
                label: "Failed payments",
                value: String(data.risk.failedPaymentsCount),
                href: navigateWithRange("/billing/payments", { status: "failed" }),
                count: data.risk.failedPaymentsCount,
              },
            ]
          : []),
        {
          label: "Failed automations",
          value: String(data.risk.failedAutomationsCount),
          href: navigateWithRange("/dashboard/automation-operations", { status: "FAILED" }),
          count: data.risk.failedAutomationsCount,
        },
        {
          label: "Undelivered messages",
          value: String(data.risk.undeliveredMessagesCount),
          href: "/dashboard/inbox/analytics",
          count: data.risk.undeliveredMessagesCount,
        },
      ].filter((row) => row.count > 0),
    [data, navigateWithRange]
  );

  const timelineRows = data.timeline.slice(0, visibleTimeline);
  const canLoadMoreTimeline = visibleTimeline < data.timeline.length;
  const sectionClass = "border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70";
  const subcardClass = "rounded border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900";
  const articleClass = "border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70";
  const controlClass = "h-9 rounded border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  if (!data) return <Skeleton />;
  if (fatalError) {
    return (
      <section className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
        {fatalError}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className={clsx("inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm font-semibold", statusClass(data.status))}>
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {statusLabel(data.status)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={data.dateRange.key}
              onChange={(event) => void setRange(event.target.value as "today" | "last7" | "last30" | "custom")}
              className={controlClass}
            >
              <option value="today">Today</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {data.dateRange.key === "custom" ? (
              <div className="inline-flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className={`${controlClass} px-2`}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className={`${controlClass} px-2`}
                />
                <button
                  type="button"
                  onClick={() => void setRange("custom", customFrom, customTo)}
                  className="h-9 rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Apply
                </button>
              </div>
            ) : null}
            <span className="text-xs text-slate-500 dark:text-slate-400">Last updated {compactTime(data.generatedAt)}</span>
            <button
              type="button"
              onClick={() => void refresh({ silent: false })}
              disabled={isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              Auto-refresh
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full border",
                  autoRefresh ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 rounded-full bg-white transition",
                    autoRefresh ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
          </div>
        </div>
      </section>

      {warning ? <section className="border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">{warning}</section> : null}

      <section className={sectionClass}>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Overview</h1>
        <div
          className={clsx(
            "mt-3 grid gap-3 sm:grid-cols-2",
            data.permissions.canViewBilling ? "xl:grid-cols-6" : "xl:grid-cols-3"
          )}
        >
          {data.permissions.canViewBilling ? (
            <>
              <Link href={navigateWithRange("/billing/payments", { status: "paid" })} className={subcardClass}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Revenue</p>
                <p className="mt-1 text-3xl font-bold leading-tight text-slate-950 dark:text-slate-100">
                  {formatCurrency(data.overview.revenue, data.overview.currency)}
                </p>
                <div className="mt-1">
                  <MiniTrend values={data.overview.revenueTrend} />
                </div>
                {data.overview.revenueNote ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{data.overview.revenueNote}</p>
                ) : null}
              </Link>
              <Link href={navigateWithRange("/billing/payments")} className={subcardClass}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Payments</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{data.overview.paymentsCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Success rate {data.overview.paymentSuccessRate}%</p>
              </Link>
              <Link href="/dashboard/invoices" className={subcardClass}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoices Sent</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{data.overview.invoicesSent}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Overdue {data.overview.invoicesOverdue}</p>
              </Link>
            </>
          ) : null}
          <Link href="/dashboard/inbox/analytics" className={subcardClass}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Messages</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{data.overview.messagesSent}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Delivery rate {data.overview.messageDeliveryRate}%</p>
          </Link>
          <Link href={navigateWithRange("/dashboard/automation-operations")} className={subcardClass}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Automations</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{data.overview.automationRuns}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Failed {data.overview.failedAutomations}</p>
          </Link>
          {typeof data.overview.aiRequests === "number" ? (
            <Link href="/dashboard/assistant" className={subcardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">AI</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{data.overview.aiRequests}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Requests in range</p>
            </Link>
          ) : null}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Risk &amp; Attention</h2>
        {data.permissions.canViewBilling && data.risk.paymentConnectionIssue ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Payment subaccount not connected.
            <Link href="/dashboard/settings?tab=payout" className="ml-2 font-semibold text-blue-700 hover:underline dark:text-blue-300">
              Complete payout setup
            </Link>
          </div>
        ) : null}
        {riskRows.length === 0 && !(data.permissions.canViewBilling && data.risk.paymentConnectionIssue) ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">All systems operating normally.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {riskRows.map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
              >
                <div className="flex items-center justify-between">
                  <span>{row.label}</span>
                  <span className="font-semibold">{row.value}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={clsx("grid gap-3", data.permissions.canViewBilling ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {data.permissions.canViewBilling ? (
          <article className={articleClass}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Billing</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p>Revenue: {formatCurrency(data.modules.billing.revenue, data.overview.currency)}</p>
              <p>Payments: {data.modules.billing.paymentsCount}</p>
              <p>Overdue invoices: {data.modules.billing.overdueInvoices}</p>
            </div>
            <Link href={navigateWithRange("/billing/payments")} className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
              Open payments ledger
            </Link>
          </article>
        ) : null}
        <article className={articleClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Automation</h3>
          <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <p>Runs: {data.modules.automation.runs}</p>
            <p>Failed: {data.modules.automation.failed}</p>
            <p>Active workflows: {data.modules.automation.active}</p>
          </div>
          <Link href={navigateWithRange("/dashboard/automations")} className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
            View automations
          </Link>
        </article>
        <article className={articleClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Messaging</h3>
          <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <p>Sent: {data.modules.messaging.sent}</p>
            <p>Delivered: {data.modules.messaging.delivered}</p>
            <p>Failed: {data.modules.messaging.failed}</p>
          </div>
          <Link href="/dashboard/inbox/analytics" className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
            View messaging
          </Link>
        </article>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent Activity Timeline</h2>
        {timelineRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No recent system activity.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {timelineRows.map((item) => {
              const Icon =
                item.status === "failed"
                  ? XCircle
                  : item.status === "warning"
                    ? AlertTriangle
                    : item.status === "success"
                      ? CheckCircle2
                      : Clock3;
              return (
                <article key={item.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span
                        className={clsx(
                          "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                          item.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : item.status === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.customer ? `${item.customer} • ` : ""}
                          {item.invoice ? `${item.invoice} • ` : ""}
                          {compactTime(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {canLoadMoreTimeline ? (
          <button
            type="button"
            onClick={() =>
              setVisibleTimeline((current) => Math.min(current + MAX_TIMELINE_ITEMS, data.timeline.length))
            }
            className="mt-3 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Load More
          </button>
        ) : null}
      </section>
    </div>
  );
}

