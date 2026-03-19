"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { CheckCircle2 } from "lucide-react";
import { AdminNotificationSeverity, AdminNotificationStatus, AdminNotificationType } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { formatDateTimeDMY } from "@/lib/date";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  status: AdminNotificationStatus;
  severity: AdminNotificationSeverity;
  type: AdminNotificationType;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  snoozedUntil: string | null;
  metadata: Record<string, unknown> | null;
};

type ListResponse = {
  items: NotificationRow[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
  stats: { total7d: number; unread: number; critical24h: number; snoozed: number };
};

type DetailResponse = NotificationRow & {
  audits: Array<{ id: string; action: string; createdAt: string; actorAdmin: { name: string | null; email: string } }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as { error?: string }).error || `Request failed (${res.status})`));
  return json as T;
};

const statuses = ["ALL", "UNREAD", "READ", "ACKNOWLEDGED", "RESOLVED", "SNOOZED"] as const;
const severities = ["ALL", "CRITICAL", "WARNING", "INFO"] as const;
const types = ["ALL", "SYSTEM", "AUTOMATION", "SLA", "SUPPORT", "SECURITY", "BILLING", "INCIDENT"] as const;
const ranges = ["24h", "7d", "30d"] as const;

function rel(ts: string) {
  const d = new Date(ts);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function severityClass(s: AdminNotificationSeverity) {
  if (s === "CRITICAL") return "bg-rose-100 text-rose-800 ring-rose-200";
  if (s === "WARNING") return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function AdminNotificationsPage() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [severity, setSeverity] = useState<(typeof severities)[number]>("ALL");
  const [type, setType] = useState<(typeof types)[number]>("ALL");
  const [timeRange, setTimeRange] = useState<(typeof ranges)[number]>("7d");
  const [mineOnly, setMineOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "25", timeRange });
    if (status !== "ALL") p.set("status", status);
    if (severity !== "ALL") p.set("severity", severity);
    if (type !== "ALL") p.set("type", type);
    if (mineOnly) p.set("mineOnly", "true");
    if (search) p.set("q", search);
    return p.toString();
  }, [mineOnly, page, search, severity, status, timeRange, type]);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(`/api/admin/notifications?${qs}`, fetcher);
  const list = useMemo(() => data?.items ?? [], [data?.items]);
  const stats = data?.stats ?? { total7d: 0, unread: 0, critical24h: 0, snoozed: 0 };
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 25));

  useEffect(() => {
    if (!list.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((i) => i.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const { data: detail, mutate: mutateDetail } = useSWR<DetailResponse>(
    selectedId ? `/api/admin/notifications/${selectedId}` : null,
    fetcher
  );

  const setCard = (card: "total" | "unread" | "critical" | "snoozed") => {
    setPage(1);
    if (card === "total") {
      setStatus("ALL");
      setSeverity("ALL");
      setType("ALL");
      setTimeRange("7d");
      setMineOnly(false);
      setSearchInput("");
      setSearch("");
      return;
    }
    if (card === "unread") setStatus("UNREAD");
    if (card === "critical") {
      setSeverity("CRITICAL");
      setTimeRange("24h");
    }
    if (card === "snoozed") setStatus("SNOOZED");
  };

  const patchOne = async (action: "MARK_READ" | "ACK" | "RESOLVE" | "SNOOZE" | "UNSNOOZE", snoozedUntil?: string) => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/notifications/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "SNOOZE" ? { action, snoozedUntil } : { action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((json as { error?: string }).error || "Action failed"));
      await mutate();
      await mutateDetail();
      setToast(action === "ACK" ? "Notification acknowledged" : action === "RESOLVE" ? "Resolved" : "Updated");
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Action failed");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setBusy(false);
    }
  };

  const metaRows = useMemo(() => Object.entries(detail?.metadata || {}), [detail?.metadata]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-6 py-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">Platform alerts and admin activity.</p>
      </header>

      {error ? <Alert variant="error">{error.message}</Alert> : null}

      <section className="grid gap-3 md:grid-cols-4">
        {[
          { id: "total", label: "Total (7d)", value: stats.total7d },
          { id: "unread", label: "Unread", value: stats.unread },
          { id: "critical", label: "Critical (24h)", value: stats.critical24h },
          { id: "snoozed", label: "Snoozed", value: stats.snoozed },
        ].map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setCard(card.id as "total" | "unread" | "critical" | "snoozed")}
            className={clsx(
              "rounded-lg border px-4 py-3 text-left transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/8",
              (card.id === "unread" && status === "UNREAD") ||
                (card.id === "snoozed" && status === "SNOOZED") ||
                (card.id === "critical" && severity === "CRITICAL" && timeRange === "24h") ||
                (card.id === "total" && status === "ALL" && severity === "ALL" && timeRange === "7d")
                ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200 dark:border-indigo-500/60 dark:bg-indigo-500/12 dark:ring-indigo-500/35"
                : "border-border/70 bg-card"
            )}
          >
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{card.value}</p>
          </button>
        ))}
      </section>

      <section className="rounded-xl border border-border/70 bg-card p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_150px_auto]">
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search title or message" />
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{statuses.map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>)}</select>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value as typeof severity); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{severities.map((s) => <option key={s} value={s}>{s === "ALL" ? "All severities" : s}</option>)}</select>
          <select value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{types.map((s) => <option key={s} value={s}>{s === "ALL" ? "All types" : s}</option>)}</select>
          <div className="flex items-center gap-2">
            <select value={timeRange} onChange={(e) => { setTimeRange(e.target.value as typeof timeRange); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{ranges.map((r) => <option key={r} value={r}>{r === "24h" ? "Last 24 hours" : r === "7d" ? "Last 7 days" : "Last 30 days"}</option>)}</select>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Mine only
            </label>
          </div>
        </div>
      </section>

      <section className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
        <div className="rounded-xl border border-border/70 bg-card">
          <div className="grid grid-cols-[120px_minmax(200px,1fr)_90px_90px_170px] gap-2 border-b border-border/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>Severity</span><span>Title</span><span>Occur.</span><span>Status</span><span>Last Seen</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : list.length === 0 ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-base font-semibold text-foreground">All clear</p>
                <p className="text-sm text-muted-foreground">No platform alerts or admin notifications.</p>
              </div>
            ) : list.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={clsx("grid w-full grid-cols-[120px_minmax(200px,1fr)_90px_90px_170px] gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40", row.severity === "CRITICAL" && "border-l-2 border-l-rose-500", selectedId === row.id && "bg-indigo-50/70 dark:bg-indigo-500/10")}>
                <span className={clsx("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(row.severity))} aria-label={`Severity ${row.severity.toLowerCase()}`}>
                  <span className={row.severity === "CRITICAL" ? "h-2 w-2 rounded-full bg-rose-600" : row.severity === "WARNING" ? "h-2 w-2 rounded-full bg-amber-500" : "h-2 w-2 rounded-full bg-slate-400"} />
                  {row.severity.toLowerCase()}
                </span>
                <span className="min-w-0"><span className={clsx("block truncate text-sm text-foreground", row.status === "UNREAD" && "font-semibold")}>{row.title}</span><span className="block truncate text-xs text-muted-foreground">{row.message}</span></span>
                <span className="text-xs tabular-nums text-foreground">{row.occurrences > 1 ? `x${row.occurrences}` : "-"}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{row.status.toLowerCase()}</span>
                <span className="text-xs text-muted-foreground"><span className="block">{rel(row.lastSeenAt)}</span><span className="block text-[10px]">{formatDateTimeDMY(new Date(row.lastSeenAt))}</span></span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
            <span>Page {page} of {pageCount}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</Button>
              <Button size="sm" variant="secondary">{page}</Button>
              <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{">"}</Button>
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-border/70 bg-card p-4">
          {!detail ? (
            <div className="space-y-3"><Skeleton className="h-6 w-2/3 rounded" /><Skeleton className="h-16 rounded" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(detail.severity))}>{detail.severity.toLowerCase()}</span>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{detail.title}</h2>
                <p className="text-sm text-muted-foreground">{detail.message}</p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                {(detail.status === "UNREAD" || detail.status === "READ" || detail.status === "SNOOZED") ? <Button onClick={() => patchOne("ACK")} disabled={busy} className="shadow-none">Acknowledge</Button> : null}
                {detail.status !== "RESOLVED" ? <Button variant="secondary" onClick={() => patchOne("RESOLVE")} disabled={busy}>Resolve</Button> : null}
                {detail.status === "UNREAD" ? <Button variant="ghost" onClick={() => patchOne("MARK_READ")} disabled={busy}>Mark read</Button> : null}
                {detail.status === "SNOOZED" ? (
                  <Button variant="ghost" onClick={() => patchOne("UNSNOOZE")} disabled={busy}>Unsnooze</Button>
                ) : detail.status !== "RESOLVED" ? (
                  <select defaultValue="" onChange={(e) => { const h = Number(e.target.value); if (!h) return; patchOne("SNOOZE", new Date(Date.now() + h * 60 * 60 * 1000).toISOString()); e.target.value = ""; }} className="h-9 rounded-md border border-border/70 bg-background px-2 text-xs">
                    <option value="">Snooze...</option><option value="1">1 hour</option><option value="4">4 hours</option><option value="24">24 hours</option>
                  </select>
                ) : null}
              </div>
              {metaRows.length ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Metadata</p>
                  <dl className="space-y-1 rounded-md border border-border/60 bg-background p-2">
                    {metaRows.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-xs">
                        <dt className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                        <dd className={clsx("break-all text-foreground", key.toLowerCase().endsWith("id") && "font-mono")}>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <div className="space-y-2 border-t border-border/70 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Audit trail</p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {detail.audits?.length ? detail.audits.map((a) => (
                    <div key={a.id} className="rounded-md border border-border/60 bg-background px-2 py-2 text-xs">
                      <p className="font-semibold text-foreground">{a.action}</p>
                      <p className="text-muted-foreground">{a.actorAdmin?.name || a.actorAdmin?.email || "Unknown admin"} - {formatDateTimeDMY(new Date(a.createdAt))}</p>
                    </div>
                  )) : <p className="text-xs text-muted-foreground">No audit events for this notification yet.</p>}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>

      <Toast message={toast} show={Boolean(toast)} />
    </div>
  );
}
