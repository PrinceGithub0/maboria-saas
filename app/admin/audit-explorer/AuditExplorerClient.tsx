"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeDMY } from "@/lib/date";

type AuditCategory = "all" | "impersonation" | "role" | "system_flags" | "tenant";
type AuditSource = "all" | "audit" | "system_flag";

type AuditExplorerItem = {
  id: string;
  timestamp: string;
  category: Exclude<AuditCategory, "all">;
  source: Exclude<AuditSource, "all">;
  action: string;
  message: string;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  metadata: Record<string, unknown>;
};

type AuditExplorerResponse = {
  items: AuditExplorerItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const fetcher = async (url: string): Promise<AuditExplorerResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as any).error === "string"
        ? (payload as any).error
        : null) || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as AuditExplorerResponse;
};

const CATEGORY_OPTIONS: Array<{ value: AuditCategory; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "impersonation", label: "Impersonation" },
  { value: "role", label: "Role changes" },
  { value: "system_flags", label: "System flags" },
  { value: "tenant", label: "Tenant actions" },
];

const SOURCE_OPTIONS: Array<{ value: AuditSource; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "audit", label: "Audit logs" },
  { value: "system_flag", label: "System flag audits" },
];

const METADATA_PREVIEW_LIMIT = 1800;

function categoryLabel(category: AuditExplorerItem["category"]) {
  if (category === "impersonation") return "Impersonation";
  if (category === "role") return "Role change";
  if (category === "system_flags") return "System flag";
  return "Tenant action";
}

function categoryBadgeVariant(category: AuditExplorerItem["category"]) {
  if (category === "impersonation") return "warning";
  if (category === "role") return "roleAdmin";
  if (category === "system_flags") return "roleSuperAdmin";
  return "roleUser";
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseCategory(value: string | null): AuditCategory {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "impersonation" || normalized === "role" || normalized === "system_flags" || normalized === "tenant") {
    return normalized;
  }
  return "all";
}

function parseSource(value: string | null): AuditSource {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "audit" || normalized === "system_flag") {
    return normalized;
  }
  return "all";
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export default function AuditExplorerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(
    () => ({
      query: String(searchParams.get("q") || "").trim(),
      category: parseCategory(searchParams.get("category")),
      source: parseSource(searchParams.get("source")),
      page: parsePage(searchParams.get("page")),
      raw: searchParams.toString(),
    }),
    [searchParams]
  );

  const [queryDraft, setQueryDraft] = useState(urlState.query);
  const [query, setQuery] = useState(urlState.query);
  const [category, setCategory] = useState<AuditCategory>(urlState.category);
  const [source, setSource] = useState<AuditSource>(urlState.source);
  const [page, setPage] = useState(urlState.page);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMetadataId, setExpandedMetadataId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  useEffect(() => {
    setQueryDraft((prev) => (prev === urlState.query ? prev : urlState.query));
    setQuery((prev) => (prev === urlState.query ? prev : urlState.query));
    setCategory((prev) => (prev === urlState.category ? prev : urlState.category));
    setSource((prev) => (prev === urlState.source ? prev : urlState.source));
    setPage((prev) => (prev === urlState.page ? prev : urlState.page));
  }, [urlState.category, urlState.page, urlState.query, urlState.source]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => {
        const next = queryDraft.trim();
        if (current === next) return current;
        setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (query) nextParams.set("q", query);
    if (category !== "all") nextParams.set("category", category);
    if (source !== "all") nextParams.set("source", source);
    if (page > 1) nextParams.set("page", String(page));
    const next = nextParams.toString();
    if (next !== urlState.raw) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [category, page, pathname, query, router, source, urlState.raw]);

  useEffect(() => {
    if (!copiedRowId) return;
    const timer = window.setTimeout(() => setCopiedRowId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedRowId]);

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "30");
    if (query) params.set("q", query);
    if (category !== "all") params.set("category", category);
    if (source !== "all") params.set("source", source);
    return `/api/admin/audit-explorer?${params.toString()}`;
  }, [category, page, query, source]);

  const { data, error, isLoading, isValidating, mutate } = useSWR<AuditExplorerResponse>(requestKey, fetcher);
  const rows = data?.items ?? [];
  const hasMore = Boolean(data?.hasMore);

  return (
    <div className="max-w-full space-y-4 overflow-x-hidden px-6 py-6 max-md:px-4 max-md:py-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Audit Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Unified audit timeline for impersonation, role changes, system flags, and tenant actions.
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <Input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Search action, actor, tenant, or metadata"
          />
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as AuditCategory);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value as AuditSource);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void mutate()} disabled={isValidating}>
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{data ? `Showing ${rows.length} of ${data.total} events` : "Loading events..."}</p>
      </Card>

      {error ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{error.message}</span>
            <Button size="sm" variant="secondary" onClick={() => void mutate()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card className="max-w-full overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,14%)_minmax(0,12%)_minmax(0,1fr)_minmax(0,18%)_minmax(0,18%)_minmax(0,10%)] gap-3 border-b border-border/70 bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground xl:grid">
          <span>Time</span>
          <span>Category</span>
          <span>Action</span>
          <span>Actor</span>
          <span>Tenant</span>
          <span>Source</span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No audit events matched your filters.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((row) => {
              const expanded = expandedId === row.id;
              const metadata = safeJson(row.metadata);
              const metadataExpanded = expandedMetadataId === row.id;
              const metadataVisible =
                metadataExpanded || metadata.length <= METADATA_PREVIEW_LIMIT
                  ? metadata
                  : `${metadata.slice(0, METADATA_PREVIEW_LIMIT)}\n…`;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm hover:bg-muted/20"
                    onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                  >
                    <div className="space-y-2 xl:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{formatDateTimeDMY(new Date(row.timestamp))}</span>
                        <Badge variant={categoryBadgeVariant(row.category)}>{categoryLabel(row.category)}</Badge>
                      </div>
                      <p className="truncate font-semibold text-foreground">{row.action}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.message}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(row.actorName || "System")} • {(row.tenantName || "Global")} • {row.source}
                      </p>
                    </div>

                    <div className="hidden grid-cols-[minmax(0,14%)_minmax(0,12%)_minmax(0,1fr)_minmax(0,18%)_minmax(0,18%)_minmax(0,10%)] gap-3 xl:grid">
                      <span className="truncate text-muted-foreground">{formatDateTimeDMY(new Date(row.timestamp))}</span>
                      <span>
                        <Badge variant={categoryBadgeVariant(row.category)}>{categoryLabel(row.category)}</Badge>
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-semibold text-foreground">{row.action}</span>
                        <span className="block truncate text-xs text-muted-foreground">{row.message}</span>
                      </span>
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-semibold text-foreground">{row.actorName || "System"}</span>
                        <span className="block truncate text-muted-foreground">{row.actorEmail || "—"}</span>
                      </span>
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-semibold text-foreground">{row.tenantName || "Global"}</span>
                        <span className="block truncate text-muted-foreground">{row.tenantId || "—"}</span>
                      </span>
                      <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">{row.source}</span>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="bg-muted/20 px-4 pb-4 pt-1">
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Metadata</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {metadata.length > METADATA_PREVIEW_LIMIT ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setExpandedMetadataId((current) => (current === row.id ? null : row.id))
                                }
                              >
                                {metadataExpanded ? "Collapse JSON" : "Expand full JSON"}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                await navigator.clipboard.writeText(metadata);
                                setCopiedRowId(row.id);
                              }}
                            >
                              {copiedRowId === row.id ? "Copied" : "Copy JSON"}
                            </Button>
                          </div>
                        </div>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                          {metadataVisible}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={page <= 1 || isValidating} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button variant="secondary" disabled={!hasMore || isValidating} onClick={() => setPage((current) => current + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

