import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { OrgSubscriptionStatus, PaymentStatus, SupportThreadStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { formatDateTimeDMY } from "@/lib/date";
import { getActorSystemFlagRole } from "@/lib/system-flags";

type AdminSearchParams = {
  tenant?: string;
  range?: string;
};

type RevenuePoint = { name: string; value: number };

type RiskItem = {
  id: string;
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  context: string;
  href: string;
};

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const dayMs = 24 * 60 * 60 * 1000;

function withDaysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * dayMs);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toShortDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

function parseRange(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized in RANGE_DAYS) return normalized;
  return "30d";
}

function toPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function formatResponseTime(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function metricText(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function buildRevenueSeries(payments: Array<{ createdAt: Date; amount: number }>, days: number): RevenuePoint[] {
  const today = startOfUtcDay(new Date());
  const firstDay = withDaysAgo(today, days - 1);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(firstDay.getTime() + i * dayMs);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const payment of payments) {
    const key = startOfUtcDay(payment.createdAt).toISOString().slice(0, 10);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) || 0) + payment.amount);
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    name: toShortDay(new Date(`${key}T00:00:00.000Z`)),
    value: Number(value.toFixed(2)),
  }));
}

function systemHealthStatus(input: {
  webhookFailures24h: number;
  automationErrors24h: number;
  failedPayments30d: number;
  slaBreaches: number;
}) {
  const incident =
    input.webhookFailures24h >= 20 ||
    input.automationErrors24h >= 20 ||
    input.failedPayments30d >= 30 ||
    input.slaBreaches >= 10;
  if (incident) {
    return {
      label: "Incident",
      tone: "border-rose-200 bg-rose-50/85 dark:border-rose-500/40 dark:bg-rose-500/10",
      statusTextClass: "text-rose-700 dark:text-rose-300",
      statusDotClass: "bg-rose-500",
    };
  }
  const degraded =
    input.webhookFailures24h >= 5 ||
    input.automationErrors24h >= 8 ||
    input.failedPayments30d >= 10 ||
    input.slaBreaches >= 3;
  if (degraded) {
    return {
      label: "Degraded",
      tone: "border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
      statusTextClass: "text-amber-700 dark:text-amber-300",
      statusDotClass: "bg-amber-600",
    };
  }
  return {
    label: "Healthy",
    tone: "border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    statusTextClass: "text-emerald-700 dark:text-emerald-300",
    statusDotClass: "bg-emerald-600",
  };
}

function buildRiskItems(input: {
  webhookFailures24h: number;
  automationErrors24h: number;
  failedPayments30d: number;
  supportBreaches: number;
  openSupportTickets: number;
}): RiskItem[] {
  const items: RiskItem[] = [];
  if (input.webhookFailures24h >= 3) {
    items.push({
      id: "webhook",
      title: "Webhook retry spike detected",
      severity: input.webhookFailures24h >= 10 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.webhookFailures24h)} failures in the last 24 hours.`,
      href: "/admin/logs",
    });
  }
  if (input.automationErrors24h >= 5) {
    items.push({
      id: "automation",
      title: "Automation failures increasing",
      severity: input.automationErrors24h >= 15 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.automationErrors24h)} failed runs in 24 hours.`,
      href: "/admin/automation/errors",
    });
  }
  if (input.failedPayments30d >= 5) {
    items.push({
      id: "payments",
      title: "Failed subscription payments rising",
      severity: input.failedPayments30d >= 20 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.failedPayments30d)} failed subscription charges in 30 days.`,
      href: "/admin/users",
    });
  }
  if (input.supportBreaches >= 1) {
    items.push({
      id: "sla",
      title: "Support SLA breaches detected",
      severity: input.supportBreaches >= 8 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.supportBreaches)} tickets breached first-response SLA.`,
      href: "/admin/support",
    });
  }
  if (input.openSupportTickets >= 20) {
    items.push({
      id: "support-volume",
      title: "Open support volume elevated",
      severity: "LOW",
      context: `${metricText(input.openSupportTickets)} open tickets currently in queue.`,
      href: "/admin/support",
    });
  }

  const severityRank: Record<RiskItem["severity"], number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return items
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 5);
}

function actionLabel(actionType: string) {
  const key = String(actionType || "").toUpperCase();
  const labels: Record<string, string> = {
    SUBSCRIPTION_UPGRADED: "Tenant upgraded plan",
    SUBSCRIPTION_DOWNGRADED: "Tenant downgraded plan",
    SUBSCRIPTION_DOWNGRADE_SCHEDULED: "Subscription downgrade scheduled",
    SUBSCRIPTION_DOWNGRADE_CANCELED: "Subscription downgrade canceled",
    SUBSCRIPTION_DOWNGRADE_APPLIED: "Subscription downgrade applied",
    SUBSCRIPTION_PENDING_DOWNGRADES_APPLIED: "Pending downgrades job ran",
    SUBSCRIPTION_DOWNGRADE_SKIPPED_PROVIDER_MANAGED: "Provider-managed downgrade skipped",
    SUBSCRIPTION_CANCELED: "Subscription canceled",
    SUBSCRIPTION_CANCEL_SCHEDULED: "Subscription cancel scheduled",
    SUBSCRIPTION_RENEWAL_RESUMED: "Subscription renewal resumed",
    "TENANT.SUSPENDED": "Tenant suspended",
    "TENANT.REACTIVATED": "Tenant reactivated",
    BUSINESS_SETTINGS_UPDATED: "Business settings updated",
    PAYOUT_SETTINGS_UPDATED: "Payout settings changed",
    MEMBER_REMOVED: "Member removed",
    MEMBER_PROMOTED_TO_ADMIN: "Member promoted to admin",
    ADMIN_DEMOTED_TO_MEMBER: "Admin demoted to member",
    INVITE_CREATED: "Team invite created",
    INVITE_ACCEPTED: "Team invite accepted",
  };
  return labels[key] || actionType;
}

function hrefWithParams(params: { tenantId?: string | null; range: string; nextRange?: string }) {
  const query = new URLSearchParams();
  if (params.tenantId) query.set("tenant", params.tenantId);
  query.set("range", params.nextRange || params.range);
  return `/admin?${query.toString()}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams | Promise<AdminSearchParams>;
}) {
  const session = await getServerSession(authOptions);
  const actorRole = session?.user?.id ? await getActorSystemFlagRole(session.user.id) : "USER";
  if (!session?.user || (actorRole !== "OPS_ADMIN" && actorRole !== "SUPER_ADMIN")) {
    redirect("/dashboard");
  }

  const resolved = await Promise.resolve(searchParams);
  const selectedRange = parseRange(resolved?.range);
  const rangeDays = RANGE_DAYS[selectedRange];
  const requestedTenant = String(resolved?.tenant || "").trim();

  const tenants = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
    orderBy: { name: "asc" },
  });

  const selectedTenant = tenants.find((tenant) => tenant.id === requestedTenant) || null;
  const scopedTenantIds = selectedTenant ? [selectedTenant.id] : tenants.map((tenant) => tenant.id);
  const scopedOwnerIds = selectedTenant
    ? [selectedTenant.ownerId]
    : Array.from(new Set(tenants.map((tenant) => tenant.ownerId)));
  const hasTenantScope = scopedTenantIds.length > 0;
  const hasOwnerScope = scopedOwnerIds.length > 0;

  const now = new Date();
  const last24h = withDaysAgo(now, 1);
  const last30d = withDaysAgo(now, 30);
  const last60d = withDaysAgo(now, 60);
  const last90d = withDaysAgo(now, 90);
  const rangeStart = withDaysAgo(now, rangeDays);
  const slaCutoff = withDaysAgo(now, 1);

  const [
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    activeSubscribers,
    openSupportTickets,
    rateLimitSpikes24h,
    supportBreaches,
    respondedTickets,
    successfulPayments90d,
    canceledEvents30d,
    timelineEvents,
  ] = await Promise.all([
    hasTenantScope
      ? prisma.unifiedAuditEvent.count({
          where: {
            tenantId: { in: scopedTenantIds },
            actionType: { startsWith: "webhook.failure" },
            createdAt: { gte: last24h },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.automationRun.count({
          where: {
            runStatus: "FAILED",
            createdAt: { gte: last24h },
            flow: { businessId: { in: scopedTenantIds } },
          },
        })
      : 0,
    hasOwnerScope
      ? prisma.payment.count({
          where: {
            userId: { in: scopedOwnerIds },
            status: PaymentStatus.FAILED,
            createdAt: { gte: last30d },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.orgSubscription.count({
          where: {
            orgId: { in: scopedTenantIds },
            status: OrgSubscriptionStatus.ACTIVE,
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.count({
          where: {
            workspaceId: { in: scopedTenantIds },
            status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.auditLog.count({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: "USAGE_LIMIT_EXCEEDED",
            createdAt: { gte: last24h },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.count({
          where: {
            workspaceId: { in: scopedTenantIds },
            status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
            firstResponseAt: null,
            createdAt: { lte: slaCutoff },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.findMany({
          where: {
            workspaceId: { in: scopedTenantIds },
            firstResponseAt: { not: null },
            createdAt: { gte: last30d },
          },
          select: {
            createdAt: true,
            firstResponseAt: true,
          },
          take: 500,
        })
      : [],
    hasOwnerScope
      ? prisma.payment.findMany({
          where: {
            userId: { in: scopedOwnerIds },
            status: PaymentStatus.SUCCEEDED,
            createdAt: { gte: last90d },
          },
          select: {
            createdAt: true,
            amount: true,
            amountUsd: true,
            currency: true,
          },
        })
      : [],
    hasTenantScope
      ? prisma.auditLog.count({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: "SUBSCRIPTION_CANCELED",
            createdAt: { gte: last30d },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.auditLog.findMany({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: {
              in: [
                "SUBSCRIPTION_UPGRADED",
                "SUBSCRIPTION_DOWNGRADED",
                "SUBSCRIPTION_CANCELED",
                "tenant.suspended",
                "tenant.reactivated",
                "ADMIN_FLAG_UPDATE",
                "BUSINESS_SETTINGS_UPDATED",
                "PAYOUT_SETTINGS_UPDATED",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orgId: true,
            actionType: true,
            createdAt: true,
            metadata: true,
          },
        })
      : [],
  ]);

  const revenuePoints = successfulPayments90d.map((payment) => ({
    createdAt: payment.createdAt,
    amount: Number(payment.amountUsd ?? payment.amount ?? 0),
  }));

  const currentRangeRevenue = revenuePoints
    .filter((point) => point.createdAt >= rangeStart)
    .reduce((sum, point) => sum + point.amount, 0);
  const currentMrrRevenue = revenuePoints
    .filter((point) => point.createdAt >= last30d)
    .reduce((sum, point) => sum + point.amount, 0);
  const previousMrrRevenue = revenuePoints
    .filter((point) => point.createdAt >= last60d && point.createdAt < last30d)
    .reduce((sum, point) => sum + point.amount, 0);
  const growth30d = previousMrrRevenue > 0 ? ((currentMrrRevenue - previousMrrRevenue) / previousMrrRevenue) * 100 : currentMrrRevenue > 0 ? 100 : 0;
  const churnRate = (canceledEvents30d / Math.max(activeSubscribers + canceledEvents30d, 1)) * 100;
  const revenueSeries = buildRevenueSeries(
    revenuePoints.filter((point) => point.createdAt >= rangeStart),
    rangeDays
  );

  const avgResponseMinutes = respondedTickets.length
    ? respondedTickets.reduce((sum, ticket) => {
        const firstResponseAt = ticket.firstResponseAt ? ticket.firstResponseAt.getTime() : ticket.createdAt.getTime();
        return sum + Math.max(0, firstResponseAt - ticket.createdAt.getTime()) / (1000 * 60);
      }, 0) / respondedTickets.length
    : null;

  const risks = buildRiskItems({
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    supportBreaches,
    openSupportTickets,
  });
  const hasHighRisk = risks.some((risk) => risk.severity === "HIGH");

  const status = systemHealthStatus({
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    slaBreaches: supportBreaches,
  });

  const metrics = [
    {
      label: "Webhook failures (24h)",
      value: metricText(webhookFailures24h),
      href: "/admin/logs",
    },
    {
      label: "Automation errors (24h)",
      value: metricText(automationErrors24h),
      href: "/admin/automation/errors",
    },
    {
      label: "Failed subscription payments (30d)",
      value: metricText(failedPayments30d),
      href: "/admin/users",
    },
    {
      label: "Active subscribers",
      value: metricText(activeSubscribers),
      href: "/admin/users",
    },
    {
      label: "Open support tickets",
      value: metricText(openSupportTickets),
      href: "/admin/support",
    },
    {
      label: "Rate limit spikes (24h)",
      value: metricText(rateLimitSpikes24h),
      href: "/admin/logs",
    },
  ];

  const riskSection = (
    <section className="rounded-2xl border border-border/70 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Risks & alerts</h2>
        <Link href="/admin/logs">
          <Button size="sm" variant="secondary">
            View Logs
          </Button>
        </Link>
      </div>
      {risks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Platform stable — no active risks.</p>
      ) : (
        <div className="space-y-3">
          {risks.map((risk) => (
            <Link
              key={risk.id}
              href={risk.href}
              className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-4 py-3 transition hover:bg-muted/35"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{risk.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{risk.context}</p>
              </div>
              <Badge
                variant={
                  risk.severity === "HIGH" ? "danger" : risk.severity === "MEDIUM" ? "warning" : "default"
                }
              >
                {risk.severity}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  const tenantOptions = tenants.map((tenant) => (
    <option key={tenant.id} value={tenant.id}>
      {tenant.name}
    </option>
  ));

  return (
    <div className="space-y-6 px-6 py-6 max-md:px-4 max-md:py-4">
      <section className={`rounded-2xl border p-6 ${status.tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Admin Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Command Center</h1>
            <p className="mt-2 text-sm text-muted-foreground">Executive platform signal for stability, risk, and subscriber health.</p>
          </div>
          <form method="GET" className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tenant scope</label>
              <select
                name="tenant"
                defaultValue={selectedTenant?.id || "all"}
                className="h-10 min-w-[220px] rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground"
              >
                <option value="all">All tenants</option>
                {tenantOptions}
              </select>
            </div>
            <input type="hidden" name="range" value={selectedRange} />
            <Button size="sm" type="submit">
              Apply
            </Button>
          </form>
        </div>

        <div className={`mt-5 flex items-center gap-3 text-2xl font-semibold ${status.statusTextClass}`}>
          <span className={`h-3 w-3 rounded-full ${status.statusDotClass}`} aria-hidden="true" />
          <span>{status.label}</span>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="rounded-lg border border-transparent px-3 py-2 transition hover:border-border/50 hover:bg-background/50"
            >
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{metric.value}</p>
            </Link>
          ))}
        </div>
      </section>

      {hasHighRisk ? riskSection : null}

      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Revenue snapshot</h2>
            <p className="text-sm text-muted-foreground">Subscriber revenue only (Paystack + Flutterwave).</p>
          </div>
          <div className="inline-flex rounded-lg border border-border/70 bg-muted/20 p-1">
            {(["7d", "30d", "90d"] as const).map((rangeOption) => (
              <Link key={rangeOption} href={hrefWithParams({ tenantId: selectedTenant?.id, range: selectedRange, nextRange: rangeOption })}>
                <span
                  className={`inline-flex rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    selectedRange === rangeOption
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  {rangeOption.toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 border-b border-border/60 pb-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">MRR</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(currentMrrRevenue, "USD")}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">30-day growth</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{toPercent(growth30d)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active subscribers</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{metricText(activeSubscribers)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Churn rate</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{toPercent(churnRate)}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Revenue in selected range: <span className="font-semibold text-foreground">{formatCurrency(currentRangeRevenue, "USD")}</span>
          </p>
          <MiniAreaChart data={revenueSeries} />
        </div>
      </section>

      {!hasHighRisk ? riskSection : null}

      <section className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Support snapshot</h2>
            <Link href="/admin/support">
              <Button size="sm" variant="secondary">
                View Support
              </Button>
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Open tickets</span>
              <span className="font-semibold text-foreground">{metricText(openSupportTickets)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Tickets breaching SLA</span>
              <span className="font-semibold text-foreground">{metricText(supportBreaches)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Average response time</span>
              <span className="font-semibold text-foreground">{formatResponseTime(avgResponseMinutes)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Critical activity</h2>
            <Link href="/admin/logs">
              <Button size="sm" variant="secondary">
                View Audit Logs
              </Button>
            </Link>
          </div>
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No critical events in the selected scope.</p>
          ) : (
            <div className="space-y-3">
              {timelineEvents.map((event) => (
                <div key={event.id} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold text-foreground">{actionLabel(event.actionType || event.id)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTimeDMY(event.createdAt)}
                    {event.orgId ? ` · tenant ${event.orgId}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
