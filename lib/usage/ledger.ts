import {
  OrgBillingInterval,
  OrgSubscriptionStatus,
  PaymentProvider,
  Prisma,
  SubscriptionStatus,
  UsageEventSource,
  UsageFeatureKey,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addCalendarMonthUtcKeepingTime,
  clampAnchorDay,
  computeCurrentUsageCycle,
  computeUsageCycleKey,
} from "@/lib/usage/cycle";
import { normalizeSubscriptionPlan } from "@/lib/usage/plan-limits";

export type UsageFeatureApiKey =
  | "ai_requests"
  | "invoices"
  | "whatsapp_messages"
  | "automations_runs"
  | "team_members_seats";

const featureMapToDb: Record<UsageFeatureApiKey, UsageFeatureKey> = {
  ai_requests: "AI_REQUESTS",
  invoices: "INVOICES",
  whatsapp_messages: "WHATSAPP_MESSAGES",
  automations_runs: "AUTOMATIONS_RUNS",
  team_members_seats: "TEAM_MEMBERS_SEATS",
};

const featureMapFromDb: Record<UsageFeatureKey, UsageFeatureApiKey> = {
  AI_REQUESTS: "ai_requests",
  INVOICES: "invoices",
  WHATSAPP_MESSAGES: "whatsapp_messages",
  AUTOMATIONS_RUNS: "automations_runs",
  TEAM_MEMBERS_SEATS: "team_members_seats",
};

function mapSubscriptionStatus(status: SubscriptionStatus | null | undefined): OrgSubscriptionStatus {
  switch (status) {
    case "PAST_DUE":
      return "PAST_DUE";
    case "TRIALING":
      return "TRIALING";
    case "CANCELED":
    case "INACTIVE":
    case "REVOKED":
      return "CANCELED";
    case "ACTIVE":
    default:
      return "ACTIVE";
  }
}

function mapBillingInterval(interval?: string | null): OrgBillingInterval {
  return String(interval || "").toLowerCase() === "yearly" ? "YEARLY" : "MONTHLY";
}

export function buildUsageIdempotencyKey(prefix: string, actionId: string) {
  return `${prefix}:${actionId}`;
}

export function usageFeatureToDb(key: UsageFeatureApiKey): UsageFeatureKey {
  return featureMapToDb[key];
}

export function usageFeatureFromDb(key: UsageFeatureKey): UsageFeatureApiKey {
  return featureMapFromDb[key];
}

export async function getOrCreateOrgSubscription(orgId: string, ownerId: string) {
  const existing = await prisma.orgSubscription.findUnique({ where: { orgId } });
  if (existing) return existing;

  const business = await prisma.business.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  const latestSub = await prisma.subscription.findFirst({
    where: { userId: ownerId },
    orderBy: { createdAt: "desc" },
  });

  const activationTimestamp =
    latestSub?.currentPeriodStart ??
    latestSub?.createdAt ??
    new Date();
  const cycle = computeCurrentUsageCycle({ activationTimestamp });
  const usageCycleAnchorDay = clampAnchorDay(activationTimestamp.getUTCDate());
  const planFromBusinessOrSub = latestSub?.plan ?? business?.plan ?? "STARTER";
  const normalizedPlan = normalizeSubscriptionPlan(planFromBusinessOrSub);

  return prisma.orgSubscription.create({
    data: {
      orgId,
      planId: normalizedPlan,
      status: mapSubscriptionStatus(latestSub?.status),
      billingInterval: mapBillingInterval(latestSub?.interval),
      provider: latestSub?.provider as PaymentProvider | null,
      providerCustomerId: null,
      providerSubscriptionId: latestSub?.id ?? null,
      paidThroughAt: latestSub?.renewalDate ?? null,
      usageCycleAnchorDay,
      activationTimestamp,
      currentCycleStartAt: cycle.startAt,
      currentCycleEndAt: cycle.endAt,
      apiAccessEnabled: normalizedPlan === "ENTERPRISE",
    },
  });
}

export async function ensureOrgSubscriptionCycleCurrent(orgId: string, ownerId: string, now = new Date()) {
  const subscription = await getOrCreateOrgSubscription(orgId, ownerId);
  const business = await prisma.business.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  const latestActiveLike = await prisma.subscription.findFirst({
    where: {
      userId: ownerId,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const latestFallback = latestActiveLike
    ? null
    : await prisma.subscription.findFirst({
        where: { userId: ownerId },
        orderBy: { createdAt: "desc" },
      });
  const latestSub = latestActiveLike ?? latestFallback;
  const latestPlan = normalizeSubscriptionPlan(latestSub?.plan ?? business?.plan ?? subscription.planId);
  const latestStatus = mapSubscriptionStatus(latestSub?.status);
  const latestInterval = mapBillingInterval(latestSub?.interval);

  let start = new Date(subscription.currentCycleStartAt);
  let end = new Date(subscription.currentCycleEndAt);
  let changedCycle = false;

  while (end <= now) {
    start = end;
    end = addCalendarMonthUtcKeepingTime(start, 1);
    changedCycle = true;
  }

  const changedPlanState =
    subscription.planId !== latestPlan ||
    subscription.status !== latestStatus ||
    subscription.billingInterval !== latestInterval ||
    Boolean(subscription.apiAccessEnabled) !== (latestPlan === "ENTERPRISE");

  if (!changedCycle && !changedPlanState) {
    return {
      subscription,
      cycleStartAt: start,
      cycleEndAt: end,
      cycleKey: computeUsageCycleKey(start, end),
    };
  }

  const updated = await prisma.orgSubscription.update({
    where: { orgId },
    data: {
      planId: latestPlan,
      status: latestStatus,
      billingInterval: latestInterval,
      provider: (latestSub?.provider as PaymentProvider | null) ?? subscription.provider,
      providerSubscriptionId: latestSub?.id ?? subscription.providerSubscriptionId,
      paidThroughAt: latestSub?.renewalDate ?? subscription.paidThroughAt,
      apiAccessEnabled: latestPlan === "ENTERPRISE",
      currentCycleStartAt: start,
      currentCycleEndAt: end,
      usageCycleAnchorDay: clampAnchorDay(start.getUTCDate()),
    },
  });

  return {
    subscription: updated,
    cycleStartAt: start,
    cycleEndAt: end,
    cycleKey: computeUsageCycleKey(start, end),
  };
}

type RecordUsageEventInput = {
  orgId: string;
  userId?: string | null;
  featureKey: UsageFeatureApiKey;
  quantity?: number;
  occurredAt?: Date;
  idempotencyKey: string;
  source?: UsageEventSource;
  metadata?: Prisma.InputJsonValue;
};

export async function recordUsageEvent(input: RecordUsageEventInput) {
  const quantity = Math.max(0, Math.floor(input.quantity ?? 1));
  if (quantity <= 0) {
    return { created: false, reason: "quantity_zero" as const };
  }

  const org = await prisma.business.findUnique({
    where: { id: input.orgId },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    throw new Error("Organization not found");
  }
  const { subscription: orgSub } = await ensureOrgSubscriptionCycleCurrent(org.id, org.ownerId);

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const cycle = computeCurrentUsageCycle({
    activationTimestamp: orgSub.activationTimestamp,
    now: occurredAt,
  });
  const cycleKey = computeUsageCycleKey(cycle.startAt, cycle.endAt);
  const day = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()));

  const featureKey = usageFeatureToDb(input.featureKey);
  const payload = {
    orgId: org.id,
    userId: input.userId ?? null,
    featureKey,
    quantity,
    occurredAt,
    cycleKey,
    idempotencyKey: input.idempotencyKey,
    source: input.source ?? "APP",
    metadata: input.metadata ?? undefined,
  } as const;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({ data: payload });
      await tx.usageCycleTotal.upsert({
        where: {
          orgId_featureKey_cycleKey: {
            orgId: org.id,
            featureKey,
            cycleKey,
          },
        },
        update: { usedQuantity: { increment: quantity } },
        create: {
          orgId: org.id,
          featureKey,
          cycleKey,
          usedQuantity: quantity,
        },
      });
      await tx.usageDailyRollup.upsert({
        where: {
          orgId_featureKey_day_cycleKey: {
            orgId: org.id,
            featureKey,
            day,
            cycleKey,
          },
        },
        update: { totalQuantity: { increment: quantity } },
        create: {
          orgId: org.id,
          featureKey,
          day,
          cycleKey,
          totalQuantity: quantity,
        },
      });
    });
    return { created: true as const, cycleKey };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { created: false as const, reason: "duplicate" as const, cycleKey };
    }
    throw error;
  }
}
