"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeDMY } from "@/lib/date";

type TicketStatus = "OPEN" | "PENDING" | "RESOLVED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type TicketListItem = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  adminUnreadCount: number;
  subscriberUnreadCount: number;
  lastActivityAt: string;
  assignedAdminId: string | null;
  latestMessagePreview?: string;
  version: number;
  subscriber: {
    id: string;
    name: string | null;
    email: string;
    publicId: string | null;
  };
  assignedAdmin?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type Agent = {
  id: string;
  name: string | null;
  email: string;
};

type ApiListResponse = {
  items: TicketListItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type ApiAgentsResponse = { items: Agent[] };

const STATUS_OPTIONS: Array<{ value: "ALL" | TicketStatus; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
];

const PRIORITY_OPTIONS: Array<{ value: "ALL" | TicketPriority; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const SORT_OPTIONS = [
  { value: "NEWEST", label: "Newest" },
  { value: "OLDEST", label: "Oldest" },
  { value: "LAST_UPDATED", label: "Last updated" },
] as const;

const FILTER_SELECT_CLASS =
  "h-10 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-foreground transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-border dark:bg-background";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function normalizeStatus(value: string | null): "ALL" | TicketStatus {
  const normalized = String(value || "ALL").toUpperCase();
  if (normalized === "OPEN" || normalized === "PENDING" || normalized === "RESOLVED") return normalized;
  return "ALL";
}

function normalizePriority(value: string | null): "ALL" | TicketPriority {
  const normalized = String(value || "ALL").toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "URGENT") {
    return normalized;
  }
  return "ALL";
}

function normalizeAssigned(value: string | null): string {
  const normalized = String(value || "all").trim().toLowerCase();
  if (normalized === "all" || normalized === "me" || normalized === "unassigned") return normalized;
  if (normalized.startsWith("user:")) return normalized;
  return "all";
}

function normalizeSort(value: string | null): (typeof SORT_OPTIONS)[number]["value"] {
  const normalized = String(value || "NEWEST").toUpperCase();
  if (normalized === "OLDEST" || normalized === "LAST_UPDATED") return normalized;
  return "NEWEST";
}

function normalizePage(value: string | null) {
  const parsed = Number(value || "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function statusBadgeVariant(status: TicketStatus) {
  if (status === "RESOLVED") return "success" as const;
  if (status === "PENDING") return "pending" as const;
  return "warning" as const;
}

function statusIndicatorColor(status: TicketStatus) {
  if (status === "RESOLVED") return "bg-emerald-500";
  if (status === "PENDING") return "bg-amber-500";
  return "bg-orange-500";
}

export default function AdminSupportPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"ALL" | TicketStatus>(() => normalizeStatus(searchParams.get("status")));
  const [priority, setPriority] = useState<"ALL" | TicketPriority>(() => normalizePriority(searchParams.get("priority")));
  const [assigned, setAssigned] = useState<string>(() => normalizeAssigned(searchParams.get("assignee")));
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>(() => normalizeSort(searchParams.get("sort")));
  const [page, setPage] = useState<number>(() => normalizePage(searchParams.get("page")));
  const [searchInput, setSearchInput] = useState<string>(() => String(searchParams.get("search") || ""));
  const [search, setSearch] = useState<string>(() => String(searchParams.get("search") || "").trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => {
        if (prev === next) return prev;
        setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status.toLowerCase());
    if (priority !== "ALL") params.set("priority", priority.toLowerCase());
    if (assigned !== "all") params.set("assignee", assigned);
    if (search) params.set("search", search);
    if (sort !== "NEWEST") params.set("sort", sort.toLowerCase());
    if (page > 1) params.set("page", String(page));
    params.set("pageSize", "20");
    return params;
  }, [assigned, page, priority, search, sort, status]);

  const queryString = queryParams.toString();

  useEffect(() => {
    const current = searchParams.toString();
    if (queryString !== current) {
      router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
    }
  }, [pathname, queryString, router, searchParams]);

  const { data: listData, error, isLoading } = useSWR<ApiListResponse>(
    `/api/admin/support${queryString ? `?${queryString}` : ""}`,
    fetcher
  );
  const { data: agentsData } = useSWR<ApiAgentsResponse>("/api/admin/support/agents", fetcher);

  const tickets = useMemo(() => listData?.items ?? [], [listData?.items]);
  const pagination = listData?.pagination;
  const agents = agentsData?.items || [];
  const unreadTotal = useMemo(() => tickets.reduce((sum, ticket) => sum + (ticket.adminUnreadCount || 0), 0), [tickets]);

  const onStatusChange = (value: "ALL" | TicketStatus) => {
    setStatus(value);
    setPage(1);
  };

  const onPriorityChange = (value: "ALL" | TicketPriority) => {
    setPriority(value);
    setPage(1);
  };

  const onAssigneeChange = (value: string) => {
    setAssigned(value);
    setPage(1);
  };

  const onSortChange = (value: (typeof SORT_OPTIONS)[number]["value"]) => {
    setSort(value);
    setPage(1);
  };

  const hasFilterOrSearch =
    status !== "ALL" || priority !== "ALL" || assigned !== "all" || sort !== "NEWEST" || search.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 overflow-x-hidden px-6 py-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin Support</p>
        <h1 className="text-3xl font-semibold text-foreground">Support Tickets</h1>
      </header>

      {error ? <Alert variant="error">{String(error.message || "Failed to load support tickets.")}</Alert> : null}

      <section className="rounded-lg border border-gray-200 bg-white dark:border-border dark:bg-card">
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 dark:border-border dark:bg-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Tickets {pagination ? `(${pagination.total})` : ""}
            </p>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
              {unreadTotal} unread
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_220px_150px]">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search tickets"
              aria-label="Search support tickets"
            />
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as "ALL" | TicketStatus)}
              className={FILTER_SELECT_CLASS}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value as "ALL" | TicketPriority)}
              className={FILTER_SELECT_CLASS}
              aria-label="Filter by priority"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={assigned}
              onChange={(event) => onAssigneeChange(event.target.value)}
              className={FILTER_SELECT_CLASS}
              aria-label="Filter by assignee"
            >
              <option value="all">All assignees</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={`user:${agent.id}`}>
                  {agent.name || agent.email}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as (typeof SORT_OPTIONS)[number]["value"])}
              className={FILTER_SELECT_CLASS}
              aria-label="Sort support tickets"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-border/70">
          {isLoading ? (
            <div className="space-y-2 px-4 py-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2 rounded-md px-2 py-2">
                  <Skeleton className="h-4 w-1/2 rounded" />
                  <Skeleton className="h-3 w-2/3 rounded" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-gray-500 dark:text-muted-foreground">
                {hasFilterOrSearch ? "No tickets match your filters." : "No support tickets yet."}
              </p>
            </div>
          ) : (
            tickets.map((ticket) => {
              const requester = ticket.subscriber.name || ticket.subscriber.email;
              const preview = ticket.latestMessagePreview || "No message preview available.";
              const rowHref = `/admin/support/tickets/${ticket.id}${queryString ? `?${queryString}` : ""}`;
              return (
                <Link
                  key={ticket.id}
                  href={rowHref}
                  className={clsx(
                    "block px-4 py-3 transition-colors duration-150 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset dark:hover:bg-muted/30"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={clsx("h-2 w-2 shrink-0 rounded-full", statusIndicatorColor(ticket.status))} />
                        <p className="truncate text-sm font-semibold text-foreground">{ticket.subject}</p>
                        {ticket.adminUnreadCount > 0 ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                            {ticket.adminUnreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{requester}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{preview}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                        <Badge variant={statusBadgeVariant(ticket.status)} className="px-2 py-0.5">
                          {ticket.status.toLowerCase()}
                        </Badge>
                      <span className="uppercase tracking-wide text-muted-foreground">{ticket.priority.toLowerCase()}</span>
                      <span className="text-muted-foreground">{formatDateTimeDMY(new Date(ticket.lastActivityAt))}</span>
                      <span className="text-muted-foreground">
                        {ticket.assignedAdmin
                          ? ticket.assignedAdmin.name || ticket.assignedAdmin.email
                          : "Unassigned"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-border/70">
          <p className="text-xs text-muted-foreground">
            Page {pagination?.page || 1} of {pagination?.totalPages || 1}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination?.hasPreviousPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              aria-label="Previous support tickets page"
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination?.hasNextPage}
              onClick={() => setPage((prev) => prev + 1)}
              aria-label="Next support tickets page"
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
