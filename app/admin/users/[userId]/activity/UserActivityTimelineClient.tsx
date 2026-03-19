"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { Activity, ArrowLeft, Clock3, FileText, Mail, Receipt, UserCheck, UserCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeDMY } from "@/lib/date";

const EVENT_OPTIONS = [
  "all",
  "login",
  "logout",
  "invoice_created",
  "invoice_sent",
  "invoice_paid",
  "receipt_generated",
  "automation_triggered",
  "notification_sent",
  "payment_attempt",
  "payment_failed",
  "payment_succeeded",
  "impersonation_started",
  "impersonation_ended",
] as const;

type EventFilter = (typeof EVENT_OPTIONS)[number];

type TimelineItem = {
  id: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type TimelineResponse = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  items: TimelineItem[];
  pagination: {
    mode: "offset" | "cursor";
    page: number;
    pageSize: number;
    totalItems: number | null;
    totalPages: number | null;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

const fetcher = async (url: string): Promise<TimelineResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string"
        ? String((payload as { error: string }).error)
        : null) || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as TimelineResponse;
};

function toLabel(eventType: string) {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventIcon(eventType: string) {
  if (eventType.includes("invoice")) return FileText;
  if (eventType.includes("receipt")) return Receipt;
  if (eventType.includes("notification")) return Mail;
  if (eventType.includes("payment")) return UserCheck;
  if (eventType.includes("login") || eventType.includes("logout")) return UserCircle2;
  return Activity;
}

function eventBadgeVariant(eventType: string) {
  if (eventType.includes("failed")) return "danger" as const;
  if (eventType.includes("succeeded") || eventType.includes("paid")) return "success" as const;
  if (eventType.includes("attempt")) return "warning" as const;
  if (eventType.includes("login") || eventType.includes("logout") || eventType.includes("notification")) {
    return "pending" as const;
  }
  if (eventType.includes("invoice") || eventType.includes("receipt") || eventType.includes("impersonation")) {
    return "country" as const;
  }
  return "warning" as const;
}

function metadataSummary(metadata: Record<string, unknown>) {
  const keys = Object.keys(metadata || {});
  if (!keys.length) return null;
  const primaryKey = keys[0];
  const value = metadata[primaryKey];
  if (value === null || value === undefined) return `${primaryKey}: -`;
  if (typeof value === "object") return `${primaryKey}: [object]`;
  return `${primaryKey}: ${String(value)}`;
}

function toDayStart(value: string) {
  const parsed = new Date(value);
  parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString();
}

function toDayEnd(value: string) {
  const parsed = new Date(value);
  parsed.setHours(23, 59, 59, 999);
  return parsed.toISOString();
}

export default function UserActivityTimelineClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [eventType, setEventType] = useState<EventFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchDraft.trim();
      setQuery((prev) => (prev === next ? prev : next));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const filterSignature = useMemo(
    () => JSON.stringify({ eventType, query, from, to }),
    [eventType, query, from, to]
  );

  const getKey = (pageIndex: number, previousPageData: TimelineResponse | null) => {
    if (pageIndex > 0 && !previousPageData?.pagination?.nextCursor) return null;

    const params = new URLSearchParams();
    params.set("cursorMode", "1");
    params.set("pageSize", "50");
    if (eventType !== "all") params.set("eventType", eventType);
    if (query) params.set("q", query);
    if (from) params.set("from", toDayStart(from));
    if (to) params.set("to", toDayEnd(to));
    if (pageIndex > 0 && previousPageData?.pagination?.nextCursor) {
      params.set("cursor", previousPageData.pagination.nextCursor);
    }

    return `/api/admin/users/${encodeURIComponent(userId)}/activity?${params.toString()}`;
  };

  const { data, error, isLoading, mutate, isValidating, size, setSize } = useSWRInfinite<TimelineResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: true,
      revalidateAll: true,
    }
  );

  useEffect(() => {
    void setSize(1);
  }, [filterSignature, setSize]);

  const user = data?.[0]?.user;
  const items = useMemo(() => data?.flatMap((pageData) => pageData.items) || [], [data]);
  const lastPage = data?.[data.length - 1];
  const hasMore = Boolean(lastPage?.pagination?.hasMore);

  async function handleRefresh() {
    await setSize(1);
    await mutate();
  }

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <header className="space-y-2">
        <Button variant="secondary" size="sm" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Button>
        <h1 className="text-3xl font-semibold text-foreground">User Activity Timeline</h1>
        <p className="text-sm text-muted-foreground">Chronological record of user actions.</p>
        {user ? (
          <p className="text-xs text-muted-foreground">
            {user.name} - {user.email}
          </p>
        ) : null}
      </header>

      {error ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Activity history unavailable. {error.message}</span>
            <Button size="sm" variant="secondary" onClick={() => void handleRefresh()} loading={isValidating}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_180px_180px_auto]">
          <select
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value as EventFilter);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {EVENT_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "all" ? "All events" : toLabel(entry)}
              </option>
            ))}
          </select>
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search events"
          />
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
          <Button variant="secondary" onClick={() => void handleRefresh()} loading={isValidating}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <Skeleton key={idx} className="h-14 rounded-md" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No activity events found for current filters.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const Icon = eventIcon(item.eventType);
              const summary = metadataSummary(item.metadata);
              return (
                <li key={item.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatDateTimeDMY(new Date(item.createdAt))}</span>
                    <Badge variant={eventBadgeVariant(item.eventType)}>{toLabel(item.eventType)}</Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p>{toLabel(item.eventType)}</p>
                      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
                      {item.actorEmail ? (
                        <p className="text-xs text-muted-foreground">Actor: {item.actorName || item.actorEmail}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Showing {items.length} events{isValidating ? " - refreshing..." : ""}
        </span>
        <Button
          variant="secondary"
          disabled={!hasMore || isValidating}
          onClick={() => void setSize(size + 1)}
        >
          {hasMore ? "Load more" : "No more events"}
        </Button>
      </div>
    </div>
  );
}
