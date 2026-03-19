"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ActorRole = "SUPER_ADMIN" | "OPS_ADMIN";
type EventSeverity = "INFO" | "WARNING" | "CRITICAL";
type EventSource = "BILLING" | "AUTH" | "AUTOMATION" | "INBOX" | "SUPPORT" | "SYSTEM";
type TimePreset = "24h" | "7d" | "30d" | "custom";

type EventItem = {
  id: string;
  createdAt: string;
  severity: EventSeverity;
  source: EventSource;
  eventType: string;
  tenant: { id: string; name: string } | null;
  user: { id: string; email: string; name: string | null } | null;
  actor: { id: string; email: string; name: string | null } | null;
  entityType: string | null;
  entityId: string | null;
  message: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

type EventsResponse = {
  actorRole: ActorRole;
  items: EventItem[];
  nextCursor: string | null;
  totalCount: number | null;
};

type TenantsResponse = {
  items: Array<{ id: string; name: string }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  }
  return payload as T;
};

const suggestionChips = ["payment_failed", "invoice_1023", "user@email.com", "tenant:workspace_1023"];

function rangeForPreset(preset: Exclude<TimePreset, "custom">) {
  const now = new Date();
  const hours = preset === "24h" ? 24 : preset === "7d" ? 24 * 7 : 24 * 30;
  return {
    from: new Date(now.getTime() - hours * 60 * 60 * 1000),
    to: now,
  };
}

function toInputValue(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseInputDate(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function severityClasses(value: EventSeverity) {
  if (value === "CRITICAL") return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30";
  if (value === "WARNING") return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30";
  return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:ring-slate-500/30";
}

function metadataJson(value: Record<string, unknown>) {
  return JSON.stringify(value || {}, null, 2);
}

export default function EventsExplorerClient({ actorRole }: { actorRole: ActorRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [eventType, setEventType] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [preset, setPreset] = useState<TimePreset>("7d");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const initialQ = searchParams.get("q") || "";
    const initialSeverity = searchParams.get("severity") || "";
    const initialSource = searchParams.get("source") || "";
    const initialEventType = searchParams.get("eventType") || "";
    const initialTenantId = searchParams.get("tenantId") || "";
    const initialUserId = searchParams.get("userId") || "";
    const initialEntityId = searchParams.get("entityId") || "";
    const initialPreset = (searchParams.get("range") || "7d") as TimePreset;
    setQInput(initialQ);
    setQ(initialQ);
    setSeverity(initialSeverity);
    setSource(initialSource);
    setEventType(initialEventType);
    setTenantId(initialTenantId);
    setUserId(initialUserId);
    setEntityId(initialEntityId);
    if (["24h", "7d", "30d", "custom"].includes(initialPreset)) {
      setPreset(initialPreset);
    }
    const parsedFrom = parseInputDate(searchParams.get("from") || "");
    const parsedTo = parseInputDate(searchParams.get("to") || "");
    if (initialPreset === "custom") {
      setFrom(parsedFrom);
      setTo(parsedTo);
    } else if (parsedFrom || parsedTo) {
      setFrom(parsedFrom);
      setTo(parsedTo);
    } else {
      const presetRange = rangeForPreset((["24h", "7d", "30d"].includes(initialPreset) ? initialPreset : "7d") as Exclude<TimePreset, "custom">);
      setFrom(presetRange.from);
      setTo(presetRange.to);
    }
  }, [initialized, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
      setCursorStack([""]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (!initialized) return;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    if (eventType) params.set("eventType", eventType);
    if (tenantId) params.set("tenantId", tenantId);
    if (userId) params.set("userId", userId);
    if (entityId) params.set("entityId", entityId);
    params.set("range", preset);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [initialized, pathname, router, q, severity, source, eventType, tenantId, userId, entityId, preset, from, to]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const currentCursor = page > 1 ? cursorStack[page - 1] || "" : "";

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (q) params.set("q", q);
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    if (eventType) params.set("eventType", eventType);
    if (tenantId && actorRole === "SUPER_ADMIN") params.set("tenantId", tenantId);
    if (userId) params.set("userId", userId);
    if (entityId) params.set("entityId", entityId);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    if (currentCursor) params.set("cursor", currentCursor);
    return params.toString();
  }, [actorRole, currentCursor, entityId, eventType, from, q, severity, source, tenantId, to, userId]);

  const { data, error, isLoading, mutate, isValidating } = useSWR<EventsResponse>(
    `/api/admin/events?${apiQuery}`,
    fetcher,
    { keepPreviousData: true }
  );

  const { data: tenantOptions } = useSWR<TenantsResponse>(
    actorRole === "SUPER_ADMIN" ? "/api/admin/tenants?page=1&pageSize=100" : null,
    fetcher
  );

  const groupedTenantOptions = useMemo(() => {
    const items = tenantOptions?.items || [];
    const groups = new Map<string, { id: string; name: string; tenantIds: string[] }>();
    for (const tenant of items) {
      const normalizedName = String(tenant?.name || "")
        .trim()
        .toLocaleLowerCase();
      if (!tenant?.id || !normalizedName) continue;
      const existing = groups.get(normalizedName);
      if (existing) {
        existing.tenantIds.push(tenant.id);
      } else {
        groups.set(normalizedName, {
          id: tenant.id,
          name: tenant.name,
          tenantIds: [tenant.id],
        });
      }
    }
    return Array.from(groups.values()).map((group) => ({
      id: group.id,
      name: group.name,
      value: group.tenantIds.join(","),
    }));
  }, [tenantOptions?.items]);

  const rows = useMemo(() => data?.items || [], [data?.items]);
  const selected = rows.find((item) => item.id === selectedId) || rows[0] || null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    if (!rows.length) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (typing) return;
      const currentIndex = rows.findIndex((item) => item.id === (selectedId || rows[0]?.id));
      if (event.key === "Enter") {
        if (!selectedId && rows[0]) setSelectedId(rows[0].id);
        return;
      }
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(rows.length - 1, Math.max(0, currentIndex) + 1)
          : Math.max(0, Math.max(0, currentIndex) - 1);
      setSelectedId(rows[nextIndex]?.id || null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows, selectedId]);

  const hasActiveFilters = Boolean(q || severity || source || eventType || tenantId || userId || entityId || from || to);
  const activeFilters = [
    severity ? { label: severity, clear: () => setSeverity("") } : null,
    source ? { label: source, clear: () => setSource("") } : null,
    eventType ? { label: eventType, clear: () => setEventType("") } : null,
    tenantId ? { label: `Tenant ${tenantId}`, clear: () => setTenantId("") } : null,
    userId ? { label: `User ${userId}`, clear: () => setUserId("") } : null,
    entityId ? { label: `Entity ${entityId}`, clear: () => setEntityId("") } : null,
    q ? { label: `Search ${q}`, clear: () => { setQ(""); setQInput(""); } } : null,
    preset !== "custom" ? { label: preset === "24h" ? "Last 24h" : preset === "7d" ? "Last 7d" : "Last 30d", clear: () => applyPreset("7d") } : null,
    preset === "custom" && (from || to)
      ? {
          label: "Custom range",
          clear: () => {
            const nextRange = rangeForPreset("7d");
            setPreset("7d");
            setFrom(nextRange.from);
            setTo(nextRange.to);
            setPage(1);
            setCursorStack([""]);
          },
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const resetFilters = () => {
    setQ("");
    setQInput("");
    setSeverity("");
    setSource("");
    setEventType("");
    setTenantId("");
    setUserId("");
    setEntityId("");
    const nextRange = rangeForPreset("7d");
    setPreset("7d");
    setFrom(nextRange.from);
    setTo(nextRange.to);
    setPage(1);
    setCursorStack([""]);
  };

  const applyPreset = (nextPreset: TimePreset) => {
    setPreset(nextPreset);
    setPage(1);
    setCursorStack([""]);
    if (nextPreset === "custom") {
      setFrom(null);
      setTo(null);
      return;
    }
    const nextRange = rangeForPreset(nextPreset);
    setFrom(nextRange.from);
    setTo(nextRange.to);
  };

  const metadataText = selected ? metadataJson(selected.metadata) : "{}";

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-6 py-5">
      <header className="space-y-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Events Explorer</h1>
          <p className="text-sm text-muted-foreground">Search system activity across tenants and users</p>
        </div>
      </header>

      <section className="sticky top-0 z-20 space-y-3 border-b border-border/60 bg-background/95 pb-4 pt-1 backdrop-blur">
        <div className="space-y-3">
          <input
            ref={searchRef}
            value={qInput}
            onChange={(event) => {
              setQInput(event.target.value);
              setPage(1);
              setCursorStack([""]);
            }}
            placeholder="Search: invoice_1023, payment_failed, user@email.com, tenant:workspace_1023"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setQInput(chip);
                  setPage(1);
                  setCursorStack([""]);
                }}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="">All severities</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="">All sources</option>
            <option value="AUTH">Auth</option>
            <option value="BILLING">Billing</option>
            <option value="AUTOMATION">Automation</option>
            <option value="INBOX">Inbox</option>
            <option value="SUPPORT">Support</option>
            <option value="SYSTEM">System</option>
          </select>
          <select value={preset} onChange={(event) => applyPreset(event.target.value as TimePreset)} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
            <option value="custom">Custom</option>
          </select>
          {actorRole === "SUPER_ADMIN" ? (
            <select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 min-w-[220px] rounded-md border border-border/70 bg-background px-3 text-sm">
              <option value="">All tenants</option>
              {groupedTenantOptions.map((tenant) => (
                <option key={tenant.value} value={tenant.value}>
                  {tenant.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>
            Clear filters
          </Button>
        </div>

        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" value={toInputValue(from)} onChange={(event) => { setFrom(parseInputDate(event.target.value)); setPage(1); setCursorStack([""]); }} className="h-10 w-[220px]" />
            <Input type="datetime-local" value={toInputValue(to)} onChange={(event) => { setTo(parseInputDate(event.target.value)); setPage(1); setCursorStack([""]); }} className="h-10 w-[220px]" />
          </div>
        ) : null}

        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.clear}
                className="rounded-full border border-border/70 bg-muted/25 px-3 py-1 text-xs text-foreground transition hover:bg-muted/40"
              >
                {filter.label} x
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">Unable to load events. Try again.</Alert>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>
            Retry
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <div className="min-h-[640px] overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Results
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-foreground">No results found.</p>
              <p className="mt-2 text-sm text-muted-foreground">Try `payment_failed`, `invoice_1023`, or a user email.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={clsx(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/20",
                    selected?.id === row.id && "bg-muted/20"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      row.severity === "CRITICAL" ? "bg-rose-500" : row.severity === "WARNING" ? "bg-amber-500" : "bg-slate-400"
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">{row.message}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatStamp(row.createdAt)} / {row.source} / {row.eventType} / {row.tenant?.name || "Platform"} / {row.user?.email || "system"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page}{isValidating ? " / refreshing..." : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  if (page <= 1) return;
                  setPage((prev) => Math.max(1, prev - 1));
                }}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!data?.nextCursor}
                onClick={() => {
                  if (!data?.nextCursor) return;
                  setCursorStack((prev) => {
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

        <aside className="min-h-[640px] rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Event details
          </div>
          {!selected ? (
            <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Select an event to inspect context and metadata.
            </div>
          ) : (
            <div className="space-y-5 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    severityClasses(selected.severity)
                  )}
                >
                  {selected.severity}
                </span>
                <Badge variant="warning" className="bg-transparent text-foreground">
                  {selected.eventType}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatStamp(selected.createdAt)}</span>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Context</h2>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    Tenant:{" "}
                    {selected.tenant ? (
                      <Link className="text-indigo-600 hover:underline dark:text-indigo-300" href={`/admin/tenants/${selected.tenant.id}`}>
                        {selected.tenant.name}
                      </Link>
                    ) : (
                      "Platform"
                    )}
                  </p>
                  <p>
                    User:{" "}
                    {selected.user ? (
                      <Link className="text-indigo-600 hover:underline dark:text-indigo-300" href={`/admin/users/${selected.user.id}/activity`}>
                        {selected.user.name || selected.user.email}
                      </Link>
                    ) : (
                      "System"
                    )}
                  </p>
                  {selected.actor ? <p>Actor: {selected.actor.name || selected.actor.email}</p> : null}
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Event</h2>
                <p className="text-sm text-foreground">{selected.message}</p>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Entity</h2>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Type: <span className="text-foreground">{selected.entityType || "-"}</span></p>
                  <div className="flex items-center gap-2">
                    <span>Entity ID:</span>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">{selected.entityId || "-"}</code>
                    {selected.entityId ? (
                      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(selected.entityId || "")}>
                        Copy
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Request</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">{selected.requestId || "-"}</code>
                  {selected.requestId ? (
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(selected.requestId || "")}>
                      Copy
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Metadata</h2>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowMetadata((prev) => !prev)}>
                      {showMetadata ? "Collapse" : "Expand"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(metadataText)}>
                      Copy
                    </Button>
                  </div>
                </div>
                {showMetadata ? (
                  <pre className="max-h-[260px] overflow-auto rounded-lg border border-border/60 bg-muted/15 p-3 text-xs text-foreground">
                    {metadataText}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">Metadata is collapsed by default. Sensitive fields are redacted.</p>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Related links</h2>
                <div className="flex flex-wrap gap-2">
                  {selected.user ? (
                    <Link href={`/admin/users/${selected.user.id}/activity`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      View user timeline
                    </Link>
                  ) : null}
                  {selected.tenant ? (
                    <Link href={`/admin/tenants/${selected.tenant.id}`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      View tenant
                    </Link>
                  ) : null}
                  {selected.requestId ? (
                    <Link href={`/admin/audit-explorer?q=${encodeURIComponent(selected.requestId)}`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      View audit logs
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

