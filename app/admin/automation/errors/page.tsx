"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { Copy, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { formatDateTimeDMY } from "@/lib/date";

type RecoveryStatus = "FAILED" | "RETRYING" | "RESOLVED";
type RangeMode = "1h" | "24h" | "7d" | "custom";
type SortMode = "created_desc" | "created_asc";
type AutoRefreshMode = "off" | "30" | "60";

type ListItem = {
  id: string;
  runId?: string;
  flow: { id: string; name: string; businessId: string | null; tenantName: string | null };
  subscriber: { id: string; name: string; email: string; publicId: string | null };
  status: RecoveryStatus;
  errorSummary: string;
  createdAt: string;
  retryCount: number;
  lastRetryAt: string | null;
  latestAttemptAt: string | null;
  latestAttemptRunId: string | null;
};

type ListResponse = {
  summary: {
    failedRuns24h: number;
    impactedFlows24h: number;
    impactedSubscribers24h: number;
    latestFailureAt: string | null;
    counters?: {
      automation_failures_total: number;
      automation_retries_total: number;
      automation_replays_total: number;
      automation_recovered_total: number;
    };
  };
  topImpactedFlows: Array<{ flowId: string; flowName: string; failureCount: number }>;
  items: ListItem[];
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: number;
  total: number;
};

type DetailResponse = {
  id: string;
  status: RecoveryStatus;
  retryCount: number;
  lastRetryAt: string | null;
  runId: string;
  flow: { id: string; name: string };
  subscriber: { id: string; email: string };
  tenant: { id: string | null; name: string | null };
  trigger: string;
  created: string;
  failedStep: {
    stepId: string | null;
    stepIndex: number | null;
    stepType: string | null;
    transient: boolean;
  } | null;
  errorMessage: string;
  stackTrace: string | null;
  sanitizedInputPayload: Record<string, unknown>;
  flowConfigurationSnapshot: Record<string, unknown>;
  inputPayload: Record<string, unknown>;
  flowSnapshot: Record<string, unknown>;
  resumeState: Record<string, unknown>;
  relatedLinks: {
    tenant: string | null;
    subscriber: string | null;
    flow: string | null;
  };
  stepsTimeline: Array<{
    id: string;
    stepKey: string;
    stepType: string;
    status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED";
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    errorCode: string | null;
    safeOutput: Record<string, unknown> | null;
  }>;
  recoveryAttempts: Array<{
    id: string;
    actorAdminId: string;
    actorAdminName: string | null;
    actorIp: string | null;
    createdAt: string;
    resultStatus: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED";
    newRunId: string | null;
    blockReason: string | null;
    reason: string | null;
  }>;
  runMetadata: {
    runId: string;
    flowName: string;
    flowId: string;
    subscriberId: string;
    subscriberEmail: string;
    tenantId: string | null;
    tenantName: string | null;
    triggerType: string;
    createdAt: string;
    latestAttemptAt: string | null;
    latestAttemptRunId: string | null;
  };
  error: {
    message: string;
    stackTrace: string | null;
  };
  executionContext: {
    inputPayload: Record<string, unknown>;
    flowSnapshot: Record<string, unknown>;
    resumeState: Record<string, unknown>;
  };
  replayHistory: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
    createdAt: string;
    completedAt: string | null;
  }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const statusOptions: Array<{ value: "ALL" | RecoveryStatus; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "FAILED", label: "FAILED" },
  { value: "RETRYING", label: "RETRYING" },
  { value: "RESOLVED", label: "RESOLVED" },
];

function formatRelative(input: string) {
  const deltaMs = Date.now() - new Date(input).getTime();
  if (deltaMs < 60_000) return "just now";
  if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)}m ago`;
  if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3_600_000)}h ago`;
  return `${Math.floor(deltaMs / 86_400_000)}d ago`;
}

function statusBadgeClass(status: RecoveryStatus) {
  if (status === "FAILED") return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  if (status === "RETRYING") return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
}

function stepStatusClass(status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED") {
  if (status === "FAILED") return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  if (status === "SUCCESS") return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  if (status === "STARTED") return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
  return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30";
}

function attemptStatusClass(status: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED") {
  if (status === "FAILED" || status === "BLOCKED") {
    return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  }
  if (status === "SUCCEEDED") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
}

function toDateInput(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function JsonCard({ title, value }: { title: string; value: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const formatted = useMemo(() => JSON.stringify(value || {}, null, 2), [value]);

  const copy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-background p-2 text-xs text-foreground">
        {formatted}
      </pre>
    </div>
  );
}

export default function AutomationErrorsPage() {
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [flowId, setFlowId] = useState("");
  const [subscriber, setSubscriber] = useState("");
  const [tenant, setTenant] = useState("");
  const [status, setStatus] = useState<"ALL" | RecoveryStatus>("ALL");
  const [range, setRange] = useState<RangeMode>("24h");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [sort, setSort] = useState<SortMode>("created_desc");
  const [autoRefresh, setAutoRefresh] = useState<AutoRefreshMode>("off");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [page, setPage] = useState(1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [replayBusyId, setReplayBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [replayModalRunId, setReplayModalRunId] = useState<string | null>(null);
  const [replayReason, setReplayReason] = useState("");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      setCursors([""]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const autoRefreshMs = autoRefresh === "off" ? 0 : Number(autoRefresh) * 1000;
  const cursor = page > 1 ? cursors[page - 1] || "" : "";

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pageSize", "20");
    params.set("sort", sort);
    params.set("range", range);
    if (search) params.set("q", search);
    if (flowId) params.set("flowId", flowId);
    if (subscriber) params.set("subscriber", subscriber);
    if (tenant) params.set("tenant", tenant);
    if (status !== "ALL") params.set("status", status);
    if (range === "custom" && from) params.set("from", from.toISOString());
    if (range === "custom" && to) params.set("to", to.toISOString());
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [cursor, flowId, from, range, search, sort, status, subscriber, tenant, to]);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    `/api/admin/automation/errors?${queryString}`,
    fetcher,
    { refreshInterval: autoRefreshMs, revalidateOnFocus: true }
  );

  const { data: detail, isLoading: detailLoading, mutate: mutateDetail } = useSWR<DetailResponse>(
    selectedRunId ? `/api/admin/automation/errors/${selectedRunId}` : null,
    fetcher
  );

  useEffect(() => {
    if (!data?.items?.length) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && data.items.some((item) => item.id === selectedRunId)) return;
    setSelectedRunId(data.items[0].id);
  }, [data?.items, selectedRunId]);

  const refreshPage = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await mutate();
      await mutateDetail();
    } finally {
      setRefreshing(false);
    }
  }, [mutate, mutateDetail, refreshing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      );
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "r" || event.key === "R") && !isTyping) {
        event.preventDefault();
        void refreshPage();
      }
      if (event.key === "Escape") {
        setSelectedRunId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshPage]);

  const applyRange = (nextRange: RangeMode) => {
    setRange(nextRange);
    setPage(1);
    setCursors([""]);
    if (nextRange !== "custom") {
      setFrom(null);
      setTo(null);
    }
  };

  const activeFilters = useMemo(
    () =>
      [
        search ? { id: "q", label: `Search: ${search}`, clear: () => { setSearch(""); setSearchInput(""); setPage(1); setCursors([""]); } } : null,
        flowId ? { id: "flow", label: `Flow: ${flowId}`, clear: () => { setFlowId(""); setPage(1); setCursors([""]); } } : null,
        subscriber ? { id: "subscriber", label: `Subscriber: ${subscriber}`, clear: () => { setSubscriber(""); setPage(1); setCursors([""]); } } : null,
        tenant ? { id: "tenant", label: `Tenant: ${tenant}`, clear: () => { setTenant(""); setPage(1); setCursors([""]); } } : null,
        status !== "ALL" ? { id: "status", label: `Status: ${status}`, clear: () => { setStatus("ALL"); setPage(1); setCursors([""]); } } : null,
        range !== "24h" ? { id: "range", label: `Range: ${range}`, clear: () => applyRange("24h") } : null,
      ].filter(Boolean) as Array<{ id: string; label: string; clear: () => void }>,
    [flowId, range, search, status, subscriber, tenant]
  );

  const copyText = useCallback(async (label: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      setTimeout(() => setCopiedValue((prev) => (prev === label ? null : prev)), 1500);
    } catch {
      setToast("Copy failed");
      setTimeout(() => setToast(""), 2200);
    }
  }, []);

  const runReplay = async (runId: string, reason?: string) => {
    if (replayBusyId) return;
    setReplayBusyId(runId);
    try {
      const res = await fetch(`/api/admin/automation/errors/${runId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { error?: string }).error || "Replay failed"));
      }
      const replayRunId = String((payload as { newRunId?: string; replayRunId?: string }).newRunId || (payload as { replayRunId?: string }).replayRunId || "").trim();
      setToast(replayRunId ? `Replay started (${replayRunId})` : "Replay started");
      await Promise.all([mutate(), mutateDetail()]);
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Replay failed");
      setTimeout(() => setToast(""), 3200);
    } finally {
      setReplayBusyId(null);
    }
  };

  const onReplay = async () => {
    if (!replayModalRunId) return;
    const targetRunId = replayModalRunId;
    await runReplay(targetRunId, replayReason);
    setReplayModalRunId(null);
    setReplayReason("");
  };

  const summary = data?.summary;
  const rows = data?.items || [];
  const replayModalRun = rows.find((row) => row.id === replayModalRunId) || (detail && replayModalRunId === detail.id
    ? {
        id: detail.id,
        flow: { id: detail.flow.id, name: detail.flow.name, businessId: detail.tenant.id, tenantName: detail.tenant.name },
        subscriber: {
          id: detail.subscriber.id,
          name: detail.subscriber.email,
          email: detail.subscriber.email,
          publicId: null,
        },
        status: detail.status,
        errorSummary: detail.error.message,
        createdAt: detail.created,
        retryCount: detail.retryCount,
        lastRetryAt: detail.lastRetryAt,
        latestAttemptAt: detail.runMetadata.latestAttemptAt,
        latestAttemptRunId: detail.runMetadata.latestAttemptRunId,
      }
    : null);
  const hasFailures = (summary?.failedRuns24h || 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 px-6 py-5">
      <header className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Automation Errors</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recover failed automation runs and maintain system reliability.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={refreshPage} disabled={refreshing}>
              <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <select
              value={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.value as AutoRefreshMode)}
              className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
            >
              <option value="off">Auto refresh: Off</option>
              <option value="30">Auto refresh: 30s</option>
              <option value="60">Auto refresh: 60s</option>
            </select>
          </div>
        </div>
      </header>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">Unable to load automation failures.</Alert>
          <Button variant="secondary" onClick={refreshPage}>Retry</Button>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
        ) : (
          <>
            <div className={clsx("rounded-xl border bg-card px-4 py-3", hasFailures ? "border-amber-300 dark:border-amber-500/40" : "border-border/70")}>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Failed Runs</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.failedRuns24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Impacted Flows</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.impactedFlows24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Impacted Subscribers</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.impactedSubscribers24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Latest Failure</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {summary?.latestFailureAt ? formatDateTimeDMY(new Date(summary.latestFailureAt)) : "N/A"}
              </p>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Most impacted flows</p>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : data?.topImpactedFlows?.length ? (
          <div className="space-y-2">
            {data.topImpactedFlows.map((flow) => (
              <button
                key={flow.flowId}
                type="button"
                onClick={() => {
                  setFlowId(flow.flowId);
                  setPage(1);
                  setCursors([""]);
                }}
                className={clsx(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition hover:bg-muted/30",
                  flowId === flow.flowId ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10" : "border-border/70"
                )}
              >
                <span className="text-sm font-medium text-foreground">{flow.flowName}</span>
                <span className="text-xs text-muted-foreground">{flow.failureCount} failures</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No automation failures detected. System is operating normally.</p>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_170px_170px_170px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search flow, subscriber email, run id"
              className="h-11 w-full rounded-md border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground"
            />
          </div>
          <Input
            value={flowId}
            onChange={(event) => {
              setFlowId(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder="Flow ID"
          />
          <Input
            value={subscriber}
            onChange={(event) => {
              setSubscriber(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder="Subscriber"
          />
          <Input
            value={tenant}
            onChange={(event) => {
              setTenant(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder="Tenant"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "ALL" | RecoveryStatus);
              setPage(1);
              setCursors([""]);
            }}
            className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 grid gap-2 lg:grid-cols-[170px_170px_1fr]">
          <select
            value={range}
            onChange={(event) => applyRange(event.target.value as RangeMode)}
            className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom range</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode);
              setPage(1);
              setCursors([""]);
            }}
            className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
          </select>
          {range === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="datetime-local"
                value={toDateInput(from)}
                onChange={(event) => {
                  setFrom(parseDateInput(event.target.value));
                  setPage(1);
                  setCursors([""]);
                }}
                className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
              />
              <input
                type="datetime-local"
                value={toDateInput(to)}
                onChange={(event) => {
                  setTo(parseDateInput(event.target.value));
                  setPage(1);
                  setCursors([""]);
                }}
                className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
              />
            </div>
          ) : (
            <div />
          )}
        </div>

        {activeFilters.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={filter.clear}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/25 px-3 py-1 text-xs text-foreground transition hover:bg-muted/45"
              >
                {filter.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setFlowId("");
                setSubscriber("");
                setTenant("");
                setStatus("ALL");
                applyRange("24h");
                setSort("created_desc");
                setPage(1);
                setCursors([""]);
              }}
            >
              Reset all
            </Button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="grid grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_120px_minmax(180px,1.3fr)_170px_110px_130px] gap-2 border-b border-border/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>Flow</span>
            <span>Subscriber</span>
            <span>Status</span>
            <span>Error summary</span>
            <span>Created</span>
            <span>Retry count</span>
            <span>Actions</span>
          </div>
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-11 rounded-md" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
                <p className="text-base font-semibold text-foreground">No automation failures detected.</p>
                <p className="text-sm text-muted-foreground">System is operating normally.</p>
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRunId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedRunId(row.id);
                    }
                  }}
                  className={clsx(
                    "grid w-full cursor-pointer grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_120px_minmax(180px,1.3fr)_170px_110px_130px] gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-1",
                    selectedRunId === row.id && "bg-indigo-50/70 dark:bg-indigo-500/10"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{row.flow.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.flow.id}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{row.subscriber.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.subscriber.publicId || row.subscriber.id}
                    </span>
                  </span>
                  <span className={clsx("inline-flex h-fit w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusBadgeClass(row.status))}>
                    {row.status}
                  </span>
                  <span className="truncate text-sm text-foreground">{row.errorSummary}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="block">{formatRelative(row.createdAt)}</span>
                    <span className="block">{formatDateTimeDMY(new Date(row.createdAt))}</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground">{row.retryCount}</span>
                  <span>
                    <Button
                      size="sm"
                      variant={row.status === "FAILED" ? "danger" : "secondary"}
                      disabled={row.status !== "FAILED" || replayBusyId === row.id}
                      loading={replayBusyId === row.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setReplayModalRunId(row.id);
                        setReplayReason("");
                      }}
                    >
                      Replay
                    </Button>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
            <span>Total failed roots: {data?.total ?? 0}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!data?.hasMore}
                onClick={() => {
                  if (!data?.hasMore || !data.nextCursor) return;
                  setCursors((prev) => {
                    const next = [...prev];
                    next[page] = data.nextCursor!;
                    return next;
                  });
                  setPage((prev) => prev + 1);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-border/60 bg-card p-4">
          {!selectedRunId ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
              Select a failed run to view diagnostics.
            </div>
          ) : detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-7 w-2/3 rounded-md" />
              <Skeleton className="h-24 rounded-md" />
              <Skeleton className="h-24 rounded-md" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Run details</h2>
                <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusBadgeClass(detail.status))}>
                  {detail.status}
                </span>
              </div>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Run metadata</p>
                <dl className="space-y-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-muted-foreground">Run ID</dt>
                    <dd className="flex items-center gap-1">
                      <span className="font-mono text-foreground">{detail.runMetadata.runId}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText("run-id", detail.runMetadata.runId)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedValue === "run-id" ? "Copied" : "Copy"}
                      </Button>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Flow</dt><dd className="text-right text-foreground">{detail.runMetadata.flowName}<br /><span className="font-mono text-[11px] text-muted-foreground">{detail.runMetadata.flowId}</span></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Subscriber</dt><dd className="text-right text-foreground">{detail.runMetadata.subscriberEmail}<br /><span className="font-mono text-[11px] text-muted-foreground">{detail.runMetadata.subscriberId}</span></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Tenant</dt><dd className="text-right text-foreground">{detail.runMetadata.tenantName || detail.runMetadata.tenantId || "N/A"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Trigger</dt><dd className="text-foreground">{detail.runMetadata.triggerType}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Created</dt><dd className="text-foreground">{formatDateTimeDMY(new Date(detail.runMetadata.createdAt))}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Retry count</dt><dd className="text-foreground">{detail.retryCount}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last retry</dt><dd className="text-foreground">{detail.lastRetryAt ? formatDateTimeDMY(new Date(detail.lastRetryAt)) : "Never"}</dd></div>
                  {detail.relatedLinks.tenant || detail.relatedLinks.subscriber || detail.relatedLinks.flow ? (
                    <div className="pt-1">
                      <dt className="mb-1 text-muted-foreground">Links</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        {detail.relatedLinks.tenant ? (
                          <a href={detail.relatedLinks.tenant} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            Tenant <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {detail.relatedLinks.subscriber ? (
                          <a href={detail.relatedLinks.subscriber} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            Subscriber <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {detail.relatedLinks.flow ? (
                          <a href={detail.relatedLinks.flow} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            Flow <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Error information</p>
                <p className="text-sm font-semibold text-foreground">{detail.errorMessage || detail.error.message}</p>
                {detail.failedStep ? (
                  <p className="text-xs text-muted-foreground">
                    Failed step: <span className="font-medium text-foreground">{detail.failedStep.stepId || detail.failedStep.stepType || "unknown"}</span>
                    {detail.failedStep.stepIndex !== null ? ` (#${detail.failedStep.stepIndex})` : ""}
                  </p>
                ) : null}
                {/business profile required|missing recipient email|missing invoice id/i.test(detail.errorMessage || "") ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Likely fix: subscriber profile/data is incomplete. Resolve data then replay.
                  </p>
                ) : null}
                <details className="rounded-md border border-border/70 bg-background/80 p-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Stack trace</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                    {detail.stackTrace || detail.error.stackTrace || "No stack trace captured."}
                  </pre>
                </details>
              </section>

              <section className="space-y-2">
                <JsonCard title="Input payload (sanitized)" value={detail.inputPayload || detail.executionContext.inputPayload} />
                <JsonCard title="Flow configuration snapshot (sanitized)" value={detail.flowSnapshot || detail.executionContext.flowSnapshot} />
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Execution timeline</p>
                {detail.stepsTimeline.length ? (
                  <div className="max-h-48 space-y-2 overflow-auto pr-1">
                    {detail.stepsTimeline.map((step) => (
                      <details key={step.id} className="rounded-md border border-border/60 bg-background/80 p-2">
                        <summary className="flex cursor-pointer items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {step.stepKey}
                            {step.stepType ? <span className="ml-1 text-muted-foreground">({step.stepType})</span> : null}
                          </span>
                          <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", stepStatusClass(step.status))}>
                            {step.status}
                          </span>
                        </summary>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>Started: {step.startedAt ? formatDateTimeDMY(new Date(step.startedAt)) : "N/A"}</p>
                          <p>Finished: {step.finishedAt ? formatDateTimeDMY(new Date(step.finishedAt)) : "N/A"}</p>
                          <p>Duration: {typeof step.durationMs === "number" ? `${step.durationMs}ms` : "N/A"}</p>
                          {step.errorMessage ? <p className="text-rose-700 dark:text-rose-300">Error: {step.errorMessage}</p> : null}
                          {step.safeOutput ? (
                            <pre className="max-h-28 overflow-auto rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-foreground">
                              {JSON.stringify(step.safeOutput, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No step execution timeline captured for this run.</p>
                )}
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recovery attempts</p>
                  <Button
                    size="sm"
                    variant={detail.status === "FAILED" ? "danger" : "secondary"}
                    disabled={detail.status !== "FAILED" || replayBusyId === detail.id}
                    loading={replayBusyId === detail.id}
                    onClick={() => {
                      setReplayModalRunId(detail.id);
                      setReplayReason("");
                    }}
                  >
                    Replay
                  </Button>
                </div>
                {detail.status !== "FAILED" ? (
                  <p className="text-xs text-muted-foreground">Replay is only available while this run is in FAILED state.</p>
                ) : null}
                {detail.recoveryAttempts.length ? (
                  <div className="max-h-36 space-y-1 overflow-auto">
                    {detail.recoveryAttempts.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-foreground">{entry.id}</span>
                          <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", attemptStatusClass(entry.resultStatus))}>
                            {entry.resultStatus}
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          <p>{formatDateTimeDMY(new Date(entry.createdAt))}</p>
                          <p>Actor: {entry.actorAdminName || entry.actorAdminId}</p>
                          {entry.newRunId ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-foreground">{entry.newRunId}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void copyText(`new-run-${entry.id}`, entry.newRunId)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copiedValue === `new-run-${entry.id}` ? "Copied" : "Copy"}
                              </Button>
                            </div>
                          ) : null}
                          {entry.blockReason ? <p className="text-rose-700 dark:text-rose-300">Blocked: {entry.blockReason}</p> : null}
                          {entry.reason ? <p>Reason: {entry.reason}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No replay attempts yet.</p>
                )}
              </section>

              <p className="text-[11px] text-muted-foreground">Sensitive fields are redacted.</p>
            </div>
          )}
        </aside>
      </section>

      <Modal
        open={Boolean(replayModalRunId)}
        onClose={() => {
          if (replayBusyId) return;
          setReplayModalRunId(null);
          setReplayReason("");
        }}
        title="Replay automation run?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This creates a new run linked to the original execution. Replay may fail again if the root cause is unresolved.
          </p>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {replayModalRun?.flow.name || "Selected run"}
            </p>
            <p className="mt-1">Run ID: <span className="font-mono text-foreground">{replayModalRun?.id || replayModalRunId}</span></p>
            <p className="mt-1">Subscriber: <span className="text-foreground">{replayModalRun?.subscriber.email || "N/A"}</span></p>
          </div>
          <Textarea
            label="Reason (optional, for audit log)"
            maxLength={280}
            value={replayReason}
            onChange={(event) => setReplayReason(event.target.value)}
            placeholder="Describe why this replay is needed"
            className="min-h-[110px]"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setReplayModalRunId(null);
                setReplayReason("");
              }}
              disabled={Boolean(replayBusyId)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void onReplay()}
              loading={Boolean(replayBusyId && replayBusyId === replayModalRunId)}
            >
              Replay
            </Button>
          </div>
        </div>
      </Modal>

      <Toast message={toast} show={Boolean(toast)} />
    </div>
  );
}
