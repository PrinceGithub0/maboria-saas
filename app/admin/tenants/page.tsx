"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/date";
import type { AdminTenantListResponse } from "@/lib/admin/tenants-types";

type TenantAction = {
  type: "suspend" | "reactivate";
  tenantId: string;
  tenantName: string;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function badgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

function normalizeSort(value: string) {
  if (value === "created_asc") return "created_asc";
  if (value === "activity_desc") return "activity_desc";
  if (value === "activity_asc") return "activity_asc";
  return "created_desc";
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [action, setAction] = useState<TenantAction | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string } | null>(
    null
  );

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status !== "all") params.set("status", status);
    if (plan !== "all") params.set("plan", plan);
    params.set("sort", normalizeSort(sort));
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/admin/tenants?${params.toString()}`;
  }, [page, pageSize, plan, query, sort, status]);

  const { data, error, isLoading, mutate } = useSWR<AdminTenantListResponse>(requestKey, fetcher);

  useEffect(() => {
    setPage(1);
  }, [query, status, plan, sort]);

  const items = data?.items || [];
  const pagination = data?.pagination;
  const isSuperAdmin = data?.actorRole === "SUPER_ADMIN";

  const runAction = async () => {
    if (!action) return;
    setSaving(true);
    setFeedback(null);
    try {
      const endpoint =
        action.type === "suspend"
          ? `/api/admin/tenants/${action.tenantId}/suspend`
          : `/api/admin/tenants/${action.tenantId}/reactivate`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action.type === "suspend" ? JSON.stringify({ reason: reason.trim() || undefined }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || "Action failed."));
      }
      setFeedback({
        variant: "success",
        message:
          action.type === "suspend"
            ? `Tenant "${action.tenantName}" suspended.`
            : `Tenant "${action.tenantName}" reactivated.`,
      });
      setAction(null);
      setReason("");
      await mutate();
    } catch (actionError) {
      setFeedback({
        variant: "error",
        message: actionError instanceof Error ? actionError.message : "Action failed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSuspendClick = (tenantId: string, tenantName: string) => {
    if (!isSuperAdmin) {
      setFeedback({
        variant: "error",
        message: "Only Super Admin accounts can suspend tenants.",
      });
      return;
    }
    setAction({ type: "suspend", tenantId, tenantName });
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor workspace health, lifecycle status, and high-risk tenant signals.
        </p>
      </div>

      {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
      {error ? <Alert variant="error">{error.message}</Alert> : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by workspace, owner email, or tenant ID"
            className="md:col-span-2"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Disabled</option>
          </select>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">All plans</option>
            <option value="STARTER">Starter</option>
            <option value="PRO">Pro</option>
            <option value="GROWTH">Growth</option>
            <option value="BUSINESS">Business</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="activity_desc">Latest activity</option>
            <option value="activity_asc">Earliest activity</option>
          </select>
        </div>
      </Card>

      <Card title="Tenant workspaces">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No tenants found for the current filters.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-hidden rounded-xl border border-border/60 md:block">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <colgroup>
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-muted/30 text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Workspace</th>
                    <th className="px-3 py-3 font-semibold">Tenant ID</th>
                    <th className="px-3 py-3 font-semibold">Owner</th>
                    <th className="px-3 py-3 font-semibold">Plan</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Created</th>
                    <th className="px-3 py-3 font-semibold">Last activity</th>
                    <th className="px-3 py-3 font-semibold">Risk</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="cursor-pointer border-t border-border/50 transition-colors hover:bg-muted/35"
                      onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                    >
                      <td className="px-3 py-3 font-semibold text-foreground">{tenant.name}</td>
                      <td className="break-all px-3 py-3 font-mono text-xs text-muted-foreground">{tenant.id}</td>
                      <td className="px-3 py-3">
                        <p className="text-foreground">{tenant.owner.name || tenant.owner.email}</p>
                        <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {tenant.owner.email}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-foreground">{tenant.plan || "-"}</td>
                      <td className="px-3 py-3">
                        <Badge variant={badgeVariant(tenant.status)}>{tenant.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDateDMY(new Date(tenant.createdAt))}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {tenant.lastActivityAt ? formatDateTimeDMY(new Date(tenant.lastActivityAt)) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={tenant.riskFlags > 0 ? "warning" : "success"}>{tenant.riskFlags}</Badge>
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <div className="grid min-w-0 gap-2" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/admin/tenants/${tenant.id}`} className="block">
                            <Button size="sm" variant="secondary" className="w-full">
                              View
                            </Button>
                          </Link>
                          {tenant.status === "SUSPENDED" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() =>
                                setAction({ type: "reactivate", tenantId: tenant.id, tenantName: tenant.name })
                              }
                            >
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-rose-600 hover:text-rose-700"
                              onClick={() => handleSuspendClick(tenant.id, tenant.name)}
                            >
                              Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                  className="w-full rounded-2xl border border-border/60 bg-card p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{tenant.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{tenant.owner.email}</p>
                    </div>
                    <Badge variant={badgeVariant(tenant.status)}>{tenant.status}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">{tenant.id}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Plan: {tenant.plan || "-"}</span>
                    <span>Risk: {tenant.riskFlags}</span>
                    <span>Created: {formatDateDMY(new Date(tenant.createdAt))}</span>
                    <span>
                      Last: {tenant.lastActivityAt ? formatDateDMY(new Date(tenant.lastActivityAt)) : "-"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {pagination?.page || page} of {pagination?.totalPages || 1} • {pagination?.totalItems || 0} tenants
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={(pagination?.page || page) <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={(pagination?.page || page) >= (pagination?.totalPages || 1)}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(action)}
        onClose={() => {
          if (saving) return;
          setAction(null);
          setReason("");
        }}
        title={action?.type === "suspend" ? "Suspend tenant" : "Reactivate tenant"}
      >
        {action ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {action.type === "suspend"
                ? `Suspend "${action.tenantName}"? This blocks subscriber login and API access without deleting data.`
                : `Reactivate "${action.tenantName}"? Login and API access will be restored.`}
            </p>
            {action.type === "suspend" ? (
              <Input
                label="Reason (optional)"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Policy, abuse, billing escalation..."
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (saving) return;
                  setAction(null);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={runAction} loading={saving}>
                {action.type === "suspend" ? "Suspend tenant" : "Reactivate tenant"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
