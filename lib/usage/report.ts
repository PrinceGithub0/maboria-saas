import { OrgSubscriptionStatus, SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAuthPlaneContextFromRequestContext } from "@/lib/admin/impersonation";
import { isPlatformRole } from "@/lib/global-role";
import { resolveOrgContext } from "@/lib/org-auth";
import { computeUsageCycleKey } from "@/lib/usage/cycle";
import { ensureOrgSubscriptionCycleCurrent, usageFeatureFromDb } from "@/lib/usage/ledger";
import {
  getReportPlanLimits,
  isUnlimitedPlan,
  normalizeSubscriptionPlan,
  UsageFeatureKeyApi,
} from "@/lib/usage/plan-limits";
import { getWorkspaceConnectionUsage } from "@/lib/workspace-connections";

type UsageTrendPoint = { date: string; value: number };
type MeteredUsageFeatureKey = "ai_requests" | "invoices" | "automations_runs";

type CardSnapshot = {
  featureKey: UsageFeatureKeyApi;
  title: string;
  subtitle: string;
  unlimited: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  actions: {
    viewDetailsUrl: string;
    exportUrl: string;
  };
};

export type UsageReportSnapshot = {
  orgId: string;
  plan: {
    id: SubscriptionPlan;
    status: "active" | "past_due" | "canceled" | "trialing";
    billingInterval: "monthly" | "yearly";
    apiAccessEnabled: boolean;
    unlimited: boolean;
  };
  cycle: {
    key: string;
    startAt: string;
    endAt: string;
  };
  cards: CardSnapshot[];
  trend: {
    defaultFeature: MeteredUsageFeatureKey;
    series: Record<UsageFeatureKeyApi, UsageTrendPoint[]>;
  };
  recentActivity: Array<{
    date: string;
    featureKey: UsageFeatureKeyApi;
    amount: number;
    type: "usage";
    status: "recorded";
    label: string;
  }>;
};

export type UsageReportOrgAccess = {
  orgId: string;
  ownerUserId: string;
  orgAccessStatus: "ACTIVE" | "SUSPENDED" | "DISABLED";
  orgSubscriptionStatus: OrgSubscriptionStatus | "NONE";
};

const METERED_FEATURES: MeteredUsageFeatureKey[] = [
  "ai_requests",
  "invoices",
  "automations_runs",
];

export function pickDefaultTrendFeature(input: {
  totalsByFeature: Map<UsageFeatureKeyApi, number>;
  series: Record<UsageFeatureKeyApi, UsageTrendPoint[]>;
}): MeteredUsageFeatureKey {
  for (const feature of METERED_FEATURES) {
    const total = Number(input.totalsByFeature.get(feature) ?? 0);
    if (total > 0) return feature;
  }

  for (const feature of METERED_FEATURES) {
    if (input.series[feature]?.some((point) => Number(point.value) > 0)) {
      return feature;
    }
  }

  return "ai_requests";
}

const ALL_FEATURES: UsageFeatureKeyApi[] = [...METERED_FEATURES, "workspace_connections", "team_members_seats"];

function titleForFeature(feature: UsageFeatureKeyApi) {
  switch (feature) {
    case "ai_requests":
      return "AI Usage";
    case "invoices":
      return "Invoices";
    case "automations_runs":
      return "Automations";
    case "workspace_connections":
      return "Connections";
    case "team_members_seats":
      return "Team Members";
    default:
      return "Usage";
  }
}

function subtitleForFeature(feature: UsageFeatureKeyApi) {
  switch (feature) {
    case "ai_requests":
      return "Requests used this cycle";
    case "invoices":
      return "Invoices sent this cycle";
    case "automations_runs":
      return "Successful automation runs this cycle";
    case "workspace_connections":
      return "Connected inbox channels in use";
    case "team_members_seats":
      return "Seats in use";
    default:
      return "Usage";
  }
}

function percentUsed(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Number(((used / limit) * 100).toFixed(2));
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function resolveUsageReportAccess(userId: string): Promise<UsageReportOrgAccess | null> {
  const orgContext = await resolveOrgContext(userId);
  if (orgContext) {
    return {
      orgId: orgContext.orgId,
      ownerUserId: orgContext.ownerUserId,
      orgAccessStatus: orgContext.orgAccessStatus,
      orgSubscriptionStatus: orgContext.orgSubscriptionStatus,
    };
  }

  const authPlane = await resolveAuthPlaneContextFromRequestContext({
    actorUserId: userId,
  });
  if (!isPlatformRole(authPlane.actorGlobalRole)) return null;
  const scopedUserId = authPlane.effectiveUserId;
  const scopedOrgId = authPlane.effectiveTenantId;
  if (!scopedUserId || !scopedOrgId) return null;

  const owned = await prisma.business.findFirst({
    where: { ownerId: scopedUserId, id: scopedOrgId },
    select: {
      id: true,
      ownerId: true,
      accessStatus: true,
      orgSubscription: { select: { status: true } },
    },
  });
  if (!owned) return null;

  return {
    orgId: owned.id,
    ownerUserId: owned.ownerId,
    orgAccessStatus: owned.accessStatus,
    orgSubscriptionStatus: owned.orgSubscription?.status ?? "NONE",
  };
}

function buildDaysInCycle(start: Date, end: Date) {
  const dayKeys: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dayKeys.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dayKeys;
}

function startOfNextUtcDay(date: Date) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function ensureCycleTotals(orgId: string, cycleKey: string) {
  let totals = await prisma.usageCycleTotal.findMany({
    where: { orgId, cycleKey },
    select: { featureKey: true, usedQuantity: true },
  });

  if (totals.length) {
    return totals;
  }

  const grouped = await prisma.usageEvent.groupBy({
    by: ["featureKey"],
    where: { orgId, cycleKey },
    _sum: { quantity: true },
  });
  if (!grouped.length) return [];

  await prisma.$transaction(
    grouped.map((row) =>
      prisma.usageCycleTotal.upsert({
        where: {
          orgId_featureKey_cycleKey: {
            orgId,
            featureKey: row.featureKey,
            cycleKey,
          },
        },
        update: { usedQuantity: Number(row._sum.quantity ?? 0) },
        create: {
          orgId,
          featureKey: row.featureKey,
          cycleKey,
          usedQuantity: Number(row._sum.quantity ?? 0),
        },
      })
    )
  );

  totals = await prisma.usageCycleTotal.findMany({
    where: { orgId, cycleKey },
    select: { featureKey: true, usedQuantity: true },
  });
  return totals;
}

async function countActiveSeats(orgId: string) {
  return prisma.businessMember.count({
    where: {
      businessId: orgId,
      status: "active",
    },
  });
}

function cardDetailsUrl(feature: UsageFeatureKeyApi) {
  if (feature === "workspace_connections") return "/dashboard/inbox";
  if (feature === "team_members_seats") return "/dashboard/team";
  return "/dashboard/report";
}

function cardExportUrl(feature: UsageFeatureKeyApi) {
  return `/api/analytics/usage/export?feature=${feature}&cycle=current`;
}

async function buildTrendSeries(orgId: string, cycleKey: string, cycleStart: Date, cycleEnd: Date) {
  const dayKeys = buildDaysInCycle(cycleStart, cycleEnd);
  const series: Record<UsageFeatureKeyApi, UsageTrendPoint[]> = {
    ai_requests: dayKeys.map((date) => ({ date, value: 0 })),
    invoices: dayKeys.map((date) => ({ date, value: 0 })),
    automations_runs: dayKeys.map((date) => ({ date, value: 0 })),
    workspace_connections: [],
    team_members_seats: [],
  };
  const indexByDay = new Map(dayKeys.map((value, index) => [value, index]));

  const rollups = await prisma.usageDailyRollup.findMany({
    where: {
      orgId,
      cycleKey,
      day: { gte: cycleStart, lt: cycleEnd },
    },
    orderBy: { day: "asc" },
    select: { featureKey: true, day: true, totalQuantity: true },
  });

  for (const row of rollups) {
    const feature = usageFeatureFromDb(row.featureKey);
    if (feature === "team_members_seats" || feature === "whatsapp_messages") continue;
    const day = toDateKey(row.day);
    const index = indexByDay.get(day);
    if (index == null) continue;
    series[feature][index].value = Number(row.totalQuantity) || 0;
  }

  const isEmpty = METERED_FEATURES.every((feature) => series[feature].every((point) => point.value === 0));
  if (!isEmpty) return series;

  const events = await prisma.usageEvent.findMany({
    where: {
      orgId,
      cycleKey,
      occurredAt: { gte: cycleStart, lt: cycleEnd },
      featureKey: { in: ["AI_REQUESTS", "INVOICES", "AUTOMATIONS_RUNS"] },
    },
    orderBy: { occurredAt: "asc" },
    select: { featureKey: true, occurredAt: true, quantity: true },
  });

  for (const row of events) {
    const feature = usageFeatureFromDb(row.featureKey);
    const day = toDateKey(row.occurredAt);
    const index = indexByDay.get(day);
    if (index == null || feature === "team_members_seats" || feature === "whatsapp_messages") continue;
    series[feature][index].value += Number(row.quantity) || 0;
  }
  return series;
}

function toPlanStatus(value: string) {
  switch (value) {
    case "PAST_DUE":
      return "past_due" as const;
    case "CANCELED":
      return "canceled" as const;
    case "TRIALING":
      return "trialing" as const;
    case "ACTIVE":
    default:
      return "active" as const;
  }
}

export async function getUsageReportSnapshot(
  userId: string,
  access?: UsageReportOrgAccess | null
): Promise<UsageReportSnapshot> {
  const orgAccess = access ?? (await resolveUsageReportAccess(userId));
  if (!orgAccess) {
    throw new Error("Organization not found");
  }
  if (orgAccess.orgAccessStatus !== "ACTIVE") {
    throw new Error("Organization access is not active");
  }
  if (orgAccess.orgSubscriptionStatus !== "ACTIVE") {
    throw new Error("Organization subscription inactive");
  }

  const now = new Date();
  const { subscription, cycleStartAt, cycleEndAt } = await ensureOrgSubscriptionCycleCurrent(
    orgAccess.orgId,
    orgAccess.ownerUserId,
    now
  );
  const cycleKey = computeUsageCycleKey(cycleStartAt, cycleEndAt);
  const planId = normalizeSubscriptionPlan(subscription.planId);
  const unlimitedPlan = isUnlimitedPlan(planId);
  const limits = getReportPlanLimits(planId);

  const totals = await ensureCycleTotals(orgAccess.orgId, cycleKey);
  const totalsByFeature = new Map<UsageFeatureKeyApi, number>();
  for (const row of totals) {
    const feature = usageFeatureFromDb(row.featureKey);
    if (feature === "whatsapp_messages") continue;
    totalsByFeature.set(feature, Number(row.usedQuantity) || 0);
  }

  const connectionUsage = await getWorkspaceConnectionUsage(orgAccess.orgId);
  const seatsUsed = await countActiveSeats(orgAccess.orgId);
  const cards: CardSnapshot[] = ALL_FEATURES.map((feature) => {
    const featureLimit = limits[feature];
    const featureUnlimited = unlimitedPlan || featureLimit == null;
    const used =
      feature === "workspace_connections"
        ? connectionUsage.used
        : feature === "team_members_seats"
          ? seatsUsed
          : totalsByFeature.get(feature) ?? 0;

    if (featureUnlimited) {
      return {
        featureKey: feature,
        title: titleForFeature(feature),
        subtitle: subtitleForFeature(feature),
        unlimited: true,
        used,
        limit: null,
        remaining: null,
        percentUsed: null,
        actions: {
          viewDetailsUrl: cardDetailsUrl(feature),
          exportUrl: cardExportUrl(feature),
        },
      };
    }

    const limit = Number(featureLimit ?? 0);
    return {
      featureKey: feature,
      title: titleForFeature(feature),
      subtitle: subtitleForFeature(feature),
      unlimited: false,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      percentUsed: percentUsed(used, limit),
      actions: {
        viewDetailsUrl: cardDetailsUrl(feature),
        exportUrl: cardExportUrl(feature),
      },
    };
  });

  const chartEndExclusive = cycleEndAt < now ? cycleEndAt : startOfNextUtcDay(now);
  const series = await buildTrendSeries(orgAccess.orgId, cycleKey, cycleStartAt, chartEndExclusive);
  const defaultFeature = pickDefaultTrendFeature({ totalsByFeature, series });
  const recentEvents = await prisma.usageEvent.findMany({
    where: { orgId: orgAccess.orgId, cycleKey },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: { occurredAt: true, featureKey: true, quantity: true },
  });
  const recentActivity = recentEvents.flatMap((event) => {
    const feature = usageFeatureFromDb(event.featureKey);
    if (feature === "whatsapp_messages") return [];
    return [
      {
        date: event.occurredAt.toISOString(),
        featureKey: feature,
        amount: Number(event.quantity) || 0,
        type: "usage" as const,
        status: "recorded" as const,
        label: titleForFeature(feature),
      },
    ];
  });

  return {
    orgId: orgAccess.orgId,
    plan: {
      id: planId,
      status: toPlanStatus(subscription.status),
      billingInterval: subscription.billingInterval === "YEARLY" ? "yearly" : "monthly",
      apiAccessEnabled: Boolean(subscription.apiAccessEnabled) && planId === "ENTERPRISE",
      unlimited: unlimitedPlan,
    },
    cycle: {
      key: cycleKey,
      startAt: cycleStartAt.toISOString(),
      endAt: cycleEndAt.toISOString(),
    },
    cards,
    trend: {
      defaultFeature,
      series,
    },
    recentActivity,
  };
}
