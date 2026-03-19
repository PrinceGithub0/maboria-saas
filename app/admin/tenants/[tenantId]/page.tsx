"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Table } from "@/components/ui/table";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/date";
import type { AdminTenantDetailResponse } from "@/lib/admin/tenants-types";
import { ConfirmImpersonationModal } from "@/components/admin/ConfirmImpersonationModal";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function statusBadgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

const usageFeatureLabels: Record<string, string> = {
  ai_requests: "AI requests",
  invoices: "Invoices",
  whatsapp_messages: "WhatsApp messages",
  automations_runs: "Automation runs",
  team_members_seats: "Team seats",
};

export default function AdminTenantDetailPage() {
  const router = useRouter();
  const params = useParams<{ tenantId: string }>();
  const tenantId = String(params?.tenantId || "");
  const [reason, setReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showImpersonationModal, setShowImpersonationModal] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [startingImpersonation, setStartingImpersonation] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string } | null>(
    null
  );

  const { data, error, isLoading, mutate } = useSWR<AdminTenantDetailResponse>(
    tenantId ? `/api/admin/tenants/${tenantId}` : null,
    fetcher
  );

  const actorRole = data?.actorRole || "USER";
  const isSuperAdmin = actorRole === "SUPER_ADMIN";
  const isAdmin = actorRole === "OPS_ADMIN";

  const triggerAction = async (kind: "suspend" | "reactivate") => {
    if (!tenantId) return;
    setSavingAction(true);
    setFeedback(null);
    try {
      const endpoint =
        kind === "suspend"
          ? `/api/admin/tenants/${tenantId}/suspend`
          : `/api/admin/tenants/${tenantId}/reactivate`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "suspend" ? JSON.stringify({ reason: reason.trim() || undefined }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || "Action failed."));
      }
      setShowSuspend(false);
      setShowReactivate(false);
      setReason("");
      setFeedback({
        variant: "success",
        message: kind === "suspend" ? "Tenant suspended." : "Tenant reactivated.",
      });
      await mutate();
    } catch (actionError) {
      setFeedback({
        variant: "error",
        message: actionError instanceof Error ? actionError.message : "Action failed.",
      });
    } finally {
      setSavingAction(false);
    }
  };

  const startImpersonation = async () => {
    if (!data?.tenant.id || !impersonationTarget?.userId) return;
    if (isAdmin && !impersonationTarget.hasActiveTenantUser) {
      throw new Error("This tenant has no active USER account to impersonate.");
    }
    setStartingImpersonation(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUserId: impersonationTarget.userId,
          tenantId: data.tenant.id,
          reason: "Support impersonation from tenant detail",
          confirmation: "IMPERSONATE",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || "Unable to start impersonation."));
      }
      const redirectTo = String((payload as { redirectTo?: string })?.redirectTo || "/dashboard");
      setShowImpersonationModal(false);
      router.push(redirectTo);
      router.refresh();
    } catch (impersonationError) {
      setFeedback({
        variant: "error",
        message: impersonationError instanceof Error ? impersonationError.message : "Unable to start impersonation.",
      });
    } finally {
      setStartingImpersonation(false);
    }
  };

  const usageRows = useMemo(
    () =>
      (data?.usage.counters || []).map((counter) => ({
        feature: counter.feature,
        quantity: counter.quantity,
      })),
    [data]
  );

  const userRows = useMemo(
    () =>
      (data?.users || []).map((member) => ({
        id: member.id,
        name: member.user.name || "-",
        email: member.user.email,
        userId: member.user.publicId || member.user.id,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
      })),
    [data]
  );

  const impersonationTarget = useMemo(() => {
    if (!data) return null;
    const activeTenantUser = data.users.find(
      (member) =>
        String(member.status || "").toLowerCase() === "active" &&
        String(member.user.role || "").toUpperCase() === "USER"
    );
    return {
      userId: activeTenantUser?.user.id || data.owner.id,
      hasActiveTenantUser: Boolean(activeTenantUser),
    };
  }, [data]);

  const activityRiskCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: "last-activity",
        title: "Last Activity",
        lines: [
          `Created ${formatDateTimeDMY(new Date(data.tenant.createdAt))}`,
          data.tenant.lastActivityAt
            ? `Last activity ${formatDateTimeDMY(new Date(data.tenant.lastActivityAt))}`
            : "No activity recorded yet.",
        ],
      },
      {
        key: "account-risk",
        title: "Account Risk",
        lines: [
          `Open high-priority tickets: ${data.overview.riskSignals.openHighPriorityTickets}`,
          `Status: ${data.tenant.status}`,
        ],
      },
      {
        key: "integrations",
        title: "Integrations",
        lines: [
          `Paystack subaccount: ${data.overview.integrations.paystackSubaccountCode || "Not connected"}`,
          `Flutterwave subaccount: ${data.overview.integrations.flutterwaveSubaccountId || "Not connected"}`,
          `Payout provider: ${data.overview.integrations.payoutProvider || "Not configured"}`,
        ],
      },
      {
        key: "webhook-failures",
        title: "Webhook Failures",
        lines: [
          `Webhook failures (7d): ${data.overview.riskSignals.webhookFailures7d}`,
          `Webhook health: ${data.billing.webhookHealth}`,
        ],
      },
    ];
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-8 overflow-x-hidden px-6 py-6 max-md:px-4 max-md:py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
          <h1 className="text-[28px] font-semibold text-foreground">Tenant detail</h1>
        </div>
        <Link href="/admin/tenants" className="shrink-0">
          <Button variant="secondary">Back to tenants</Button>
        </Link>
      </div>

      {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
      {error ? <Alert variant="error">{error.message}</Alert> : null}

      <section className="border-b border-border/60 py-6">
        {isLoading || !data ? (
          <div className="space-y-3 pb-2">
            <Skeleton className="h-8 w-1/3 rounded-lg" />
            <Skeleton className="h-5 w-1/2 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-foreground">{data.tenant.name}</h2>
                <Badge variant={statusBadgeVariant(data.tenant.status)}>{data.tenant.status}</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{data.tenant.id}</p>
              <p className="mt-2 break-words text-sm text-muted-foreground">Owner: {data.owner.name || data.owner.email}</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">Owner email: {data.owner.email}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                Plan: {data.subscription.plan || "-"} - Created {formatDateTimeDMY(new Date(data.tenant.createdAt))}
                {data.tenant.lastActivityAt ? ` - Last activity ${formatDateTimeDMY(new Date(data.tenant.lastActivityAt))}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Button onClick={() => setShowImpersonationModal(true)} loading={startingImpersonation}>
                Impersonate
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  document.getElementById("tenant-logs")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View audit events
              </Button>
              {isSuperAdmin ? (
                data.tenant.status === "SUSPENDED" ? (
                  <Button onClick={() => setShowReactivate(true)}>Reactivate</Button>
                ) : (
                  <Button variant="danger" onClick={() => setShowSuspend(true)}>
                    Suspend
                  </Button>
                )
              ) : null}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-12 items-start gap-8">
        <div className="col-span-12 space-y-10 overflow-x-hidden lg:col-span-8">
          <section className="space-y-4">
            <div className="border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">Activity & Risk</h3>
            </div>
            {isLoading || !data ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {activityRiskCards.map((card) => (
                  <div key={card.key} className="space-y-1 text-sm">
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    {card.lines.map((line) => (
                      <p key={line} className="break-words font-medium text-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="tenant-users" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">Users</h3>
              <Link
                href="/admin/users"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
              >
                View all users →
              </Link>
            </div>
            {isLoading || !data ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <Table
                data={userRows}
                keyExtractor={(row) => row.id}
                columns={[
                  { key: "name", label: "Name" },
                  { key: "email", label: "Email" },
                  { key: "userId", label: "User ID" },
                  { key: "role", label: "Role" },
                  { key: "status", label: "Status" },
                  {
                    key: "joinedAt",
                    label: "Joined",
                    render: (row) => (row.joinedAt ? formatDateDMY(new Date(row.joinedAt)) : "-"),
                  },
                ]}
              />
            )}
          </section>

          <section id="tenant-usage" className="space-y-4">
            <div className="space-y-1 border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">Usage</h3>
              {!isLoading && data ? (
                <p className="text-sm text-muted-foreground">
                  Period: {formatDateDMY(new Date(data.usage.periodStart))} - {formatDateDMY(new Date(data.usage.periodEnd))}
                </p>
              ) : null}
            </div>
            {isLoading || !data ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <div className="space-y-3">
                {usageRows.map((row) => (
                  <div key={row.feature} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm">
                    <span className="text-muted-foreground">{usageFeatureLabels[row.feature] || row.feature}</span>
                    <span className="font-semibold text-foreground">{row.quantity.toLocaleString()}</span>
                  </div>
                ))}
                {data.usage.channelTotals ? (
                  <div className="pt-2 text-sm text-muted-foreground">
                    <p>Billing period: {data.usage.channelTotals.billingPeriod}</p>
                    <p>Email messages sent: {data.usage.channelTotals.emailMessagesSent}</p>
                    <p>WhatsApp messages sent: {data.usage.channelTotals.whatsappMessagesSent}</p>
                    <p>Total messages sent: {data.usage.channelTotals.totalMessagesSent}</p>
                  </div>
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground">Usage counters are not available yet for this tenant.</p>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="space-y-8 rounded-xl bg-muted/30 p-6 lg:sticky lg:top-6">
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Subscription</h3>
              {isLoading || !data ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center justify-between gap-3">
                    <span>Plan</span>
                    <span className="font-medium text-foreground">{data.subscription.plan || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>Status</span>
                    <span className="font-medium text-foreground">{data.subscription.status || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>Billing interval</span>
                    <span className="font-medium text-foreground">{data.subscription.billingInterval || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>Current cycle</span>
                    <span className="text-right font-medium text-foreground">
                      {data.subscription.currentCycleStartAt && data.subscription.currentCycleEndAt
                        ? `${formatDateDMY(new Date(data.subscription.currentCycleStartAt))} - ${formatDateDMY(
                            new Date(data.subscription.currentCycleEndAt)
                          )}`
                        : "-"}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>Provider</span>
                    <span className="font-medium text-foreground">{data.billing.provider || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>Webhook health</span>
                    <span className="font-medium text-foreground">{data.billing.webhookHealth}</span>
                  </p>
                </div>
              )}
            </section>

            <section id="tenant-logs" className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Logs</h3>
              {isLoading || !data ? (
                <Skeleton className="h-44 rounded-lg" />
              ) : data.logs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No logs for this tenant yet.
                </p>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {data.logs.map((entry) => (
                    <div key={`${entry.source}-${entry.id}`} className="space-y-1 rounded-lg border border-border/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-semibold text-foreground">{entry.action}</p>
                        <Badge variant={entry.source === "audit" ? "roleUser" : "warning"}>
                          {entry.source}
                        </Badge>
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        {formatDateTimeDMY(new Date(entry.createdAt))}
                        {entry.actorUserId ? ` - actor ${entry.actorUserId}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>

      <Modal open={showSuspend} onClose={() => !savingAction && setShowSuspend(false)} title="Suspend tenant">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This tenant will be blocked from login and API access until reactivated.
          </p>
          <Input
            label="Reason (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Policy, abuse, compliance..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSuspend(false)}>
              Cancel
            </Button>
            <Button onClick={() => triggerAction("suspend")} loading={savingAction}>
              Suspend tenant
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showReactivate} onClose={() => !savingAction && setShowReactivate(false)} title="Reactivate tenant">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reactivating will restore tenant login and API access immediately.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReactivate(false)}>
              Cancel
            </Button>
            <Button onClick={() => triggerAction("reactivate")} loading={savingAction}>
              Reactivate tenant
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmImpersonationModal
        open={showImpersonationModal}
        onClose={() => {
          if (startingImpersonation) return;
          setShowImpersonationModal(false);
        }}
        onConfirm={startImpersonation}
        tenantName={data?.tenant.name || "Unknown tenant"}
      />
    </div>
  );
}
