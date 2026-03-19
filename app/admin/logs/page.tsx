"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type LogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";
type LogActor = "user" | "admin" | "system";
type LogTab = "all" | "errors" | "security" | "webhooks" | "billing" | "infrastructure";
type Density = "comfortable" | "compact";
type TimezoneMode = "local" | "utc";
type LiveMode = "off" | "15" | "30" | "60";
type TimeRangePreset = "all" | "24h" | "7d" | "30d" | "custom";

type LogItem = {
  id: string;
  source: "activity" | "audit" | "webhook";
  timestamp: string;
  severity: LogSeverity;
  service: string;
  message: string;
  actor: LogActor;
  actorId: string | null;
  actorName: string | null;
  tenantId: string | null;
  scope: "tenant" | "global";
  requestId: string | null;
  correlationId: string | null;
  eventId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

type LogsResponse = {
  items: LogItem[];
  total: number | null;
  page: number;
  pageSize: number;
  showingFrom: number;
  showingTo: number;
  hasMore: boolean;
  nextCursor: string | null;
  highVolumeDetected: boolean;
  highVolumeCount: number;
  retentionDays: number;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const tabs: Array<{ id: LogTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "security", label: "Security" },
  { id: "webhooks", label: "Webhooks" },
  { id: "billing", label: "Billing" },
  { id: "infrastructure", label: "Infrastructure" },
];

const severityOptions: LogSeverity[] = ["INFO", "WARN", "ERROR", "CRITICAL"];
const serviceOptions = ["AUTOMATION", "BILLING", "WEBHOOKS", "SECURITY", "SUPPORT", "INFRASTRUCTURE", "CORE"];
const columnLabels: Record<"timestamp" | "severity" | "service" | "message" | "actor" | "tenant" | "scope" | "correlationId", string> = {
  timestamp: "Timestamp",
  severity: "Severity",
  service: "Service",
  message: "Message",
  actor: "Actor",
  tenant: "Tenant",
  scope: "Scope",
  correlationId: "Correlation ID",
};

function relTime(input: string) {
  const ts = new Date(input).getTime();
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatTimestamp(iso: string, mode: TimezoneMode) {
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: mode === "utc" ? "UTC" : undefined,
  });
}

function truncateToken(value: string, size = 16) {
  if (value.length <= size) return value;
  return `${value.slice(0, size)}...`;
}

function severityClass(severity: LogSeverity) {
  if (severity === "CRITICAL") return "bg-rose-100 text-rose-700 ring-rose-300";
  if (severity === "ERROR") return "bg-red-100 text-red-700 ring-red-300";
  if (severity === "WARN") return "bg-amber-100 text-amber-700 ring-amber-300";
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function parseDateTimeLocal(value: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalInputValue(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseList(input: string | null) {
  return String(input || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function MetadataPanel({ row }: { row: LogItem }) {
  const [expandedJson, setExpandedJson] = useState(false);
  const json = JSON.stringify(row.metadata || {}, null, 2);
  const isLarge = json.length > 700;
  const display = expandedJson || !isLarge ? json : `${json.slice(0, 700)}\n...`;

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
        <p>requestId: <span className="font-mono text-foreground">{row.requestId || "-"}</span></p>
        <p>correlationId: <span className="font-mono text-foreground">{row.correlationId || "-"}</span></p>
        <p>eventId: <span className="font-mono text-foreground">{row.eventId || "-"}</span></p>
        <p>IP: <span className="font-mono text-foreground">{row.ip || "-"}</span></p>
        <p className="md:col-span-2">User agent: <span className="font-mono text-foreground">{row.userAgent || "-"}</span></p>
      </div>
      <div className="space-y-2">
        <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">{display}</pre>
        <div className="flex items-center gap-2">
          {isLarge ? (
            <Button size="sm" variant="ghost" onClick={() => setExpandedJson((prev) => !prev)}>
              {expandedJson ? "Collapse JSON" : "Expand full JSON"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(json);
            }}
          >
            Copy JSON
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const initRef = useRef(false);
  const refreshingRef = useRef(false);

  const [tab, setTab] = useState<LogTab>("all");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<string[]>([""]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [severities, setSeverities] = useState<LogSeverity[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [actor, setActor] = useState<"all" | LogActor>("all");
  const [tenant, setTenant] = useState("");
  const [requestId, setRequestId] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [eventId, setEventId] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("all");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState<TimezoneMode>("local");
  const [liveMode, setLiveMode] = useState<LiveMode>("15");
  const [density, setDensity] = useState<Density>("comfortable");
  const [showActor, setShowActor] = useState(true);
  const [showTenant, setShowTenant] = useState(true);
  const [showScope, setShowScope] = useState(true);
  const [showCorrelation, setShowCorrelation] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const initialTab = (searchParams.get("tab") as LogTab) || "all";
    const initialPage = Number(searchParams.get("page") || "1");
    setTab(["all", "errors", "security", "webhooks", "billing", "infrastructure"].includes(initialTab) ? initialTab : "all");
    setPage(Number.isFinite(initialPage) && initialPage > 0 ? Math.floor(initialPage) : 1);
    const initialQ = searchParams.get("q") || "";
    setQInput(initialQ);
    setQ(initialQ);
    setSeverities(
      parseList(searchParams.get("severity"))
        .filter((value): value is LogSeverity => severityOptions.includes(value as LogSeverity))
        .slice(0, 1)
    );
    setServices(parseList(searchParams.get("service")).slice(0, 1));
    const initialActor = (searchParams.get("actor") || "all").toLowerCase();
    setActor(initialActor === "user" || initialActor === "admin" || initialActor === "system" ? initialActor : "all");
    setTenant(searchParams.get("tenant") || "");
    setRequestId(searchParams.get("requestId") || "");
    setCorrelationId(searchParams.get("correlationId") || "");
    setEventId(searchParams.get("eventId") || "");
    const initialRange = (searchParams.get("range") || "all").toLowerCase();
    const parsedFrom = parseDateTimeLocal(searchParams.get("from"));
    const parsedTo = parseDateTimeLocal(searchParams.get("to"));
    if (initialRange === "24h" || initialRange === "7d" || initialRange === "30d" || initialRange === "custom") {
      setTimeRange(initialRange);
    } else {
      setTimeRange(parsedFrom || parsedTo ? "custom" : "all");
    }
    setFrom(parsedFrom);
    setTo(parsedTo);
    const initialTimezone = (searchParams.get("tz") || "local").toLowerCase();
    setTimezone(initialTimezone === "utc" ? "utc" : "local");
    const initialDensity = (searchParams.get("density") || "comfortable").toLowerCase();
    setDensity(initialDensity === "compact" ? "compact" : "comfortable");
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
      setPageCursors([""]);
      setKnownTotal(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (!initRef.current) return;
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", String(page));
    if (q) params.set("q", q);
    if (severities.length) params.set("severity", severities.join(","));
    if (services.length) params.set("service", services.join(","));
    if (actor !== "all") params.set("actor", actor);
    if (tenant) params.set("tenant", tenant);
    if (requestId) params.set("requestId", requestId);
    if (correlationId) params.set("correlationId", correlationId);
    if (eventId) params.set("eventId", eventId);
    if (timeRange !== "all") params.set("range", timeRange);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    params.set("tz", timezone);
    params.set("density", density);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    actor,
    correlationId,
    density,
    eventId,
    from,
    page,
    pathname,
    q,
    requestId,
    router,
    services,
    severities,
    tab,
    tenant,
    timeRange,
    timezone,
    to,
  ]);

  const hasActiveFilters = Boolean(
    q ||
      severities.length ||
      services.length ||
      actor !== "all" ||
      tenant ||
      requestId ||
      correlationId ||
      eventId ||
      timeRange !== "all" ||
      from ||
      to ||
      tab !== "all"
  );

  const liveSeconds = liveMode === "off" ? 0 : Number(liveMode);
  const autoRefreshAllowed = liveSeconds > 0 && page === 1 && !hasActiveFilters;
  const refreshInterval = autoRefreshAllowed ? liveSeconds * 1000 : 0;
  const currentCursor = page > 1 ? pageCursors[page - 1] || "" : "";

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "50");
    if (currentCursor) params.set("cursor", currentCursor);
    params.set("includeTotal", page === 1 ? "true" : "false");
    params.set("tab", tab);
    if (q) params.set("q", q);
    if (severities.length) params.set("severity", severities.join(","));
    if (services.length) params.set("service", services.join(","));
    if (actor !== "all") params.set("actor", actor);
    if (tenant) params.set("tenant", tenant);
    if (requestId) params.set("requestId", requestId);
    if (correlationId) params.set("correlationId", correlationId);
    if (eventId) params.set("eventId", eventId);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    return params.toString();
  }, [actor, correlationId, currentCursor, eventId, from, page, q, requestId, services, severities, tab, tenant, to]);

  const { data, error, isLoading, mutate } = useSWR<LogsResponse>(`/api/admin/logs?${apiQuery}`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (typeof data?.total === "number") {
      setKnownTotal(data.total);
    }
  }, [data?.total]);

  const refreshLogs = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setManualRefreshing(true);
    try {
      await mutate();
    } finally {
      refreshingRef.current = false;
      setManualRefreshing(false);
    }
  }, [mutate]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingElement = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (event.key === "/" && !isTypingElement) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "r" || event.key === "R") && !isTypingElement) {
        event.preventDefault();
        void refreshLogs();
      }
      if (event.key === "Escape") {
        setExpandedRow(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshLogs]);

  const total = data?.total ?? knownTotal;
  const pageCount = typeof total === "number" ? Math.max(1, Math.ceil(total / 50)) : null;
  const rows = data?.items || [];
  const canExport = (typeof total === "number" ? total : rows.length) > 0;
  const rowPadding = density === "compact" ? "py-2" : "py-3.5";

  const resetCursorPagination = useCallback(() => {
    setPage(1);
    setPageCursors([""]);
    setKnownTotal(null);
  }, []);

  const applyTimeRange = (nextRange: TimeRangePreset) => {
    resetCursorPagination();
    setTimeRange(nextRange);
    if (nextRange === "custom") return;
    if (nextRange === "all") {
      setFrom(null);
      setTo(null);
      return;
    }
    const now = new Date();
    const minutes = nextRange === "24h" ? 24 * 60 : nextRange === "7d" ? 7 * 24 * 60 : 30 * 24 * 60;
    setFrom(new Date(now.getTime() - minutes * 60_000));
    setTo(now);
  };

  const resetFilters = () => {
    setTab("all");
    resetCursorPagination();
    setQInput("");
    setQ("");
    setSeverities([]);
    setServices([]);
    setActor("all");
    setTenant("");
    setRequestId("");
    setCorrelationId("");
    setEventId("");
    setTimeRange("all");
    setFrom(null);
    setTo(null);
  };

  const exportData = async (format: "csv" | "json") => {
    if (!canExport || exporting) return;
    setExporting(format);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set("format", format);
      const res = await fetch(`/api/admin/logs/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `system-logs.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const columns = useMemo(() => {
    const base = ["timestamp", "severity", "service", "message"] as const;
    const optional = [
      showActor ? "actor" : null,
      showTenant ? "tenant" : null,
      showScope ? "scope" : null,
      showCorrelation ? "correlationId" : null,
    ].filter(Boolean) as Array<"actor" | "tenant" | "scope" | "correlationId">;
    return [...base, ...optional];
  }, [showActor, showCorrelation, showScope, showTenant]);

  const activeFilters = useMemo(
    () =>
      [
        q ? { id: "q", label: `Query: ${q}`, clear: () => { setQInput(""); setQ(""); resetCursorPagination(); } } : null,
        tab !== "all" ? { id: "tab", label: `Tab: ${tabs.find((entry) => entry.id === tab)?.label || tab}`, clear: () => { setTab("all"); resetCursorPagination(); } } : null,
        severities[0] ? { id: "severity", label: `Severity: ${severities[0]}`, clear: () => { setSeverities([]); resetCursorPagination(); } } : null,
        services[0] ? { id: "service", label: `Service: ${services[0]}`, clear: () => { setServices([]); resetCursorPagination(); } } : null,
        actor !== "all" ? { id: "actor", label: `Actor: ${actor}`, clear: () => { setActor("all"); resetCursorPagination(); } } : null,
        tenant ? { id: "tenant", label: `Tenant: ${tenant}`, clear: () => { setTenant(""); resetCursorPagination(); } } : null,
        requestId ? { id: "request", label: `Request: ${requestId}`, clear: () => { setRequestId(""); resetCursorPagination(); } } : null,
        correlationId ? { id: "correlation", label: `Correlation: ${correlationId}`, clear: () => { setCorrelationId(""); resetCursorPagination(); } } : null,
        eventId ? { id: "event", label: `Event: ${eventId}`, clear: () => { setEventId(""); resetCursorPagination(); } } : null,
        timeRange !== "all" ? { id: "range", label: `Range: ${timeRange.toUpperCase()}`, clear: () => { setTimeRange("all"); setFrom(null); setTo(null); resetCursorPagination(); } } : null,
      ].filter(Boolean) as Array<{ id: string; label: string; clear: () => void }>,
    [actor, correlationId, eventId, q, requestId, resetCursorPagination, services, severities, tab, tenant, timeRange]
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-6 py-5">
      <header className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">System Logs</h1>
            <p className="text-sm text-muted-foreground">View system activity, security events, and operational history.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span title="Old logs are archived automatically." className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
              Retention: 30 days
            </span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value as TimezoneMode)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
              <option value="local">Local</option>
              <option value="utc">UTC</option>
            </select>
            <select value={liveMode} onChange={(e) => setLiveMode(e.target.value as LiveMode)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
              <option value="off">Live: Off</option>
              <option value="15">Live: 15s</option>
              <option value="30">Live: 30s</option>
              <option value="60">Live: 60s</option>
            </select>
            <span className={clsx("rounded-full px-2 py-1 text-xs font-medium", autoRefreshAllowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300")}>
              {autoRefreshAllowed ? `Live ${liveSeconds}s` : "Paused"}
            </span>
          </div>
        </div>
        {data?.highVolumeDetected ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            High log volume detected ({data.highVolumeCount} events in last 5 minutes).
          </p>
        ) : null}
      </header>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <input
            ref={searchRef}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search message, requestId, correlationId..."
            className="h-11 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground xl:flex-1"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[560px]">
            <select value={timeRange} onChange={(e) => applyTimeRange(e.target.value as TimeRangePreset)} className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm">
              <option value="all">All time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
            <select
              value={severities[0] || "all"}
              onChange={(e) => {
                resetCursorPagination();
                const next = e.target.value as LogSeverity | "all";
                setSeverities(next === "all" ? [] : [next]);
              }}
              className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">All severities</option>
              {severityOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <details className="relative">
              <summary className="flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-sm marker:content-['']">
                More filters
              </summary>
              <div className="absolute right-0 z-[90] mt-2 w-[min(92vw,640px)] rounded-md border border-border/70 bg-card p-4 shadow-lg">
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    value={services[0] || "all"}
                    onChange={(e) => {
                      const value = e.target.value;
                      resetCursorPagination();
                      setServices(value === "all" ? [] : [value]);
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
                  >
                    <option value="all">All services</option>
                    {serviceOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                  <select
                    value={actor}
                    onChange={(e) => {
                      setActor(e.target.value as "all" | LogActor);
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
                  >
                    <option value="all">All actors</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                    <option value="system">System</option>
                  </select>
                  <Input value={tenant} onChange={(e) => { setTenant(e.target.value); resetCursorPagination(); }} placeholder="Tenant" />
                  <Input value={requestId} onChange={(e) => { setRequestId(e.target.value); resetCursorPagination(); }} placeholder="Request ID" />
                  <Input value={correlationId} onChange={(e) => { setCorrelationId(e.target.value); resetCursorPagination(); }} placeholder="Correlation ID" />
                  <Input value={eventId} onChange={(e) => { setEventId(e.target.value); resetCursorPagination(); }} placeholder="Event ID" />
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(from)}
                    onChange={(e) => {
                      setFrom(parseDateTimeLocal(e.target.value));
                      setTimeRange("custom");
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(to)}
                    onChange={(e) => {
                      setTo(parseDateTimeLocal(e.target.value));
                      setTimeRange("custom");
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Shortcuts: `/` search, `R` refresh, `Esc` collapse</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
                    <Button variant="ghost" size="sm" onClick={refreshLogs} disabled={manualRefreshing}>
                      {manualRefreshing ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {activeFilters.length > 0 ? (
        <section className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Filters:</span>
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={filter.clear}
                className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-foreground transition hover:bg-muted/60"
              >
                {filter.label} x
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters}>Clear all</Button>
          </div>
        </section>
      ) : null}

      <section className="relative flex flex-wrap items-center gap-2 overflow-visible">
        <div className="flex flex-wrap gap-2">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id);
                resetCursorPagination();
              }}
              className={clsx(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                tab === entry.id
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200"
                  : "border-border/70 bg-background text-foreground hover:bg-muted/40"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={density} onChange={(e) => setDensity(e.target.value as Density)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
            <option value="comfortable">Density: Comfortable</option>
            <option value="compact">Density: Compact</option>
          </select>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-border/70 bg-background px-3 py-1.5 text-sm marker:content-['']">Columns</summary>
            <div className="absolute right-0 z-[70] mt-2 w-44 space-y-1 rounded-md border border-border/70 bg-card p-2 text-sm shadow-lg">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showActor} onChange={(e) => setShowActor(e.target.checked)} /> Actor</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showTenant} onChange={(e) => setShowTenant(e.target.checked)} /> Tenant</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showScope} onChange={(e) => setShowScope(e.target.checked)} /> Scope</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showCorrelation} onChange={(e) => setShowCorrelation(e.target.checked)} /> Correlation ID</label>
            </div>
          </details>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-border/70 bg-background px-3 py-1.5 text-sm marker:content-['']">Export</summary>
            <div className="absolute right-0 z-[70] mt-2 w-40 rounded-md border border-border/70 bg-card p-2 shadow-lg">
              <Button className="w-full justify-start" variant="ghost" size="sm" disabled={!canExport || exporting !== null} onClick={() => exportData("csv")}>
                {exporting === "csv" ? "Exporting..." : "Export CSV"}
              </Button>
              <Button className="w-full justify-start" variant="ghost" size="sm" disabled={!canExport || exporting !== null} onClick={() => exportData("json")}>
                {exporting === "json" ? "Exporting..." : "Export JSON"}
              </Button>
            </div>
          </details>
          <Button variant="ghost" size="sm" onClick={refreshLogs} disabled={manualRefreshing}>
            {manualRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">Failed to load logs. Retry.</Alert>
          <Button variant="secondary" onClick={refreshLogs} disabled={manualRefreshing}>
            {manualRefreshing ? "Retrying..." : "Retry"}
          </Button>
        </div>
      ) : null}

      <section className="rounded-xl border border-border/60 bg-card">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-semibold">{columnLabels[column]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-b border-border/40">
                    <td colSpan={columns.length} className="px-3 py-2"><Skeleton className="h-7 w-full" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                    No logs found for selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={clsx("cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/20", row.severity === "CRITICAL" && "border-l-2 border-l-rose-500")} onClick={() => setExpandedRow((prev) => (prev === row.id ? null : row.id))}>
                      {columns.includes("timestamp") ? (
                        <td className={clsx("px-3 align-top", rowPadding)}>
                          <p className="text-foreground">{formatTimestamp(row.timestamp, timezone)}</p>
                          <p className="text-xs text-muted-foreground">{relTime(row.timestamp)}{timezone === "utc" ? " UTC" : ""}</p>
                        </td>
                      ) : null}
                      {columns.includes("severity") ? (
                        <td className={clsx("px-3 align-top", rowPadding)}>
                          <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(row.severity))}>
                            <span
                              className={clsx(
                                "h-1.5 w-1.5 rounded-full",
                                row.severity === "CRITICAL"
                                  ? "bg-rose-600"
                                  : row.severity === "ERROR"
                                    ? "bg-red-600"
                                    : row.severity === "WARN"
                                      ? "bg-amber-600"
                                      : "bg-slate-500"
                              )}
                              aria-label={`Severity ${row.severity}`}
                            />
                            {row.severity}
                          </span>
                        </td>
                      ) : null}
                      {columns.includes("service") ? <td className={clsx("px-3 align-top font-medium", rowPadding)}>{row.service}</td> : null}
                      {columns.includes("message") ? <td className={clsx("px-3 align-top", rowPadding)}>{row.message}</td> : null}
                      {columns.includes("actor") ? <td className={clsx("px-3 align-top", rowPadding)}>{row.actorName || row.actor}</td> : null}
                      {columns.includes("tenant") ? <td className={clsx("px-3 align-top font-mono text-xs", rowPadding)}>{row.tenantId || "-"}</td> : null}
                      {columns.includes("scope") ? <td className={clsx("px-3 align-top", rowPadding)}>{row.scope}</td> : null}
                      {columns.includes("correlationId") ? (
                        <td className={clsx("px-3 align-top font-mono text-xs", rowPadding)}>
                          {row.correlationId ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title={row.correlationId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCorrelationId(row.correlationId || "");
                                  resetCursorPagination();
                                }}
                                className="rounded px-1 py-0.5 text-left text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                              >
                                {truncateToken(row.correlationId)}
                              </button>
                              <button
                                type="button"
                                title="Copy correlation ID"
                                aria-label="Copy correlation ID"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await navigator.clipboard.writeText(row.correlationId || "");
                                }}
                                className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              >
                                Copy
                              </button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      ) : null}
                    </tr>
                    <tr className={clsx("border-b border-border/40 transition-opacity", expandedRow === row.id ? "table-row opacity-100" : "hidden opacity-0")}>
                      <td colSpan={columns.length} className="px-3 pb-3">
                        <MetadataPanel row={row} />
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Showing {data?.showingFrom || 0}-{data?.showingTo || 0}
            {typeof total === "number" ? ` of ${total.toLocaleString()}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</Button>
            <span className="text-xs text-muted-foreground">
              Page {page}{pageCount ? ` of ${pageCount}` : ""}
            </span>
            <Button
              variant="ghost"
              disabled={!data?.hasMore}
              onClick={() => {
                if (!data?.hasMore || !data.nextCursor) return;
                setPageCursors((prev) => {
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
      </section>
    </div>
  );
}
