import { OrgSubscriptionStatus, SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAuthPlaneContextFromRequestContext } from "@/lib/admin/impersonation";
import { isPlatformRole } from "@/lib/global-role";
import { normalizeOrgRole, type OrgRole } from "@/lib/org-permissions";
import { computeUsageCycleKey } from "@/lib/usage/cycle";
import { ensureOrgSubscriptionCycleCurrent, usageFeatureFromDb } from "@/lib/usage/ledger";
import {
  getReportPlanLimits,
  isUnlimitedPlan,
  normalizeSubscriptionPlan,
  UsageFeatureKeyApi,
} from "@/lib/usage/plan-limits";

type UsageTrendPoint = { date: string; value: number };

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
    defaultFeature: "ai_requests" | "invoices" | "whatsapp_messages" | "automations_runs";
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

const ORG_ROLE_PRIORITY: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  billing_admin: 2,
  member: 1,
};

const METERED_FEATURES: UsageFeatureKeyApi[] = [
  "ai_requests",
  "invoices",
  "whatsapp_messages",
  "automations_runs",
];

const ALL_FEATURES: UsageFeatureKeyApi[] = [...METERED_FEATURES, "team_members_seats"];

function titleForFeature(feature: UsageFeatureKeyApi) {
  switch (feature) {
    case "ai_requests":
      return "AI Usage";
    case "invoices":
      return "Invoices";
    case "whatsapp_messages":
      return "WhatsApp Messages";
    case "automations_runs":
      return "Automations";
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
    case "whatsapp_messages":
      return "Messages sent this cycle";
    case "automations_runs":
      return "Successful automation runs this cycle";
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
  const authPlane = await resolveAuthPlaneContextFromRequestContext({
    actorUserId: userId,
  });
  const actorIsPlatform = isPlatformRole(authPlane.actorGlobalRole);
  const scopedUserId = authPlane.effectiveUserId;
  const scopedOrgId = authPlane.effectiveTenantId;

  const owned = await prisma.business.findFirst({
    where: { ownerId: scopedUserId, ...(scopedOrgId ? { id: scopedOrgId } : {}) },
    select: {
      id: true,
      ownerId: true,
      accessStatus: true,
      orgSubscription: { select: { status: true } },
    },
  });
  if (owned) {
    return {
      orgId: owned.id,
      ownerUserId: owned.ownerId,
      orgAccessStatus: owned.accessStatus,
      orgSubscriptionStatus: owned.orgSubscription?.status ?? "NONE",
    };
  }

  const members = await prisma.businessMember.findMany({
    where: {
      userId: scopedUserId,
      status: "active",
      ...(scopedOrgId ? { businessId: scopedOrgId } : {}),
    },
    select: {
      role: true,
      createdAt: true,
      business: {
        select: {
          id: true,
          ownerId: true,
          accessStatus: true,
          orgSubscription: { select: { status: true } },
        },
      },
    },
  });

  if (!members.length) {
    if (actorIsPlatform) return null;
    return null;
  }

  const member = members
    .slice()
    .sort((a, b) => {
      const roleDelta =
        ORG_ROLE_PRIORITY[normalizeOrgRole(b.role)] - ORG_ROLE_PRIORITY[normalizeOrgRole(a.role)];
      if (roleDelta !== 0) return roleDelta;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

  if (!member?.business) return null;

  return {
    orgId: member.business.id,
    ownerUserId: member.business.ownerId,
    orgAccessStatus: member.business.accessStatus,
    orgSubscriptionStatus: member.business.orgSubscription?.status ?? "NONE",
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
    whatsapp_messages: dayKeys.map((date) => ({ date, value: 0 })),
    automations_runs: dayKeys.map((date) => ({ date, value: 0 })),
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
    if (feature === "team_members_seats") continue;
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
      featureKey: { in: ["AI_REQUESTS", "INVOICES", "WHATSAPP_MESSAGES", "AUTOMATIONS_RUNS"] },
    },
    orderBy: { occurredAt: "asc" },
    select: { featureKey: true, occurredAt: true, quantity: true },
  });

  for (const row of events) {
    const feature = usageFeatureFromDb(row.featureKey);
    const day = toDateKey(row.occurredAt);
    const index = indexByDay.get(day);
    if (index == null || feature === "team_members_seats") continue;
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
    totalsByFeature.set(usageFeatureFromDb(row.featureKey), Number(row.usedQuantity) || 0);
  }

  const seatsUsed = await countActiveSeats(orgAccess.orgId);
  const cards: CardSnapshot[] = ALL_FEATURES.map((feature) => {
    const featureLimit = limits[feature];
    const featureUnlimited = unlimitedPlan || featureLimit == null;
    const used = feature === "team_members_seats" ? seatsUsed : totalsByFeature.get(feature) ?? 0;

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
  const recentEvents = await prisma.usageEvent.findMany({
    where: { orgId: orgAccess.orgId, cycleKey },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: { occurredAt: true, featureKey: true, quantity: true },
  });
  const recentActivity = recentEvents.map((event) => {
    const feature = usageFeatureFromDb(event.featureKey);
    return {
      date: event.occurredAt.toISOString(),
      featureKey: feature,
      amount: Number(event.quantity) || 0,
      type: "usage" as const,
      status: "recorded" as const,
      label: titleForFeature(feature),
    };
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
      defaultFeature: "ai_requests",
      series,
    },
    recentActivity,
  };
}
